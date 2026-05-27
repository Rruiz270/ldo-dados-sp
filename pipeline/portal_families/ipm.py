"""Parser para o portal IPM Sistemas — Catálogo de Legislação Municipal.

Atualmente identificado em:
  - legislacao.prefeitura.sp.gov.br (Município de São Paulo — capital)

URL schema:
  - Home/busca: https://legislacao.prefeitura.sp.gov.br/
  - Busca GET: /busca?assunto={texto}&ano-inicial=YYYY&ano-final=YYYY
  - Detalhe: /leis/{slug}     onde slug = "lei-{nº}-de-{dd}-de-{mes}-de-{ano}"
  - PDF anexo: /leis/{slug}/anexo/{anexo_id}/{filename}.pdf

A página detalhe contém:
  - <title> com tipo+numero+data: "LEI Nº 17.839 DE 20 DE JULHO DE 2022"
  - <div class="ementa customStyle">: ementa
  - <a href="/leis/.../anexo/..."> com PDFs (anexos da lei)
  - Texto integral inline em HTML (sem PDF do texto principal)

Para LDO/LOA/PPA, busca-se por assunto e filtra-se por tipo+termo
no título da lei (regex).
"""
from __future__ import annotations

import re
import time
import urllib.parse
from typing import Optional

import requests

USER_AGENT = "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"
TIMEOUT = 8.0
RATE_LIMIT = 1.0

SEARCH_TERMS = {
    "LDO": "diretrizes orçamentárias",
    "LOA": "orçamento anual",   # mais preciso que "lei orçamentária"
    "PPA": "plano plurianual",
}


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml",
    })
    return s


def _extract_search_results(html: str, base: str) -> list[dict]:
    """Extrai links de leis dos resultados da busca.

    Result link: <a href="/leis/{slug}"> ... ementa ... </a>
    Filtramos só leis ordinárias (slug começa com "lei-").
    """
    results: list[dict] = []
    seen: set[str] = set()
    for m in re.finditer(r'<a[^>]+href="(/leis/([^"]+))"[^>]*>(.{0,400}?)</a>',
                         html, re.DOTALL):
        href, slug, text = m.group(1), m.group(2), m.group(3)
        if slug in seen:
            continue
        if not slug.startswith("lei-"):
            # Skip decretos/portarias para LDO/LOA/PPA
            continue
        seen.add(slug)
        title_match = re.search(r"LEI\s+N[º°]\s*([\d.]+)\s+DE\s+(\d{1,2})\s+DE\s+"
                                 r"([A-Za-zÇçÃãÊêÚúÍíÓóÉéÁá]+)\s+DE\s+(\d{4})",
                                 text, re.IGNORECASE)
        if not title_match:
            continue
        numero = title_match.group(1).replace(".", "")
        day = int(title_match.group(2))
        mes_name = title_match.group(3).lower()
        year = int(title_match.group(4))
        mes_map = {
            "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4,
            "maio": 5, "junho": 6, "julho": 7, "agosto": 8, "setembro": 9,
            "outubro": 10, "novembro": 11, "dezembro": 12,
        }
        mes = mes_map.get(mes_name)
        if not mes:
            continue
        results.append({
            "url_detalhe": base.rstrip("/") + href,
            "slug": slug,
            "numero_lei": numero,
            "data_lei": f"{year:04d}-{mes:02d}-{day:02d}",
            "ano_lei": year,
            "titulo": title_match.group(0).strip(),
        })
    return results


def _fetch_lei_detail(session: requests.Session, url: str) -> Optional[dict]:
    """Fetcha o detalhe da lei e extrai ementa + PDFs anexos.

    Retorna {"ementa", "anexos", "html_size"} ou None.
    """
    try:
        r = session.get(url, timeout=TIMEOUT)
        if r.status_code != 200:
            return None
    except requests.RequestException:
        return None

    html = r.text
    # Ementa: <div class="...bx-ementa customStyle"><p>Dispõe sobre...</p></div>
    m_em = re.search(
        r'class="[^"]*bx-ementa[^"]*"[^>]*>\s*<p>([^<]{20,2000})</p>',
        html, re.IGNORECASE,
    )
    if not m_em:
        # Fallback: try class="ementa customStyle" or any ementa pattern
        m_em = re.search(
            r'class="[^"]*ementa[^"]*"[^>]*>\s*<p[^>]*>([^<]{20,2000})</p>',
            html, re.IGNORECASE,
        )
    ementa = m_em.group(1).strip() if m_em else ""

    # PDFs anexos
    anexos = []
    for m in re.finditer(r'href="(/leis/[^"]+/anexo/[^"]+\.pdf)"', html):
        anexos.append(m.group(1))
    return {"ementa": ementa, "anexos": anexos, "html_size": len(html)}


def _matches_tipo(ementa: str, titulo: str, tipo: str) -> bool:
    blob = (ementa + " " + titulo).lower()
    if tipo == "LDO":
        return ("diretrizes orçament" in blob or "diretrizes orcament" in blob)
    if tipo == "LOA":
        return ("estima a receita" in blob and "fixa" in blob
                and "despesa" in blob) or "orçamento anual" in blob
    if tipo == "PPA":
        return "plano plurianual" in blob or "plurianual" in blob
    return False


def _extract_ano(ementa: str, titulo: str, tipo: str,
                  ano_lei: int) -> Optional[int]:
    """Determina ano de vigência."""
    if tipo == "PPA":
        for pat in (
            r"(?:per[íi]odo|qu[aá]dri[êe]nio)[^0-9]{0,30}(20\d{2})\s*[-/–]\s*(20\d{2})",
            r"(20\d{2})\s*[-/–]\s*(20\d{2})",
        ):
            m = re.search(pat, ementa, re.IGNORECASE)
            if m:
                return int(m.group(1))
        m = re.search(r"\b(20\d{2})\b", ementa)
        if m:
            return int(m.group(1))
        return None
    # LDO / LOA: "para o exercício de YYYY"
    m = re.search(r"exerc[íi]cio[^0-9]{0,30}(\d{4})", ementa, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # Fallback: ano da lei + 1 (LDO publicada em 2023 = LDO 2024)
    return ano_lei + 1 if tipo in ("LDO", "LOA") else None


def find_documents(cod_ibge: int, url_base: str) -> list[dict]:
    """Procura PPA/LDO/LOA no catálogo IPM.

    url_base aceita ambos:
      - 'https://legislacao.prefeitura.sp.gov.br' (SP capital)
      - 'https://www.prefeitura.sp.gov.br' (homepage — redireciona)

    Sempre normaliza para o domínio do catálogo.
    """
    session = _session()
    # Normaliza base — SP capital usa subdomain dedicado
    if "prefeitura.sp.gov.br" in url_base and "legislacao" not in url_base:
        base = "https://legislacao.prefeitura.sp.gov.br"
    else:
        base = url_base.rstrip("/")

    results: list[dict] = []
    by_key: dict[tuple, dict] = {}

    # Buscas em janelas curtas (3 anos) p/ não estourar paginação.
    # A pagina de busca tem limite de ~10 resultados por chamada sem JS.
    year_windows = [(2017, 2019), (2020, 2022), (2023, 2025), (2026, 2030)]

    for tipo in ("LDO", "LOA", "PPA"):
        query = SEARCH_TERMS[tipo]
        all_candidates: list[dict] = []
        seen_slugs: set[str] = set()

        for (ano_ini, ano_fim) in year_windows:
            url_busca = (f"{base}/busca?assunto={urllib.parse.quote(query)}"
                         f"&ano-inicial={ano_ini}&ano-final={ano_fim}")
            try:
                r = session.get(url_busca, timeout=TIMEOUT)
            except requests.RequestException:
                continue
            time.sleep(RATE_LIMIT)
            if r.status_code != 200:
                continue
            for c in _extract_search_results(r.text, base):
                if c["slug"] not in seen_slugs:
                    seen_slugs.add(c["slug"])
                    all_candidates.append(c)

        # Filtra candidatos por tipo (heurística inicial pelo título;
        # confirma com detalhe se necessário)
        for cand in all_candidates[:50]:  # limita p/ evitar custo alto
            time.sleep(RATE_LIMIT)
            det = _fetch_lei_detail(session, cand["url_detalhe"])
            if not det:
                continue
            if not _matches_tipo(det["ementa"], cand["titulo"], tipo):
                continue
            ano = _extract_ano(det["ementa"], cand["titulo"], tipo,
                                cand["ano_lei"])
            if not ano:
                continue
            anexos_full = [base + a for a in det["anexos"]]
            doc = {
                "tipo": tipo,
                "ano": ano,
                "url_pdf": anexos_full[0] if anexos_full else None,
                "url_anexos": anexos_full,
                "url_html": cand["url_detalhe"],
                "titulo": cand["titulo"],
                "numero_lei": cand["numero_lei"],
                "ementa": det["ementa"],
                "data_lei": cand["data_lei"],
            }
            key = (tipo, ano)
            cur = by_key.get(key)
            if cur is None or doc["data_lei"] > cur["data_lei"]:
                by_key[key] = doc

    return list(by_key.values())


if __name__ == "__main__":
    import sys
    base = sys.argv[1] if len(sys.argv) > 1 else \
        "https://legislacao.prefeitura.sp.gov.br"
    docs = find_documents(3550308, base)
    for d in docs:
        print(d["tipo"], d["ano"], "|", d["titulo"][:80],
              "| anexos:", len(d["url_anexos"]))
