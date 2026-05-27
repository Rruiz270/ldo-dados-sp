#!/usr/bin/env python3
"""
Sync PPA/LDO/LOA → Neon (tabela `documentos_legais`).
======================================================

Lê pipeline/leis_data/coverage.json (gerado por ppa_ldo_loa_scraper.py)
e faz UPSERT na tabela documentos_legais. Idempotente.

Conflict key: (cod_ibge, tipo, exercicio, numero_lei). Quando numero_lei é
NULL (frequente — extração heurística falha), usamos a URL como chave de
desambiguação adicional via update-on-url-change.

Documentos são marcados validado=false até revisão manual ou parsing posterior
do PDF (módulo separado, fora do escopo deste sync).

Uso:
  export DATABASE_URL=postgresql://...
  python3 sync_ppa_ldo.py
"""

import json
import os
import sys
from datetime import datetime

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERRO: psycopg2 não instalado. Rode: pip install psycopg2-binary")
    sys.exit(1)

BASE = os.path.dirname(os.path.abspath(__file__))
LEIS_DIR = os.path.join(BASE, "leis_data")
COVERAGE_FILE = os.path.join(LEIS_DIR, "coverage.json")


DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    envpath = os.path.join(os.path.dirname(BASE), ".env.local")
    if os.path.exists(envpath):
        with open(envpath) as f:
            for line in f:
                if line.startswith("DATABASE_URL="):
                    DATABASE_URL = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
if not DATABASE_URL:
    print("ERRO: DATABASE_URL não definido")
    sys.exit(1)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def load_coverage() -> list[dict]:
    if not os.path.exists(COVERAGE_FILE):
        log(f"AVISO: {COVERAGE_FILE} não existe — rode o scraper primeiro")
        return []
    with open(COVERAGE_FILE, encoding="utf-8") as f:
        return json.load(f)


def build_rows(coverage: list[dict]) -> list[tuple]:
    """Transforma docs em linhas pra UPSERT.

    Schema documentos_legais:
      (cod_ibge, tipo, exercicio, inicio_exercicio, fim_exercicio,
       numero_lei, data_lei, url_pdf, texto_completo, resumo, fonte_id,
       extracao_id, validado)
    """
    rows = []
    for d in coverage:
        if d.get("status") != "OK":
            continue
        cod = d["cod_ibge"]
        tipo = d["tipo"]
        ano = d["exercicio"]
        inicio = ano if tipo == "PPA" else None
        fim = (ano + 3) if tipo == "PPA" else None
        # Para LDO/LOA exercicio = vigência. Para PPA, exercicio guarda o ano inicial
        # (compatível com schema atual; sem perda de info).
        numero = d.get("numero_lei")
        # PostgreSQL UNIQUE constraint trata NULLs como diferentes; pra evitar
        # múltiplas linhas com numero=NULL, usamos string vazia como sentinela.
        if not numero:
            numero = ""
        rows.append((
            cod,
            tipo,
            ano,
            inicio,
            fim,
            numero,
            d.get("data_lei"),
            d.get("url_pdf"),
            None,                           # texto_completo (parsing posterior)
            None,                           # resumo (LLM posterior)
            d.get("fonte_id", "PORTAL-LEIS"),
            None,                           # extracao_id (não criamos linhagem aqui)
            False,                          # validado
        ))
    return rows


def upsert_documentos_legais(conn, rows):
    if not rows:
        log("  Nada a inserir (0 docs OK no coverage)")
        return

    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, """
            INSERT INTO documentos_legais (
              cod_ibge, tipo, exercicio,
              inicio_exercicio, fim_exercicio,
              numero_lei, data_lei, url_pdf,
              texto_completo, resumo, fonte_id, extracao_id, validado
            )
            VALUES %s
            ON CONFLICT (cod_ibge, tipo, exercicio, numero_lei) DO UPDATE SET
              data_lei      = COALESCE(EXCLUDED.data_lei, documentos_legais.data_lei),
              url_pdf       = EXCLUDED.url_pdf,
              fonte_id      = EXCLUDED.fonte_id,
              inicio_exercicio = COALESCE(EXCLUDED.inicio_exercicio, documentos_legais.inicio_exercicio),
              fim_exercicio    = COALESCE(EXCLUDED.fim_exercicio, documentos_legais.fim_exercicio)
        """, rows, page_size=200)
    log(f"  documentos_legais: upserted {len(rows)}")


def upsert_extracao_marker(conn, coverage: list[dict]):
    """Registra na tabela `extracoes` um marker do run completo."""
    if not coverage:
        return
    total = len(coverage)
    ok = sum(1 for d in coverage if d.get("status") == "OK")
    blocked = sum(1 for d in coverage if d.get("status") == "BLOQUEADO")
    not_found = sum(1 for d in coverage if d.get("status") == "NAO_ENCONTRADO")
    err = total - ok - blocked - not_found

    status = "OK" if ok > 0 else "PARCIAL"
    if ok == 0:
        status = "ERRO" if err > 0 else "NAO_PUBLICADO"

    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO extracoes (
              fonte_id, dataset, exercicio, status, metadata
            ) VALUES (%s, %s, %s, %s, %s)
        """, (
            "PORTAL-LEIS",
            "ppa_ldo_loa_scrape",
            datetime.now().year,
            status,
            json.dumps({
                "total_tentativas": total,
                "ok": ok,
                "bloqueado": blocked,
                "nao_encontrado": not_found,
                "erro": err,
                "executado_em": datetime.now().isoformat(timespec="seconds"),
            }),
        ))
    log(f"  extracoes: marker registrado (status={status})")


def main():
    start = datetime.now()
    log("=" * 60)
    log("PPA/LDO/LOA → Neon sync")
    log("=" * 60)

    coverage = load_coverage()
    log(f"  {len(coverage)} entradas em coverage.json")
    if not coverage:
        sys.exit(0)

    rows = build_rows(coverage)
    log(f"  {len(rows)} documentos baixados com sucesso")

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    try:
        upsert_documentos_legais(conn, rows)
        upsert_extracao_marker(conn, coverage)
        conn.commit()
        log(f"Commit OK em {datetime.now() - start}")
    except Exception as e:
        conn.rollback()
        log(f"FALHA: {e}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
