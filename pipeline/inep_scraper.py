#!/usr/bin/env python3
"""
INEP Bulk Downloader — IDEB + Taxas de Rendimento
==================================================
Baixa planilhas oficiais do INEP em download.inep.gov.br para uso no
Radar Fiscal 360 (módulo educacional).

Fontes (verificadas em 2026-05):
  - IDEB Municípios 2019/2021/2023 (XLSX por etapa: AI, AF, EM)
    https://download.inep.gov.br/educacao_basica/portal_ideb/planilhas_para_download/...  (2019, 2021)
    https://download.inep.gov.br/ideb/resultados/...                                       (2023)

  - Taxas de Rendimento Escolar Municípios 2019-2024 (ZIP com XLSX)
    https://download.inep.gov.br/informacoes_estatisticas/indicadores_educacionais/...

Observações:
  - O IDEB 2017 NÃO existe mais como planilha standalone, mas vem como
    coluna histórica nos arquivos 2019/2021/2023 (VL_OBSERVADO_2017 etc.).
    Portanto o ciclo 2017 é coletado do arquivo 2019 (ou superior).
  - O ciclo IDEB 2025 ainda não foi divulgado (publicação prevista Saeb 2025).
  - Microdados Saeb NÃO são baixados (escopo do projeto - GBs, não cabem).

Cache: usa Last-Modified do nginx INEP igual ao audesp_downloader.

User-Agent: Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)
"""

import json
import os
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime

import requests

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "inep_data")

# Ciclos IDEB cobertos pelas planilhas. 2017 vem como coluna histórica em 2019.
# 2025 ainda não foi divulgado (estimativa: ago/2026).
IDEB_YEARS = [2019, 2021, 2023]

# Etapas (chave interna -> nome no arquivo INEP)
ETAPAS = {
    "anos_iniciais": "anos_iniciais",
    "anos_finais":   "anos_finais",
    "ensino_medio":  "ensino_medio",
}

# Padrão da URL do IDEB varia por ano. A partir de 2023 o INEP migrou para
# /ideb/resultados/ (sem subdir por ano).
def ideb_url(year, etapa_key):
    etapa = ETAPAS[etapa_key]
    if year >= 2023:
        return f"https://download.inep.gov.br/ideb/resultados/divulgacao_{etapa}_municipios_{year}.xlsx"
    return f"https://download.inep.gov.br/educacao_basica/portal_ideb/planilhas_para_download/{year}/divulgacao_{etapa}_municipios_{year}.xlsx"


# Taxas de Rendimento Escolar (aprovação/reprovação/abandono) — disponível
# por ano censo. Cobertura testada: 2019-2024 OK; 2017/2018 dão 404.
TX_REND_YEARS = [2019, 2020, 2021, 2022, 2023, 2024]


def tx_rend_url(year):
    return (
        f"https://download.inep.gov.br/informacoes_estatisticas/"
        f"indicadores_educacionais/{year}/tx_rend_municipios_{year}.zip"
    )


REQUEST_TIMEOUT = (15, 600)

session = requests.Session()
session.headers.update(
    {"User-Agent": "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"}
)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def fetch_metadata(url):
    """HEAD na URL pra pegar size + last-modified."""
    r = session.head(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    last_mod = r.headers.get("Last-Modified")
    return {
        "url": url,
        "size": int(r.headers.get("Content-Length", 0)),
        "last_modified": last_mod,
        "last_modified_dt": parsedate_to_datetime(last_mod) if last_mod else None,
    }


def needs_download(local_path, remote_meta):
    if not os.path.exists(local_path):
        return True
    if not remote_meta or not remote_meta["last_modified_dt"]:
        return True
    local_mtime = datetime.fromtimestamp(os.path.getmtime(local_path)).astimezone()
    return remote_meta["last_modified_dt"] > local_mtime


def download(url, local_path):
    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    tmp = local_path + ".part"
    bytes_written = 0
    with session.get(url, stream=True, timeout=REQUEST_TIMEOUT) as r:
        r.raise_for_status()
        with open(tmp, "wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
                    bytes_written += len(chunk)
    os.replace(tmp, local_path)
    return bytes_written


def build_dataset_list():
    """Gera a lista (local_subpath, url) de tudo que vamos baixar."""
    items = []
    for year in IDEB_YEARS:
        for etapa_key in ETAPAS:
            url = ideb_url(year, etapa_key)
            local = f"ideb/{year}/ideb_{etapa_key}_municipios_{year}.xlsx"
            items.append((local, url, "ideb", year, etapa_key))
    for year in TX_REND_YEARS:
        url = tx_rend_url(year)
        local = f"tx_rend/tx_rend_municipios_{year}.zip"
        items.append((local, url, "tx_rend", year, None))
    return items


def main():
    start = datetime.now()
    log("=" * 64)
    log("INEP Bulk Downloader (IDEB + Taxas de Rendimento)")
    log("=" * 64)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    manifest = []
    baixados = pulados = falhas = 0

    for local_sub, url, dataset, year, etapa in build_dataset_list():
        local_path = os.path.join(OUTPUT_DIR, local_sub)
        try:
            meta = fetch_metadata(url)
            if meta is None:
                log(f"  404: {url}")
                manifest.append({
                    "url": url, "local": local_sub, "dataset": dataset,
                    "year": year, "etapa": etapa, "status": "404",
                })
                falhas += 1
                continue

            if not needs_download(local_path, meta):
                log(f"  up-to-date: {local_sub} ({meta['size']/1024/1024:.1f} MB)")
                pulados += 1
                manifest.append({
                    "url": url, "local": local_sub, "dataset": dataset,
                    "year": year, "etapa": etapa, "status": "cached",
                    "size": meta["size"], "last_modified": meta["last_modified"],
                })
                continue

            log(f"  baixando: {local_sub} ({meta['size']/1024/1024:.1f} MB)")
            n = download(meta["url"], local_path)
            baixados += 1
            manifest.append({
                "url": url, "local": local_sub, "dataset": dataset,
                "year": year, "etapa": etapa, "status": "downloaded",
                "size": n, "last_modified": meta["last_modified"],
                "downloaded_at": datetime.now().isoformat(),
            })
            log(f"    ok ({n/1024/1024:.1f} MB)")

        except requests.HTTPError as e:
            log(f"  HTTP ERROR em {url}: {e}")
            manifest.append({
                "url": url, "local": local_sub, "dataset": dataset,
                "year": year, "etapa": etapa, "status": "error", "error": str(e),
            })
            falhas += 1
        except Exception as e:
            log(f"  ERROR em {url}: {e}")
            manifest.append({
                "url": url, "local": local_sub, "dataset": dataset,
                "year": year, "etapa": etapa, "status": "error", "error": str(e),
            })
            falhas += 1

    with open(os.path.join(OUTPUT_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "data_extracao": datetime.now().isoformat(),
            "duracao_segundos": (datetime.now() - start).total_seconds(),
            "baixados": baixados,
            "pulados_cached": pulados,
            "falhas": falhas,
            "items": manifest,
        }, f, ensure_ascii=False, indent=2)

    log("=" * 64)
    log(f"FIM em {datetime.now() - start} | baixados: {baixados} | "
        f"cached: {pulados} | falhas: {falhas}")


if __name__ == "__main__":
    main()
