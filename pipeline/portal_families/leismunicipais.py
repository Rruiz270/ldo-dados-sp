"""Parser stub para portais que redirecionam para LeisMunicipais.com.br.

Status: LeisMunicipais.com.br está protegido por Cloudflare e bloqueia
requests automatizadas com captcha. Não é viável fazer scraping direto
sem usar um browser headless (Playwright) ou serviço pago anti-bot.

Conhecidos que redirecionam pra cá (de nossa amostra de 30):
  - Mogi das Cruzes (3530607)
  - Aramina (3503000)

Volumes esperados: ~6-10% dos 645 municípios SP usam LeisMunicipais
como repositório oficial.

Fallback recomendado:
  1. Tentar URL pública: https://leismunicipais.com.br/prefeitura/sp/{slug}
     com User-Agent de browser real (Mozilla, Chrome) e cookies de
     sessão (geralmente passa o Cloudflare em ~50% dos casos)
  2. Se 403/503: marcar como BLOQUEADO_LEISMUNICIPAIS na coverage,
     e usar Wayback Machine para snapshots antigos.
  3. Roadmap: Playwright em modo stealth p/ resolver os bloqueios
     pendentes (custo de infra: ~$10/mês por municipality num crawl ondas).
"""
from __future__ import annotations

import re
import time
import urllib.parse
from typing import Optional

import requests

USER_AGENT_BROWSER = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
TIMEOUT = 8.0
RATE_LIMIT = 1.0


def find_documents(cod_ibge: int, url_base: str) -> list[dict]:
    """Tenta acessar LeisMunicipais — provavelmente vai retornar [] por
    bloqueio Cloudflare. Documenta o gap pra coverage report.
    """
    session = requests.Session()
    session.headers.update({
        "User-Agent": USER_AGENT_BROWSER,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    })

    # Heurística: extrair slug do url_base se for redirect
    # url_base esperada algo como https://leismunicipais.com.br/prefeitura/sp/{slug}
    m = re.search(r"leismunicipais\.com\.br/(?:prefeitura/sp/)?([a-z0-9\-]+)",
                  url_base, re.IGNORECASE)
    slug = m.group(1) if m else None

    if not slug:
        return []

    base = f"https://leismunicipais.com.br/prefeitura/sp/{slug}"
    try:
        r = session.get(base, timeout=TIMEOUT, allow_redirects=True)
    except requests.RequestException:
        return []

    if r.status_code in (403, 503, 429) or "challenge" in r.text.lower():
        # Cloudflare challenge — return empty with status
        return []

    # Se passou, parse de leis (TODO — não temos amostra real)
    # Por agora retorna empty pra documentar o gap
    return []


if __name__ == "__main__":
    import sys
    base = sys.argv[1] if len(sys.argv) > 1 else \
        "https://leismunicipais.com.br/prefeitura/sp/mogi-das-cruzes"
    docs = find_documents(3530607, base)
    print(f"{len(docs)} docs (esperado: 0 por bloqueio Cloudflare)")
