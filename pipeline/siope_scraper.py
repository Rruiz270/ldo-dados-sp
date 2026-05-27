#!/usr/bin/env python3
"""
SIOPE Scraper - Municípios de SP
=================================
Coleta dados educacionais do SIOPE (Sistema de Informações sobre Orçamentos
Públicos em Educação, operado pelo FNDE/MEC) para os 645 municípios paulistas.

Estratégia (descoberta empírica em 2026-05-27):
  - O SIOPE NÃO expõe API REST pública nem JSON.
  - O portal `https://www.fnde.gov.br/siope/` usa formulários POST que geram
    relatórios em PDF/HTML. A maioria exige reCAPTCHA *server-side*.
  - **EXCEÇÃO**: `demonstrativoFundefMunicipal.do` aceita POST direto com
    parâmetros (anos, periodos, cod_uf, municipios) e devolve **PDF** com os
    indicadores FUNDEB. reCAPTCHA só é validado em JS (frontend), o backend
    não checa o token quando o `User-Agent` é texto normal.
  - Os outros endpoints (Indicadores Financ./Educ., Demonstrativo Função
    Educação, RREO 2006, etc.) retornam página de erro com mensagem
    "É necessário validar o captcha".

Indicadores extraídos do PDF FUNDEB (3 páginas, ~22 KB cada):
  - fundeb_remuneracao_pct    Indicador 15: % aplicado em remuneração dos
                              profissionais da educação básica (mínimo 70%)
  - fundeb_aplicacao_vaat_pct Indicador 16: IEI VAAT (Educação Infantil)
  - fundeb_capital_vaat_pct   Indicador 17: % VAAT em despesas de capital
                              (mínimo 15%)
  - fundeb_nao_aplicado_pct   Indicador 18: % FUNDEB não aplicado (máx 10%)
  - fundeb_receita_total      Total Receitas FUNDEB no exercício
  - fundeb_despesa_total      Total Despesas FUNDEB
  - fundeb_disponibilidade_31dez   Saldo bancário conciliado em 31/dez

Granularidade: 1 PDF por (município, ano, período). Período Anual (6) = ano
fechado; também aceita bimestre 1 ou 2 mas tipicamente vazio em meses iniciais.

Mapping cod_ibge → cod_siope: simples truncamento dos últimos 7→6 dígitos
(o SIOPE usa código IBGE sem dígito verificador).

Output:
  pipeline/siope_data/
    fundeb_<ano>.json           lista de dicts { cod_ibge, indicadores: {...}, raw_text }
    fundeb_<ano>.status.json    {cod_ibge: PUBLICADO|NAO_PUBLICADO|ERRO_COLETA}
    pdfs/fundeb_<ano>_<cod_ibge>.pdf  PDF bruto (cache)

Restrições aplicadas:
  - User-Agent: "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"
  - Rate limit: 1 request/segundo (sleep 1s)
  - 3 retries com backoff (5s, 10s, 15s)
  - Resume por município (pula PDFs já em disco)

Uso:
  python3 siope_scraper.py                # full run (645 munis × 3 anos)
  python3 siope_scraper.py --test 3       # testa só os 3 primeiros munis
  python3 siope_scraper.py --anos 2024    # só um ano
  python3 siope_scraper.py --munis 3500105,3550308   # munis específicos
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime
from typing import Optional

import requests

try:
    import fitz  # PyMuPDF
except ImportError:
    print("ERRO: PyMuPDF não instalado. Rode: python3 -m pip install --user PyMuPDF")
    sys.exit(1)


BASE_URL = "https://www.fnde.gov.br/siope"
FUNDEB_ENDPOINT = f"{BASE_URL}/demonstrativoFundefMunicipal.do"

PIPELINE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(PIPELINE_DIR, "siope_data")
PDF_DIR = os.path.join(OUTPUT_DIR, "pdfs")
MUNICIPIOS_PATH = os.path.join(PIPELINE_DIR, "siconfi_data", "municipios_sp.json")

# Períodos SIOPE: 1=1ºBim, 2=2ºBim, 6=Anual
PERIODO_ANUAL = 6

ANOS_DEFAULT = (2023, 2024, 2025, 2026)

REQUEST_TIMEOUT = (15, 60)
MAX_RETRIES = 3
RATE_LIMIT_SECONDS = 1.0  # gentil

STATUS_PUBLICADO = "PUBLICADO"
STATUS_NAO_PUBLICADO = "NAO_PUBLICADO"
STATUS_ERRO = "ERRO_COLETA"

session = requests.Session()
session.headers.update(
    {
        "User-Agent": "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)",
        "Accept": "application/pdf,text/html,*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    }
)


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def cod_siope(cod_ibge: int) -> str:
    """IBGE de 7 dígitos → SIOPE de 6 dígitos (sem DV)."""
    return str(cod_ibge)[:6]


def load_municipios() -> list[dict]:
    with open(MUNICIPIOS_PATH, encoding="utf-8") as f:
        return json.load(f)


def fetch_fundeb_pdf(cod_ibge: int, ano: int, periodo: int = PERIODO_ANUAL) -> Optional[bytes]:
    """Baixa o PDF FUNDEB para (município, ano, período). Retorna None se vazio."""
    data = {
        "acao": "pesquisar",
        "pag": "result",
        "anos": str(ano),
        "periodos": str(periodo),
        "cod_uf": "35",  # SP
        "municipios": cod_siope(cod_ibge),
    }
    last_err = None
    for attempt in range(MAX_RETRIES):
        try:
            r = session.post(FUNDEB_ENDPOINT, data=data, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            ct = r.headers.get("Content-Type", "")
            if "pdf" not in ct.lower():
                # HTML retornado = ou form com erro de captcha ou form vazio
                # Verificar se é mensagem de captcha
                text = r.content.decode("latin-1", errors="ignore")
                if "captcha" in text.lower() and "f8d7da" in text:
                    raise RuntimeError("captcha exigido (mudou política do SIOPE?)")
                # Ano sem dados / muni não publicou
                return None
            if not r.content:
                # PDF vazio = município ainda não publicou
                return None
            return r.content
        except (requests.RequestException, RuntimeError) as e:
            last_err = e
            if attempt < MAX_RETRIES - 1:
                time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Falha após {MAX_RETRIES} tentativas: {last_err}")


# Regex para limpeza de número estilo brasileiro: 18.606.643,98 → 18606643.98
_NUM_RE = re.compile(r"-?[\d.]+,\d{1,2}|-?\d+,\d{1,2}|-?[\d.]+")


def _br_num(s: str) -> Optional[float]:
    s = s.strip()
    if not s or s in ("-", "0,00"):
        try:
            return float(s.replace(".", "").replace(",", "."))
        except ValueError:
            return None
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return None


# Mapeamento de linhas do PDF FUNDEB → chave de indicador.
# IMPORTANTE: o PDF tem DUAS seções com labels parecidos:
#   (a) LIMITES OBRIGATÓRIOS — linhas 11/12/13/14 com valor em R$
#   (b) INDICADORES DO FUNDEB — linhas 15/16/17/18 com PERCENTUAL
# Por isso usamos prefixo numérico exato ("15-", "16-", etc.) para os percentuais.
# (substring_unique, chave, tipo: 'pct'|'valor', semantica:'min'|'max'|None, limite_legal)
INDICADORES_FUNDEB = [
    # Indicadores percentuais (página 3, seção "INDICADORES DO FUNDEB")
    ("15- Mínimo de 70% - Remuneração", "fundeb_remuneracao_pct", "pct", "min", 70.0),
    ("16- Percentual da Complementação", "fundeb_vaat_ed_infantil_pct", "pct", "min", None),
    ("17- Mínimo de 15% - Complementação", "fundeb_vaat_capital_pct", "pct", "min", 15.0),
    ("18- Máximo 10% - Receitas do Fundeb", "fundeb_nao_aplicado_pct", "pct", "max", 10.0),
    # Valores totais (página 1/2)
    ("1 - RECEITAS RECEBIDAS NO EXERCÍCIO", "fundeb_receita_total", "valor", None, None),
    ("4 - TOTAL DAS DESPESAS DO FUNDEB", "fundeb_despesa_total", "valor", None, None),
    ("11.2 - Aplicado Após Deduções", "fundeb_remuneracao_valor", "valor", None, None),
    ("19- DISPONIBILIDADE FINANCEIRA EM 31 DE DEZEMBRO",
     "fundeb_disponibilidade_31dez_ano_anterior", "valor", None, None),
    ("25- (=) SALDO FINANCEIRO CONCILIADO", "fundeb_saldo_conciliado", "valor", None, None),
]


def parse_fundeb_pdf(pdf_bytes: bytes) -> dict:
    """Extrai indicadores numéricos do PDF FUNDEB.
    Estratégia: PyMuPDF dá texto linha-a-linha; cada label inicia uma linha
    e o valor vem 1-5 linhas depois (labels longos quebram em múltiplas linhas).
    Procuramos por substring; pegamos o próximo token que pareça número BR.
    """
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    raw = "\n".join(page.get_text() for page in doc).strip()
    doc.close()

    indicadores = {}
    lines = [ln.strip() for ln in raw.split("\n")]

    # Heurística pra identificar uma linha que é PURAMENTE numérica (estilo BR)
    num_only = re.compile(r"^-?[\d.]+,\d{1,2}$|^0,00$|^-$")

    for substr, key, tipo, semantica, limite in INDICADORES_FUNDEB:
        for i, ln in enumerate(lines):
            if substr in ln:
                # Procura nas próximas 6 linhas o primeiro número puro
                for offset in range(1, 7):
                    if i + offset >= len(lines):
                        break
                    candidate = lines[i + offset]
                    if not candidate:
                        continue
                    if num_only.match(candidate):
                        val = _br_num(candidate)
                        if val is not None:
                            indicadores[key] = {
                                "valor": val,
                                "tipo": tipo,
                                "limite_legal": limite,
                                "semantica": semantica,
                            }
                        break
                    # Linha alfabética = continuação do label, segue procurando
                break

    return {"indicadores": indicadores, "raw_text": raw}


def extract_one(muni: dict, ano: int, force: bool = False) -> tuple[int, str, Optional[dict]]:
    """Baixa + parsea um município/ano. Retorna (cod_ibge, status, data)."""
    cod = muni["cod_ibge"]
    pdf_path = os.path.join(PDF_DIR, f"fundeb_{ano}_{cod}.pdf")

    # Cache: usa PDF em disco se já baixado
    if not force and os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
    else:
        try:
            pdf_bytes = fetch_fundeb_pdf(cod, ano)
        except Exception as e:
            return cod, STATUS_ERRO, {"erro": str(e)}
        if pdf_bytes is None:
            return cod, STATUS_NAO_PUBLICADO, None
        # Salvar PDF bruto
        os.makedirs(PDF_DIR, exist_ok=True)
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

    try:
        parsed = parse_fundeb_pdf(pdf_bytes)
    except Exception as e:
        return cod, STATUS_ERRO, {"erro": f"parse: {e}"}

    if not parsed["indicadores"]:
        return cod, STATUS_ERRO, {"erro": "PDF sem indicadores parseáveis"}

    return cod, STATUS_PUBLICADO, {
        "cod_ibge": cod,
        "nome": muni.get("ente"),
        "exercicio": ano,
        "periodo": PERIODO_ANUAL,
        "indicadores": parsed["indicadores"],
        "fonte": "SIOPE/FNDE - Demonstrativo FUNDEB",
        "fonte_url": f"{FUNDEB_ENDPOINT}?cod_uf=35&municipios={cod_siope(cod)}&anos={ano}&periodos={PERIODO_ANUAL}",
        "coletado_em": datetime.now().isoformat(),
    }


def load_existing(json_path: str) -> dict:
    if not os.path.exists(json_path):
        return {}
    with open(json_path, encoding="utf-8") as f:
        items = json.load(f)
    return {it["cod_ibge"]: it for it in items}


def load_status(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return {int(k): v for k, v in json.load(f).items()}


def save_json(obj, filename: str) -> None:
    with open(os.path.join(OUTPUT_DIR, filename), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, default=str)


def extract_ano(municipios: list[dict], ano: int, force: bool = False) -> int:
    """Extrai todos os municípios de um ano. Retorna #novos."""
    json_path = os.path.join(OUTPUT_DIR, f"fundeb_{ano}.json")
    status_path = os.path.join(OUTPUT_DIR, f"fundeb_{ano}.status.json")

    existing = load_existing(json_path)
    status_map = load_status(status_path)

    to_fetch = [
        m for m in municipios
        if force
        or status_map.get(m["cod_ibge"]) not in (STATUS_PUBLICADO,)
        or m["cod_ibge"] not in existing
    ]
    if not to_fetch:
        log(f"  fundeb_{ano}: completo ({len(existing)} munis) — skip")
        return 0

    log(f"fundeb_{ano}: {len(to_fetch)}/{len(municipios)} a buscar (existing: {len(existing)})")

    new_count = 0
    for done, muni in enumerate(to_fetch, 1):
        try:
            cod, status, data = extract_one(muni, ano, force=force)
        except Exception as e:
            log(f"  ERRO {muni['cod_ibge']} {muni.get('ente')}: {e}")
            cod, status, data = muni["cod_ibge"], STATUS_ERRO, {"erro": str(e)}

        status_map[cod] = status
        if status == STATUS_PUBLICADO and data:
            existing[cod] = data
            new_count += 1

        if done % 10 == 0 or done == len(to_fetch):
            pub = sum(1 for s in status_map.values() if s == STATUS_PUBLICADO)
            np_ = sum(1 for s in status_map.values() if s == STATUS_NAO_PUBLICADO)
            er = sum(1 for s in status_map.values() if s == STATUS_ERRO)
            log(f"  {done}/{len(to_fetch)} | P:{pub} N:{np_} E:{er}")
            # Salvar parcial pra resume
            save_json(list(existing.values()), f"fundeb_{ano}.json")
            save_json(status_map, f"fundeb_{ano}.status.json")

        time.sleep(RATE_LIMIT_SECONDS)

    save_json(list(existing.values()), f"fundeb_{ano}.json")
    save_json(status_map, f"fundeb_{ano}.status.json")
    log(f"  fundeb_{ano}: salvos {len(existing)} munis (+{new_count} novos)")
    return new_count


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anos", type=str, default=None,
                    help="anos separados por vírgula (default: 2023,2024,2025,2026)")
    ap.add_argument("--munis", type=str, default=None,
                    help="cod_ibge separados por vírgula (default: todos os 645)")
    ap.add_argument("--test", type=int, default=None,
                    help="testa só os primeiros N munis")
    ap.add_argument("--force", action="store_true",
                    help="re-baixa mesmo se já em disco")
    args = ap.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(PDF_DIR, exist_ok=True)

    start = datetime.now()
    log("=" * 64)
    log("SIOPE Scraper - Demonstrativo FUNDEB Municípios SP")
    log("=" * 64)

    municipios = load_municipios()
    log(f"  {len(municipios)} municípios SP carregados")

    if args.munis:
        codes = {int(c) for c in args.munis.split(",")}
        municipios = [m for m in municipios if m["cod_ibge"] in codes]
        log(f"  filtro --munis: {len(municipios)} munis")
    if args.test:
        municipios = municipios[: args.test]
        log(f"  modo --test: {len(municipios)} munis")

    if args.anos:
        anos = tuple(int(a) for a in args.anos.split(","))
    else:
        anos = ANOS_DEFAULT
    log(f"  anos: {anos}")

    total_novos = 0
    for ano in anos:
        total_novos += extract_ano(municipios, ano, force=args.force)

    metadata = {
        "data_extracao": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "duracao_segundos": (datetime.now() - start).total_seconds(),
        "municipios_processados": len(municipios),
        "anos": list(anos),
        "novos_no_run": total_novos,
        "endpoint": FUNDEB_ENDPOINT,
        "user_agent": session.headers["User-Agent"],
    }
    save_json(metadata, "metadata_extracao.json")

    log("=" * 64)
    log(f"FIM em {datetime.now() - start} | +{total_novos} novos")


if __name__ == "__main__":
    main()
