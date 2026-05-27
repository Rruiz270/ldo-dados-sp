#!/usr/bin/env python3
"""
Audesp/TCE-SP Bulk Downloader
==============================
Baixa os datasets públicos do Portal Transparência TCE-SP em
https://transparencia.tce.sp.gov.br/conjunto-de-dados

Fonte é arquivo estático (ZIP/CSV) servido por nginx com header
Last-Modified — usamos isso pra cache: se a versão local for igual à remota,
não baixa de novo.

Datasets coletados (escopo definido pelo usuário 2026-05-23):
  - resultado_analises_audesp.zip   (mensal; indicadores LRF/educ/saúde processados)
  - rcl_completo.zip                (mensal; RCL por município)
  - alertas_analitico.csv           (mensal; alertas fiscais)
  - receitas-{ano}.zip              (semanal; só 2024, 2025, 2026)
  - divida-ativa/{ano}.csv          (anual; só 2024)

Não baixamos despesas-{ano}.zip (~1-2 GB/ano; usuário disse para evitar).
"""

import json
import os
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime

import requests

BASE_URL = "https://transparencia.tce.sp.gov.br/sites/default/files/conjunto-dados"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audesp_data")

# (local_subpath, remote_path) — anos novos podem ser adicionados aqui
DATASETS = [
    ("analises/resultado_analises_audesp.zip", "resultado_analises_audesp.zip"),
    ("rcl/rcl_completo.zip", "rcl_completo.zip"),
    ("alertas/alertas_analitico.csv", "alertas/alertas_analitico.csv"),
    ("receitas/receitas-2024.zip", "receitas-2024.zip"),
    ("receitas/receitas-2025.zip", "receitas-2025.zip"),
    ("receitas/receitas-2026.zip", "receitas-2026.zip"),
    ("divida-ativa/Divida_Ativa_2019_2024.csv", "divida-ativa/Divida_Ativa_2019_2024.csv"),
]

REQUEST_TIMEOUT = (15, 600)  # connect, read

session = requests.Session()
session.headers.update(
    {"User-Agent": "FundebSP-Tracker/1.0 (raphael.ruiz@betteredu.com.br)"}
)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def fetch_metadata(remote_path):
    """HEAD na URL pra pegar size + last-modified sem baixar o corpo."""
    url = f"{BASE_URL}/{remote_path}"
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
    """Compara mtime local com Last-Modified remoto. True se precisa baixar."""
    if not os.path.exists(local_path):
        return True
    if not remote_meta or not remote_meta["last_modified_dt"]:
        return True  # sem info; baixa por segurança
    local_mtime = datetime.fromtimestamp(os.path.getmtime(local_path)).astimezone()
    return remote_meta["last_modified_dt"] > local_mtime


def download(url, local_path, expected_size=None):
    """Download streaming pra arquivo + .part atômico."""
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


def main():
    start = datetime.now()
    log("=" * 64)
    log("Audesp/TCE-SP Bulk Downloader")
    log("=" * 64)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    manifest = []
    baixados = pulados = falhas = 0

    for local_sub, remote in DATASETS:
        local_path = os.path.join(OUTPUT_DIR, local_sub)
        try:
            meta = fetch_metadata(remote)
            if meta is None:
                log(f"  404: {remote} (dataset não disponível)")
                manifest.append({"remote": remote, "status": "404"})
                falhas += 1
                continue

            if not needs_download(local_path, meta):
                log(f"  up-to-date: {local_sub} ({meta['size']/1024/1024:.1f} MB)")
                pulados += 1
                manifest.append({
                    "remote": remote, "local": local_sub, "status": "cached",
                    "size": meta["size"], "last_modified": meta["last_modified"],
                })
                continue

            log(f"  baixando: {remote} -> {local_sub} ({meta['size']/1024/1024:.1f} MB)")
            n = download(meta["url"], local_path)
            baixados += 1
            manifest.append({
                "remote": remote, "local": local_sub, "status": "downloaded",
                "size": n, "last_modified": meta["last_modified"],
                "downloaded_at": datetime.now().isoformat(),
            })
            log(f"    ok ({n/1024/1024:.1f} MB)")

        except requests.HTTPError as e:
            log(f"  HTTP ERROR em {remote}: {e}")
            manifest.append({"remote": remote, "status": "error", "error": str(e)})
            falhas += 1
        except Exception as e:
            log(f"  ERROR em {remote}: {e}")
            manifest.append({"remote": remote, "status": "error", "error": str(e)})
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
    log(f"FIM em {datetime.now() - start} | baixados: {baixados} | cached: {pulados} | falhas: {falhas}")


if __name__ == "__main__":
    main()
