#!/usr/bin/env python3
"""
TCE-SP Despesas → programas / ações / órgãos (Neon)
====================================================
Ingere PROGRAMAS e AÇÕES orçamentárias dos 645 municípios de São Paulo a
partir do dataset público "Despesas" do TCE-SP.

Fonte:
  https://transparencia.tce.sp.gov.br/sites/default/files/conjunto-dados/despesas-{ano}.zip
  (mesmo BASE_URL de pipeline/audesp_downloader.py). ~2 GB/ano, atualização semanal.

O ZIP contém um único CSV `despesas-{ano}.csv`:
  - separador `;`, encoding latin-1, quebra de linha `\\r\\n`
  - cada linha = um lançamento de despesa (empenho/liquidação/pagamento)
  - colunas relevantes:
      ano_exercicio, codigo_municipio_ibge, ds_orgao, tp_despesa,
      vl_despesa (decimal com vírgula), ds_funcao_governo,
      ds_subfuncao_governo, cd_programa, ds_programa, cd_acao, ds_acao

STREAMING — nunca carrega os 2 GB em memória nem (por padrão) em disco:
  - HTTP GET com stream=True;
  - o corpo do ZIP é descomprimido on-the-fly com zlib (deflate raw) lendo o
    local file header do primeiro membro e alimentando os chunks de rede no
    decompressobj;
  - o texto descomprimido é parseado linha a linha com csv.reader.

Agregação em memória: apenas o DISTINCT de (município, programa, ação) +
a soma do empenho por ação. São poucos milhares de programas/ações por
município — cabe folgado em memória mesmo para os 645 de uma vez.

UPSERT idempotente:
  - programas(cod_ibge, exercicio, codigo, nome, area)  UNIQUE(cod_ibge, exercicio, codigo)
  - acoes(programa_id, codigo, nome, empenhado)          UNIQUE(programa_id, codigo)
  - orgaos(cod_ibge, nome, tipo='executivo')             UNIQUE(cod_ibge, nome, tipo)

`acoes.empenhado` é uma coluna aditiva criada na migration 0010.

Uso:
  python3 tce_despesas_programas.py --ano 2025
  python3 tce_despesas_programas.py --ano 2025 --sample 50000   # valida só N linhas
  python3 tce_despesas_programas.py --ano 2025 --dry-run        # não escreve no banco
"""

import argparse
import csv
import os
import struct
import sys
import zlib
from collections import defaultdict
from datetime import datetime
from io import StringIO

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 não instalado. Rode: python3 -m pip install --user psycopg2-binary")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERRO: requests não instalado. Rode: python3 -m pip install --user requests")
    sys.exit(1)

BASE_URL = "https://transparencia.tce.sp.gov.br/sites/default/files/conjunto-dados"
REQUEST_TIMEOUT = (15, 600)  # connect, read

# Colunas que projetamos (nomes do header do CSV)
COLS = [
    "ano_exercicio",
    "codigo_municipio_ibge",
    "ds_orgao",
    "tp_despesa",
    "vl_despesa",
    "ds_funcao_governo",
    "ds_subfuncao_governo",
    "cd_programa",
    "ds_programa",
    "cd_acao",
    "ds_acao",
]

session = requests.Session()
session.headers.update(
    {"User-Agent": "FundebSP-Tracker/1.0 (raphael.ruiz@betteredu.com.br)"}
)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def get_database_url():
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    for envpath in (
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env.local"),
        "/Users/raphaelruiz/ldo-dados-sp/.env.local",
    ):
        if os.path.exists(envpath):
            with open(envpath) as f:
                for line in f:
                    if line.startswith("DATABASE_URL="):
                        return line.split("=", 1)[1].strip().strip('"').strip("'")
    print("ERRO: DATABASE_URL não definido (env ou .env.local)")
    sys.exit(1)


def parse_valor(s):
    """'6375,21' -> 6375.21 ; vazio -> 0.0"""
    s = (s or "").strip()
    if not s:
        return 0.0
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


# --------------------------------------------------------------------
# Streaming do ZIP (um único membro deflate) sem materializar 2 GB
# --------------------------------------------------------------------

def iter_zip_member_lines(url, max_bytes_buffer=1024 * 256):
    """
    Faz GET streaming do ZIP remoto e itera as LINHAS (str latin-1->str) do
    primeiro (e único) membro CSV, descomprimindo on-the-fly.

    Lê o local file header para localizar o início do stream deflate e o nome
    do membro; depois alimenta cada chunk de rede num zlib.decompressobj(-15).
    """
    with session.get(url, stream=True, timeout=REQUEST_TIMEOUT) as r:
        r.raise_for_status()
        chunks = r.iter_content(chunk_size=1024 * 512)

        # 1. Acumula bytes suficientes para o local file header completo
        head = b""
        for c in chunks:
            head += c
            if len(head) >= 30:
                fnlen = struct.unpack("<H", head[26:28])[0]
                extralen = struct.unpack("<H", head[28:30])[0]
                if len(head) >= 30 + fnlen + extralen:
                    break

        if head[:4] != b"PK\x03\x04":
            raise ValueError(f"Não é um ZIP válido (assinatura {head[:4]!r})")
        method = struct.unpack("<H", head[8:10])[0]
        fnlen = struct.unpack("<H", head[26:28])[0]
        extralen = struct.unpack("<H", head[28:30])[0]
        fname = head[30:30 + fnlen].decode("latin-1", "replace")
        if method != 8:
            raise ValueError(f"Método de compressão não suportado: {method} (esperado 8/deflate)")
        log(f"  membro do zip: {fname} (deflate)")

        data_start = 30 + fnlen + extralen
        leftover = head[data_start:]

        dec = zlib.decompressobj(-15)  # raw deflate
        buf = ""  # texto descomprimido pendente (sem newline final)

        def feed(comp_bytes):
            nonlocal buf
            raw = dec.decompress(comp_bytes)
            if not raw:
                return
            buf += raw.decode("latin-1")
            # emite linhas completas
            if "\n" in buf:
                parts = buf.split("\n")
                buf = parts.pop()  # último pedaço fica pendente
                for line in parts:
                    yield line.rstrip("\r")

        # processa o que sobrou do header buffer
        for ln in feed(leftover):
            yield ln
        # depois o resto do stream de rede
        for c in chunks:
            if not c:
                continue
            for ln in feed(c):
                yield ln
        # flush final do decompressor
        tail = dec.flush()
        if tail:
            buf += tail.decode("latin-1")
        for line in buf.split("\n"):
            line = line.rstrip("\r")
            if line:
                yield line


# --------------------------------------------------------------------
# Agregação
# --------------------------------------------------------------------

def aggregate(url, ano, valid_ibges, sample=None):
    """
    Itera o CSV e devolve:
      programas[(cod_ibge, cd_programa)] = (ds_programa, area)
      acoes[(cod_ibge, cd_programa, cd_acao)] = [ds_acao, empenhado_sum]
      orgaos[cod_ibge] = set(ds_orgao)
    `valid_ibges` = set dos cod_ibge SP (filtro de segurança).
    """
    programas = {}
    acoes = {}
    orgaos = defaultdict(set)

    line_iter = iter_zip_member_lines(url)
    header_line = next(line_iter)
    reader_header = next(csv.reader(StringIO(header_line), delimiter=";"))
    idx = {name: i for i, name in enumerate(reader_header)}
    missing = [c for c in COLS if c not in idx]
    if missing:
        raise ValueError(f"Colunas ausentes no CSV: {missing}\nHeader: {reader_header}")

    i_ibge = idx["codigo_municipio_ibge"]
    i_org = idx["ds_orgao"]
    i_tp = idx["tp_despesa"]
    i_vl = idx["vl_despesa"]
    i_func = idx["ds_funcao_governo"]
    i_cdp = idx["cd_programa"]
    i_dsp = idx["ds_programa"]
    i_cda = idx["cd_acao"]
    i_dsa = idx["ds_acao"]

    n = 0
    skipped_ibge = 0
    for row in csv.reader(line_iter, delimiter=";"):
        n += 1
        if sample and n > sample:
            log(f"  --sample {sample} atingido; interrompendo leitura")
            break
        if n % 1_000_000 == 0:
            log(f"  ... {n:,} linhas | programas={len(programas):,} acoes={len(acoes):,}")
        if len(row) <= i_dsa:
            continue
        ibge_raw = row[i_ibge].strip()
        if not ibge_raw.isdigit():
            continue
        ibge = int(ibge_raw)
        if ibge not in valid_ibges:
            skipped_ibge += 1
            continue

        cd_prog = row[i_cdp].strip()
        cd_acao = row[i_cda].strip()
        if not cd_prog and not cd_acao:
            continue

        ds_prog = row[i_dsp].strip()
        ds_acao = row[i_dsa].strip()
        ds_org = row[i_org].strip()
        funcao = row[i_func].strip()

        if ds_org:
            orgaos[ibge].add(ds_org)

        kp = (ibge, cd_prog)
        if kp not in programas:
            programas[kp] = (ds_prog, area_from_funcao(funcao))
        elif not programas[kp][0] and ds_prog:
            programas[kp] = (ds_prog, programas[kp][1])

        ka = (ibge, cd_prog, cd_acao)
        rec = acoes.get(ka)
        if rec is None:
            acoes[ka] = [ds_acao, 0.0]
            rec = acoes[ka]
        elif not rec[0] and ds_acao:
            rec[0] = ds_acao

        # só soma empenho na fase "Empenhado"
        if row[i_tp].strip().lower() == "empenhado":
            rec[1] += parse_valor(row[i_vl])

    log(f"  linhas processadas: {n:,} | fora de SP (filtro ibge): {skipped_ibge:,}")
    return programas, acoes, orgaos


# mapeia ds_funcao_governo -> area (best-effort, só para enriquecer programas.area)
_AREA_MAP = {
    "EDUCAÇÃO": "Educação",
    "EDUCACAO": "Educação",
    "SAÚDE": "Saúde",
    "SAUDE": "Saúde",
    "ASSISTÊNCIA SOCIAL": "Assistência Social",
    "ASSISTENCIA SOCIAL": "Assistência Social",
    "LEGISLATIVA": "Legislativa",
    "ADMINISTRAÇÃO": "Administração",
    "ADMINISTRACAO": "Administração",
    "URBANISMO": "Urbanismo",
}


def area_from_funcao(funcao):
    if not funcao:
        return None
    return _AREA_MAP.get(funcao.strip().upper())


# --------------------------------------------------------------------
# UPSERT
# --------------------------------------------------------------------

def upsert(conn, ano, programas, acoes, orgaos):
    cur = conn.cursor()

    # 1. orgaos (tipo='executivo' por padrão — dataset é despesa executada)
    org_rows = [(ibge, nome, "executivo") for ibge, nomes in orgaos.items() for nome in nomes]
    if org_rows:
        psycopg2.extras.execute_values(
            cur,
            """
            INSERT INTO orgaos (cod_ibge, nome, tipo)
            VALUES %s
            ON CONFLICT (cod_ibge, nome, tipo) DO NOTHING
            """,
            org_rows,
            page_size=1000,
        )
    log(f"  orgaos upsert: {len(org_rows):,} linhas")

    # 2. programas — UPSERT e captura dos ids gerados/existentes
    prog_rows = [
        (ibge, ano, cd_prog, (ds[0] or cd_prog or "(sem nome)"), ds[1])
        for (ibge, cd_prog), ds in programas.items()
    ]
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO programas (cod_ibge, exercicio, codigo, nome, area)
        VALUES %s
        ON CONFLICT (cod_ibge, exercicio, codigo)
        DO UPDATE SET nome = EXCLUDED.nome,
                      area = COALESCE(EXCLUDED.area, programas.area)
        """,
        prog_rows,
        page_size=1000,
    )
    log(f"  programas upsert: {len(prog_rows):,} linhas")

    # mapeia (cod_ibge, codigo) -> programa_id para o exercicio corrente
    cur.execute(
        "SELECT id, cod_ibge, codigo FROM programas WHERE exercicio = %s",
        (ano,),
    )
    prog_id = {(c, code): pid for pid, c, code in cur.fetchall()}

    # 3. acoes
    acao_rows = []
    for (ibge, cd_prog, cd_acao), (ds_acao, emp) in acoes.items():
        pid = prog_id.get((ibge, cd_prog))
        if pid is None:
            continue
        acao_rows.append((pid, (cd_acao or "(sem codigo)"), (ds_acao or cd_acao or "(sem nome)"), emp))
    psycopg2.extras.execute_values(
        cur,
        """
        INSERT INTO acoes (programa_id, codigo, nome, empenhado)
        VALUES %s
        ON CONFLICT (programa_id, codigo)
        DO UPDATE SET nome = EXCLUDED.nome,
                      empenhado = EXCLUDED.empenhado
        """,
        acao_rows,
        page_size=1000,
    )
    log(f"  acoes upsert: {len(acao_rows):,} linhas")

    conn.commit()
    cur.close()


def load_sp_ibges(conn):
    cur = conn.cursor()
    cur.execute("SELECT cod_ibge FROM municipios WHERE uf = 'SP'")
    ibges = {r[0] for r in cur.fetchall()}
    cur.close()
    return ibges


def main():
    ap = argparse.ArgumentParser(description="Ingestão de programas/ações TCE-SP (despesas)")
    ap.add_argument("--ano", type=int, required=True, help="Ano de exercício (ex.: 2025)")
    ap.add_argument("--sample", type=int, default=None,
                    help="Processa só as primeiras N linhas do CSV (validação rápida)")
    ap.add_argument("--dry-run", action="store_true",
                    help="Não escreve no banco; só agrega e mostra resumo")
    args = ap.parse_args()

    url = f"{BASE_URL}/despesas-{args.ano}.zip"
    log("=" * 64)
    log(f"TCE-SP Despesas → programas/ações | ano={args.ano} sample={args.sample} dry_run={args.dry_run}")
    log(f"  fonte: {url}")
    log("=" * 64)

    conn = psycopg2.connect(get_database_url())
    valid_ibges = load_sp_ibges(conn)
    log(f"  municípios SP carregados: {len(valid_ibges)}")

    programas, acoes, orgaos = aggregate(url, args.ano, valid_ibges, sample=args.sample)
    log(f"  AGREGADO: {len(programas):,} programas | {len(acoes):,} ações | "
        f"{sum(len(v) for v in orgaos.values()):,} órgãos | {len(orgaos):,} municípios")

    if args.dry_run:
        log("  --dry-run: nada escrito no banco. Amostra:")
        for k in list(programas)[:5]:
            log(f"    programa {k} -> {programas[k]}")
        for k in list(acoes)[:5]:
            log(f"    acao {k} -> {acoes[k]}")
        conn.close()
        return

    upsert(conn, args.ano, programas, acoes, orgaos)
    conn.close()
    log("FIM")


if __name__ == "__main__":
    main()
