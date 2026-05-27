#!/usr/bin/env python3
"""
SICONFI Data Scraper v2 - Municípios de SP
==========================================
Coleta dados fiscais dos 645 municípios paulistas da API pública do Tesouro
(SICONFI: https://apidatalake.tesouro.gov.br/docs/siconfi/).

Mudanças vs v1:
  - Resume PER MUNICÍPIO (não per arquivo). status.json registra
    PUBLICADO / NAO_PUBLICADO / ERRO_COLETA por (município, dataset).
  - Rate limit honesto: 2 workers + 0.5s gap (~4 req/s real; limite oficial é 1/s).
    Backoff em HTTP 429.
  - Suporte ao RGF com params completos (in_periodicidade, co_poder).
  - Paginação automática via hasMore / offset.
  - Range estendido: RREO 2024-2026, DCA 2024-2025, RGF 2024-2026.
  - Auto-skip de períodos cujo prazo legal ainda não venceu (não desperdiça
    requests em RREO bim6/2026 em maio).
"""

import csv
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests

BASE_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "siconfi_data")

RREO_ANEXOS = [
    "RREO-Anexo 01",   # Balanço Orçamentário
    "RREO-Anexo 02",   # Despesas por Função/Subfunção
    "RREO-Anexo 03",   # Receita Corrente Líquida
    "RREO-Anexo 04",   # Receitas/Despesas Previdenciárias
    "RREO-Anexo 06",   # Resultado Primário
    "RREO-Anexo 07",   # Restos a Pagar
    "RREO-Anexo 08",   # Manutenção e Desenvolvimento do Ensino (MDE) ← NOVO
    "RREO-Anexo 12",   # Saúde — Aplicação Mínima Constitucional ← NOVO
    "RREO-Anexo 13",   # Parcerias Público-Privadas
    "RREO-Anexo 14",   # Demonstrativo Simplificado
]
DCA_ANEXOS = [
    "DCA-Anexo I-AB",
    "DCA-Anexo I-C",
    "DCA-Anexo I-D",
    "DCA-Anexo I-E",
    "DCA-Anexo I-F",
    "DCA-Anexo I-G",
    "DCA-Anexo I-HI",
]
RGF_ANEXOS = [
    "RGF-Anexo 01",   # Despesa com Pessoal
    "RGF-Anexo 02",   # Dívida Consolidada Líquida
    "RGF-Anexo 03",   # Garantias e Contragarantias
    "RGF-Anexo 04",   # Operações de Crédito
    "RGF-Anexo 05",   # Restos a Pagar
    "RGF-Anexo 06",   # Demonstrativo Simplificado
]
ANEXOS_BY_KIND = {"rreo": RREO_ANEXOS, "dca": DCA_ANEXOS, "rgf": RGF_ANEXOS}

EXTRACTIONS = []
for ano in (2023, 2024, 2025, 2026):
    for bim in range(1, 7):
        EXTRACTIONS.append(("rreo", ano, bim, {}))
for ano in (2023, 2024, 2025):
    EXTRACTIONS.append(("dca", ano, None, {}))
for ano in (2023, 2024, 2025, 2026):
    for q in range(1, 4):
        EXTRACTIONS.append(("rgf", ano, q, {"in_periodicidade": "Q", "co_poder": "E"}))

REQUEST_TIMEOUT = 60
MAX_RETRIES = 3
WORKERS = 2
ANEXO_GAP = 0.5

STATUS_PUBLICADO = "PUBLICADO"
STATUS_NAO_PUBLICADO = "NAO_PUBLICADO"
STATUS_ERRO = "ERRO_COLETA"

session = requests.Session()
session.headers.update(
    {"User-Agent": "FundebSP-Tracker/1.0 (raphael.ruiz@betteredu.com.br)"}
)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def fname_prefix(kind, ano, periodo):
    if kind == "rreo":
        return f"rreo_{ano}_bim{periodo}"
    if kind == "rgf":
        return f"rgf_{ano}_q{periodo}"
    return f"dca_{ano}"


def is_extraction_due(kind, ano, periodo, today=None):
    """Estima se o prazo LRF de publicação já passou. Evita queimar requests
    em períodos manifestamente futuros (e.g. RREO bim6/2026 em maio/2026).

    Prazos LRF (Lei 101/2000):
      RREO: 30 dias após fim do bimestre
      RGF : 30 dias após fim do quadrimestre
      DCA : 30/abr do ano seguinte
    """
    today = today or datetime.now()
    if kind == "dca":
        return today >= datetime(ano + 1, 4, 30)
    fim_mes = periodo * 2 if kind == "rreo" else periodo * 4
    dy, dm = ano, fim_mes + 1
    if dm > 12:
        dy += 1
        dm -= 12
    return today >= datetime(dy, dm, 30)


def api_get_all_pages(endpoint, params):
    """GET com paginação + retry. Retorna (items, error_str_or_None)."""
    items, offset = [], 0
    while True:
        page_params = {**params, "offset": offset}
        last_err = None
        for attempt in range(MAX_RETRIES):
            try:
                r = session.get(
                    f"{BASE_URL}/{endpoint}",
                    params=page_params,
                    timeout=REQUEST_TIMEOUT,
                )
                if r.status_code == 429:
                    time.sleep(5 * (attempt + 1))
                    continue
                r.raise_for_status()
                payload = r.json()
                page = payload.get("items", [])
                items.extend(page)
                if not payload.get("hasMore"):
                    return items, None
                offset += len(page) or 1
                break
            except Exception as e:
                last_err = str(e)
                if attempt < MAX_RETRIES - 1:
                    time.sleep(3 * (attempt + 1))
        if last_err:
            return items, last_err


def fetch_muni(kind, muni, ano, periodo, extras):
    """Busca todos os anexos do dataset para um município.
    Retorna (cod_ibge, items, status)."""
    cod = muni["cod_ibge"]
    items, last_err = [], None
    for anexo in ANEXOS_BY_KIND[kind]:
        params = {"an_exercicio": ano, "no_anexo": anexo, "id_ente": cod}
        if kind == "rreo":
            params.update(nr_periodo=periodo, co_tipo_demonstrativo="RREO")
        elif kind == "rgf":
            params.update(nr_periodo=periodo, co_tipo_demonstrativo="RGF")
        params.update(extras)
        page_items, err = api_get_all_pages(kind, params)
        items.extend(page_items)
        if err:
            last_err = err
        time.sleep(ANEXO_GAP)

    if last_err and not items:
        return cod, [], STATUS_ERRO
    if not items:
        return cod, [], STATUS_NAO_PUBLICADO
    return cod, items, STATUS_PUBLICADO


def load_existing(json_path):
    """Carrega arquivo consolidado e retorna {cod_ibge: [items]}."""
    if not os.path.exists(json_path):
        return {}
    with open(json_path, "r", encoding="utf-8") as f:
        items = json.load(f)
    by_cod = {}
    for it in items:
        by_cod.setdefault(it["cod_ibge"], []).append(it)
    return by_cod


def load_status(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        return {int(k): v for k, v in json.load(f).items()}


def save_json(obj, filename):
    with open(os.path.join(OUTPUT_DIR, filename), "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def save_csv(items, filename):
    if not items:
        return
    keys = list(items[0].keys())
    with open(os.path.join(OUTPUT_DIR, filename), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(items)


def get_sp_municipalities():
    cache = os.path.join(OUTPUT_DIR, "municipios_sp.json")
    if os.path.exists(cache):
        with open(cache, "r", encoding="utf-8") as f:
            return json.load(f)
    log("Buscando lista de municípios SP via /entes ...")
    items, _ = api_get_all_pages("entes", {})
    sp = sorted(
        [e for e in items if e.get("uf") == "SP" and e.get("esfera") == "M"],
        key=lambda x: x.get("ente", ""),
    )
    save_json(sp, "municipios_sp.json")
    save_csv(sp, "municipios_sp.csv")
    log(f"  {len(sp)} municípios SP")
    return sp


def extract_one(municipalities, kind, ano, periodo, extras):
    prefix = fname_prefix(kind, ano, periodo)
    json_path = os.path.join(OUTPUT_DIR, f"{prefix}.json")
    status_path = os.path.join(OUTPUT_DIR, f"{prefix}.status.json")

    existing = load_existing(json_path)
    status_map = load_status(status_path)

    # Quem buscar:
    #   - PUBLICADO + dados em arquivo → skip
    #   - NAO_PUBLICADO → retry (pode ter publicado desde)
    #   - ERRO_COLETA  → retry
    #   - sem entrada  → buscar
    to_fetch = [
        m for m in municipalities
        if not (status_map.get(m["cod_ibge"]) == STATUS_PUBLICADO
                and m["cod_ibge"] in existing)
    ]

    if not to_fetch:
        log(f"  {prefix}: completo ({len(existing)} munis) - skip")
        return 0

    log(f"{prefix}: {len(to_fetch)}/{len(municipalities)} a buscar (existing: {len(existing)})")

    new_count = done = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_muni, kind, m, ano, periodo, extras): m
                   for m in to_fetch}
        for fut in as_completed(futures):
            done += 1
            cod, items, status = fut.result()
            status_map[cod] = status
            if items:
                existing[cod] = items
                new_count += 1
            if done % 25 == 0 or done == len(to_fetch):
                pub = sum(1 for s in status_map.values() if s == STATUS_PUBLICADO)
                np_ = sum(1 for s in status_map.values() if s == STATUS_NAO_PUBLICADO)
                er = sum(1 for s in status_map.values() if s == STATUS_ERRO)
                log(f"  {done}/{len(to_fetch)} | P:{pub} N:{np_} E:{er}")

    all_items = [it for v in existing.values() for it in v]
    save_json(all_items, f"{prefix}.json")
    save_csv(all_items, f"{prefix}.csv")
    save_json(status_map, f"{prefix}.status.json")

    log(f"  {prefix}: salvos {len(all_items)} records / {len(existing)} munis / +{new_count} novos")
    return new_count


def write_coverage_summary(municipalities):
    """Agrega status de todas as extrações em coverage.json (1 entrada/munic.)."""
    summary = {
        m["cod_ibge"]: {
            "cod_ibge": m["cod_ibge"],
            "nome": m.get("ente"),
            "pop": m.get("populacao"),
        }
        for m in municipalities
    }
    for kind, ano, periodo, _ in EXTRACTIONS:
        prefix = fname_prefix(kind, ano, periodo)
        sm = load_status(os.path.join(OUTPUT_DIR, f"{prefix}.status.json"))
        for cod, st in sm.items():
            if cod in summary:
                summary[cod][prefix] = st
    save_json(list(summary.values()), "coverage.json")


def main():
    start = datetime.now()
    log("=" * 64)
    log("SICONFI Scraper v2 - Municípios SP (resume per-município + RGF)")
    log("=" * 64)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    munis = get_sp_municipalities()
    if not munis:
        log("ERRO: lista de municípios vazia")
        sys.exit(1)

    total_novos = 0
    for kind, ano, periodo, extras in EXTRACTIONS:
        if not is_extraction_due(kind, ano, periodo):
            log(f"  {fname_prefix(kind, ano, periodo)}: prazo legal ainda não venceu - skip")
            continue
        total_novos += extract_one(munis, kind, ano, periodo, extras)

    write_coverage_summary(munis)

    metadata = {
        "data_extracao": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "duracao_segundos": (datetime.now() - start).total_seconds(),
        "municipios": len(munis),
        "extracoes_processadas": len(EXTRACTIONS),
        "municipios_novos_no_run": total_novos,
    }
    save_json(metadata, "metadata_extracao.json")

    log("=" * 64)
    log(f"FIM em {datetime.now() - start} | +{total_novos} municípios novos")


if __name__ == "__main__":
    main()
