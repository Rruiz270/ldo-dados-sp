#!/usr/bin/env python3
"""Recon de famílias de portais municipais SP.

Para cada município, tenta URLs candidatas e classifica em uma família a partir
de markers HTML. Salva em pipeline/leis_data/family_map.json.

Famílias detectadas:
  - intellgest  (intellgest.com.br, intellgest-sigl-media.s3, /api/portal)
  - sapl        (sapl3.framework, sapl.{slug}.sp.leg.br)
  - ipm         (ipmsistemas.com.br, /pmsorocaba, e-cidade)
  - mitra       (mitraonline.com.br)
  - portal_api  (portal-api.{slug}.sp.gov.br)
  - municipal   (site próprio, sem framework reconhecido)
  - unknown     (não foi possível classificar)

Uso:
  python3 -m pipeline.portal_families.recon --sample 5
  python3 -m pipeline.portal_families.recon --all
  python3 -m pipeline.portal_families.recon --cod 3500105 3509502
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Optional

import requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUNICIPIOS_FILE = os.path.join(BASE, "siconfi_data", "municipios_sp.json")
OUTPUT_FILE = os.path.join(BASE, "leis_data", "family_map.json")

USER_AGENT = "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"
TIMEOUT = 8.0
RATE_LIMIT_SEC = 1.0  # 1 req/s por host

# Test set obrigatório (Adamantina, Campinas, SP capital, Mogi das Cruzes, Adolfo)
REQUIRED_TEST_MUNIS = [3500105, 3509502, 3550308, 3530607, 3500204]

# Overrides manuais — quando recon automática falha em detectar a família
# (ex: SP capital tem portal homepage WebSphere/IBM, mas seu repositório de
# legislação é um catálogo IPM separado em legislacao.prefeitura.sp.gov.br)
MANUAL_OVERRIDES: dict[int, dict] = {
    3550308: {
        "url_base": "https://legislacao.prefeitura.sp.gov.br",
        "url_final": "https://legislacao.prefeitura.sp.gov.br",
        "url_legislacao": "https://legislacao.prefeitura.sp.gov.br",
        "familia": "ipm",
        "indicadores_html": ["manual: SP capital usa IPM Catálogo Legislação"],
    },
}


def slugify(s: str) -> str:
    table = str.maketrans(
        "áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ",
        "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC",
    )
    out = s.translate(table).lower()
    out = re.sub(r"[^a-z0-9]+", "-", out).strip("-")
    return out


def slug_compact(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", slugify(s))


def candidate_bases(municipio: str) -> list[str]:
    slug = slugify(municipio)
    compact = slug_compact(municipio)
    return [
        f"https://www.{slug}.sp.gov.br",
        f"https://{slug}.sp.gov.br",
        f"https://www.{compact}.sp.gov.br",
        f"https://{compact}.sp.gov.br",
        f"https://prefeitura.{slug}.sp.gov.br",
        f"https://portal.{slug}.sp.gov.br",
    ]


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


# -----------------------------------------------------------------------------
# Markers — ordem importa (mais específico primeiro)
# -----------------------------------------------------------------------------

FAMILY_MARKERS: list[tuple[str, list[str]]] = [
    # Instar Tecnologia — portal /portal/leis_decretos/ com filtros por categoria
    # Classes CSS proprietárias sw_lato/sw_ubuntu são MUITO específicas do
    # framework Instar; usamos isso pra detectar com certeza.
    ("instar", [
        "instar.com.br",
        "instar tecnologia",
        "sw_lato_bold",  # classe CSS proprietária Instar
        "sw_lato_black",
        "sw_ubuntu",
        "instar&nbsp;tecnologia",
    ]),
    # intellgest — usa S3 intellgest-sigl-media e /api/portal/
    ("intellgest", [
        "intellgest.com.br",
        "intellgest-sigl",
        "sigl-media.s3",
    ]),
    # SAPL (câmaras municipais — Interlegis/Câmara Federal)
    ("sapl", [
        "sapl3.framework",
        "sapl-frontend",
        "interlegis.leg.br",
    ]),
    # IPM Sistemas — prefeitura.sp.gov.br legislacao usa, vários outros
    ("ipm", [
        "ipmsistemas.com.br",
        "ipm.com.br",
        "e-cidadeonline",
        "atende.net",  # subdomínio antigo IPM
    ]),
    # LeisMunicipais — fallback comum para munis pequenos (Cloudflare bloqueia)
    ("leismunicipais", [
        "leismunicipais.com.br",
    ]),
    # Mitra Sistemas
    ("mitra", [
        "mitraonline.com.br",
        "mitratecnologia",
    ]),
    # Liferay (SP capital usa)
    ("liferay", [
        "liferay",
        "/web/guest",
        "wp-portal-ui",
    ]),
    # Drupal (Campinas usa)
    ("drupal", [
        'name="generator" content="drupal',
        '<meta name="generator" content="drupal',
    ]),
    # IBM WebSphere Portal (SP capital homepage tem)
    ("websphere", [
        "!ut/p/digest",
        "wp_portal_ui_utils",
        "websphere",
    ]),
    # WordPress (muito comum em munis pequenos)
    ("wordpress", [
        "/wp-content/",
        "/wp-includes/",
        'name="generator" content="wordpress',
    ]),
    # Memory Sistemas
    ("memory", [
        "memory.com.br",
        "memorysistemas",
    ]),
    # Granito (portal do cidadão)
    ("granito", [
        "granitotecnologia",
        "portalcidadao",
    ]),
    # Outros
    ("publicsoft", [
        "publicsoft.com.br",
    ]),
    ("egov", [
        "egov.com.br",
    ]),
    ("portal_api", [
        "portal-api.",
    ]),
]


def detect_family(html: str, final_url: str) -> tuple[str, list[str]]:
    """Retorna (familia, indicadores_encontrados)."""
    html_lower = html.lower()
    final_lower = final_url.lower()
    blob = html_lower + " " + final_lower
    for family, markers in FAMILY_MARKERS:
        hits = [m for m in markers if m in blob]
        if hits:
            return family, hits
    # heurística fallback: se vê referências a "transparência", "leis" etc. → municipal
    if any(kw in html_lower for kw in ["legisla", "diário oficial", "diario oficial",
                                       "portal da transparência", "transparencia"]):
        return "municipal", []
    return "unknown", []


def probe_url(session: requests.Session, url: str) -> Optional[dict]:
    """GET com timeout pequeno, retorna {status, final_url, html} ou None."""
    try:
        r = session.get(url, timeout=TIMEOUT, allow_redirects=True)
        if r.status_code >= 400:
            return None
        ct = r.headers.get("Content-Type", "")
        if "html" not in ct and "text" not in ct:
            return None
        return {
            "status": r.status_code,
            "final_url": r.url,
            "html": r.text[:200000],  # cap em 200KB de HTML
        }
    except (requests.RequestException, OSError):
        return None


def recon_municipio(muni: dict) -> dict:
    cod = muni["cod_ibge"]
    nome = muni["ente"]
    log(f"  [{cod}] {nome}")

    # Manual override path — pula recon HTTP
    if cod in MANUAL_OVERRIDES:
        ov = MANUAL_OVERRIDES[cod]
        log(f"     OVERRIDE manual → {ov['familia']}")
        return {
            "cod_ibge": cod,
            "ente": nome,
            "populacao": muni.get("populacao"),
            "url_base": ov.get("url_base"),
            "url_final": ov.get("url_final"),
            "url_legislacao": ov.get("url_legislacao"),
            "familia": ov["familia"],
            "indicadores_html": ov.get("indicadores_html", []),
            "urls_tentadas": [ov.get("url_base")],
            "recon_em": datetime.now().isoformat(timespec="seconds"),
        }

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT,
                            "Accept-Language": "pt-BR,pt;q=0.9"})

    bases = candidate_bases(nome)
    found = None
    tried = []
    for url in bases:
        tried.append(url)
        result = probe_url(session, url)
        if result:
            family, hits = detect_family(result["html"], result["final_url"])
            found = {
                "url_tried": url,
                "url_final": result["final_url"],
                "status": result["status"],
                "familia": family,
                "indicadores_html": hits,
            }
            log(f"     OK {url} → {family} ({hits[:3]})")
            break
        time.sleep(0.2)  # leve gap entre tentativas no mesmo host

    if not found:
        log(f"     NENHUMA URL respondeu")
        return {
            "cod_ibge": cod,
            "ente": nome,
            "populacao": muni.get("populacao"),
            "url_base": None,
            "url_final": None,
            "familia": "offline",
            "indicadores_html": [],
            "urls_tentadas": tried,
            "recon_em": datetime.now().isoformat(timespec="seconds"),
        }

    # Tenta também sub-páginas comuns ("legislação", "leis", "transparência") pra
    # capturar markers que só aparecem nas páginas internas
    base_final = found["url_final"].rstrip("/")
    parsed = urllib.parse.urlparse(base_final)
    root = f"{parsed.scheme}://{parsed.netloc}"
    extra_paths = [
        "/portal/leis_decretos/",     # Instar
        "/legislacao",
        "/legislacoes",
        "/leis",
        "/transparencia",
        "/portal/legislacao",
        "/portal/transparencia",
        "/cidadao/legislacao",
        "/governo/legislacao",
    ]
    extra_evidence: list[str] = []
    family = found["familia"]
    legislation_url = None
    for path in extra_paths:
        if family in ("instar", "intellgest", "sapl", "ipm", "mitra",
                      "leismunicipais"):
            # já achamos família forte, não precisamos checar mais
            break
        time.sleep(0.5)
        r = probe_url(session, root + path)
        if not r:
            continue
        f2, hits2 = detect_family(r["html"], r["final_url"])
        if f2 != "unknown" and f2 != "municipal":
            family = f2
            extra_evidence = hits2
            legislation_url = r["final_url"]
            log(f"     → reclassificado como {f2} via {path}")
            break
        # Detect redirect to leismunicipais.com.br
        if "leismunicipais.com.br" in r["final_url"]:
            family = "leismunicipais"
            extra_evidence = ["redirect:leismunicipais"]
            legislation_url = r["final_url"]
            log(f"     → leismunicipais via {path}")
            break

    return {
        "cod_ibge": cod,
        "ente": nome,
        "populacao": muni.get("populacao"),
        "url_base": found["url_tried"],
        "url_final": found["url_final"],
        "url_legislacao": legislation_url,
        "familia": family,
        "indicadores_html": found["indicadores_html"] or extra_evidence,
        "urls_tentadas": tried,
        "recon_em": datetime.now().isoformat(timespec="seconds"),
    }


def build_sample(municipios: list[dict], n: int) -> list[dict]:
    """Sample diverso por população: capital + grandes + médios + pequenos + micro,
    sempre incluindo REQUIRED_TEST_MUNIS."""
    municipios_sorted = sorted(municipios, key=lambda m: m.get("populacao", 0),
                               reverse=True)
    required = [m for m in municipios_sorted if m["cod_ibge"] in REQUIRED_TEST_MUNIS]
    others = [m for m in municipios_sorted if m["cod_ibge"] not in REQUIRED_TEST_MUNIS]

    if n <= len(required):
        return required[:n]

    remaining = n - len(required)
    # Particiona em 4 buckets (grandes/médios/pequenos/micro) e pega proporcional
    L = len(others)
    buckets = [others[:L // 4],
               others[L // 4: L // 2],
               others[L // 2: 3 * L // 4],
               others[3 * L // 4:]]
    per_bucket = remaining // 4
    extras = remaining - per_bucket * 4

    sample = list(required)
    for i, b in enumerate(buckets):
        take = per_bucket + (1 if i < extras else 0)
        step = max(1, len(b) // max(1, take))
        sample.extend(b[::step][:take])
    return sample[:n]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample", type=int, default=30,
                        help="Tamanho da amostra (default 30)")
    parser.add_argument("--all", action="store_true",
                        help="Recon em todos os 645 municípios")
    parser.add_argument("--cod", type=int, nargs="*",
                        help="cod_ibge específicos")
    parser.add_argument("--workers", type=int, default=4,
                        help="Threads paralelas (default 4). 1 = sequencial.")
    args = parser.parse_args()

    with open(MUNICIPIOS_FILE, encoding="utf-8") as f:
        municipios = json.load(f)

    if args.cod:
        targets = [m for m in municipios if m["cod_ibge"] in args.cod]
    elif args.all:
        targets = municipios
    else:
        targets = build_sample(municipios, args.sample)

    log(f"Recon em {len(targets)} município(s) com {args.workers} worker(s)")

    results = []
    if args.workers <= 1:
        for muni in targets:
            results.append(recon_municipio(muni))
            time.sleep(RATE_LIMIT_SEC)
    else:
        with ThreadPoolExecutor(max_workers=args.workers) as ex:
            futures = {ex.submit(recon_municipio, m): m for m in targets}
            for fut in as_completed(futures):
                try:
                    results.append(fut.result())
                except Exception as e:
                    m = futures[fut]
                    log(f"  ERRO em {m['ente']}: {e}")
                    results.append({
                        "cod_ibge": m["cod_ibge"],
                        "ente": m["ente"],
                        "populacao": m.get("populacao"),
                        "familia": "error",
                        "erro": str(e),
                    })

    # Ordena por cod_ibge para output estável
    results.sort(key=lambda r: r["cod_ibge"])

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    # Merge com mapa existente, se houver
    existing = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, encoding="utf-8") as f:
                prev = json.load(f)
            existing = {r["cod_ibge"]: r for r in prev.get("municipios", [])}
        except (json.JSONDecodeError, KeyError):
            existing = {}

    for r in results:
        existing[r["cod_ibge"]] = r

    merged = list(existing.values())
    merged.sort(key=lambda r: r["cod_ibge"])

    # Estatística
    families = {}
    for r in merged:
        f = r.get("familia", "unknown")
        families[f] = families.get(f, 0) + 1

    output = {
        "atualizado_em": datetime.now().isoformat(timespec="seconds"),
        "total_municipios": len(merged),
        "distribuicao_familias": families,
        "municipios": merged,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    log("=" * 60)
    log(f"Recon concluído. Total no mapa: {len(merged)}")
    log("Distribuição de famílias:")
    for fam, count in sorted(families.items(), key=lambda x: -x[1]):
        log(f"  {fam:15s} {count:4d} ({100*count/len(merged):.1f}%)")
    log(f"Salvo em {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
