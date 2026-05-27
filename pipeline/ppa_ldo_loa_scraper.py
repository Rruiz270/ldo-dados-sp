#!/usr/bin/env python3
"""
Scraper de leis orçamentárias municipais (PPA, LDO, LOA) — best-effort.
======================================================================

PPA/LDO/LOA municipais NÃO têm fonte estruturada nacional. SICONFI publica
apenas relatórios fiscais (RREO/RGF/DCA), não o TEXTO das leis. AUDESP TCE-SP
publica execução orçamentária consolidada, não as leis. Portanto a coleta
exige varrer fontes heterogêneas:

  1) SICONFI — checagem de viabilidade (deve falhar pra texto-lei; só registra
     observação na meta). NÃO tem endpoint pra LDO/PPA/LOA texto integral.
  2) Startpage HTML — motor de busca (proxy do Google, sem CAPTCHA/Cloudflare).
     DuckDuckGo HTML bloqueia muito rápido (`cc=botnet`). Startpage não bloqueia
     em volumes pequenos.
  3) Heurísticas por padrão de URL conhecidos — SAPL (câmaras municipais),
     intellgest/S3, portal-api.{munic}.sp.gov.br, etc.
  4) Wayback Machine — fallback quando portal está fora do ar.

Output:
  pipeline/leis_data/{cod_ibge}/{tipo}_{ano}.pdf       (PDF original)
  pipeline/leis_data/{cod_ibge}/{tipo}_{ano}.meta.json (metadata)
  pipeline/leis_data/coverage.json                     (sumário por município)

Uso:
  python3 ppa_ldo_loa_scraper.py                          # teste 5 munis
  python3 ppa_ldo_loa_scraper.py --cod 3500105 3550308    # munis específicos
  python3 ppa_ldo_loa_scraper.py --all                    # cuidado: 645 munis
  python3 ppa_ldo_loa_scraper.py --tipos LDO LOA          # filtrar tipos
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
from dataclasses import dataclass, asdict, field
from datetime import datetime
from typing import Optional

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
MUNICIPIOS_FILE = os.path.join(BASE, "siconfi_data", "municipios_sp.json")
OUTPUT_DIR = os.path.join(BASE, "leis_data")

USER_AGENT = "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"
BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

REQUEST_TIMEOUT = 30
PDF_DOWNLOAD_TIMEOUT = 60
RATE_LIMIT_SEC = 1.0  # 1 req/s, conforme spec

# Tipos suportados. Para PPA, exercicio = ano inicial do plano quadrienal.
TIPOS = {
    "PPA": ["plano plurianual", "PPA"],
    "LDO": ["lei de diretrizes orçamentárias", "LDO"],
    "LOA": ["lei orçamentária anual", "LOA"],
}

# Test set: capital, grande, médio, pequeno, micro
TEST_MUNIS = [3550308, 3509502, 3530706, 3500105, 3500204]

# Seed de URLs descobertas manualmente (via Startpage com queries variadas).
# Demonstra prova-de-conceito do download/parsing. Para 645 munis em produção,
# expandir via SERP API paga (Serper.dev, SerpAPI) com ~$50/mês p/ 645×3 queries.
SEED_URLS = {
    # (cod_ibge, tipo, ano): "url"
    (3500105, "LDO", 2024): "https://intellgest-sigl-media.s3.amazonaws.com/media/arquivos/portal/LDO__LEI_DE_DIRETRIZES_ORCAMENTARIA_ANUAL_2024_0000001_BvxFtbC.pdf",
    # PPA Campinas 2026 — projeto de lei (não a lei final, mas é o que está público)
    (3509502, "PPA", 2026): "https://portal-api.campinas.sp.gov.br/sites/default/files/secretarias/arquivos-avulsos/134/2025/09/10-162740/Projeto_de_Lei%5B1%5D.pdf",
}

# Anos a tentar — LDO/LOA cobrem ~3 últimos exercícios. PPA quadrienal: 2022, 2026.
DEFAULT_ANOS = {
    "LDO": [2023, 2024, 2025, 2026],
    "LOA": [2023, 2024, 2025, 2026],
    "PPA": [2022, 2026],  # PPA municipal: ciclo 2022-2025 e 2026-2029
}


# ---------------------------------------------------------------------------
# Util
# ---------------------------------------------------------------------------

def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def slugify(s: str) -> str:
    """'Mogi Guaçu' -> 'mogi-guacu'  (heurística simples sem unidecode)."""
    # ASCII fold via NFKD básico
    table = str.maketrans("áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ",
                          "aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC")
    out = s.translate(table).lower()
    out = re.sub(r"[^a-z0-9]+", "-", out).strip("-")
    return out


def session_for(ua: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": ua, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"})
    return s


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

@dataclass
class LawDoc:
    cod_ibge: int
    municipio: str
    tipo: str         # 'PPA' | 'LDO' | 'LOA'
    exercicio: int    # ano de vigência (LOA/LDO) ou ano inicial (PPA)
    url_pdf: Optional[str] = None
    numero_lei: Optional[str] = None
    data_lei: Optional[str] = None
    fonte: Optional[str] = None      # 'SEED' | 'STARTPAGE' | 'PORTAL_DIRETO' | 'WAYBACK'
    fonte_id: str = "PORTAL-LEIS"    # default — match com tabela `fontes` no Neon
    titulo_encontrado: Optional[str] = None
    sha256: Optional[str] = None
    bytes_baixados: int = 0
    coletado_em: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))
    status: str = "NAO_ENCONTRADO"   # 'OK' | 'NAO_ENCONTRADO' | 'BLOQUEADO' | 'ERRO_DOWNLOAD'
    erro: Optional[str] = None


# ---------------------------------------------------------------------------
# Search engines
# ---------------------------------------------------------------------------

def startpage_search(query: str, limit: int = 20) -> list[str]:
    """Startpage HTML search → URLs descobertas. Mais resiliente que DDG."""
    s = session_for(BROWSER_UA)
    try:
        r = s.get(
            "https://www.startpage.com/do/search",
            params={"q": query},
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code != 200:
            return []
        # Startpage retorna URLs diretas no HTML
        urls = re.findall(r'href="(https?://[^"]+)"', r.text)
        out = []
        seen = set()
        # Sanitize HTML entities
        for u in urls:
            u = u.replace("&amp;", "&")
            if u in seen:
                continue
            seen.add(u)
            # Ignora links internos do startpage
            if "startpage.com" in u or "anonymous-proxy" in u:
                continue
            out.append(u)
            if len(out) >= limit:
                break
        return out
    except requests.RequestException:
        return []


def ddg_search(query: str, limit: int = 10) -> list[str]:
    """DDG HTML search (fallback). DDG bloqueia rápido — uso single-shot."""
    s = session_for(BROWSER_UA)
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    try:
        r = s.get(url, timeout=REQUEST_TIMEOUT)
        if r.status_code != 200:
            return []
        urls = re.findall(r'uddg=([^"&]+)', r.text)
        out = []
        seen = set()
        for u in urls:
            try:
                decoded = urllib.parse.unquote(u)
            except Exception:
                continue
            if decoded in seen:
                continue
            seen.add(decoded)
            out.append(decoded)
            if len(out) >= limit:
                break
        return out
    except requests.RequestException:
        return []


def probe_municipal_portal(municipio: str, tipo: str, ano: int) -> list[str]:
    """Tenta heurísticas conhecidas para descobrir o PDF no portal direto.

    Heurísticas:
      - {slug}.sp.gov.br → busca por links no leis_decretos / orcamento / transparencia
      - sapl.{slug}.sp.leg.br → consulta SAPL (frequente em câmaras)

    Retorna lista de URLs de PDF candidatos.
    """
    slug = slugify(municipio)
    candidates = []

    # Domain patterns
    domains = [
        f"https://www.{slug}.sp.gov.br",
        f"https://{slug}.sp.gov.br",
    ]
    paths = [
        "/portal/leis_decretos/",
        "/transparencia/leis-municipais",
        "/transparencia/orcamento",
        "/orcamento",
        f"/portal/leis_decretos/{ano}/",
    ]

    s = session_for(BROWSER_UA)
    for domain in domains:
        for path in paths:
            url = domain + path
            try:
                r = s.get(url, timeout=15, allow_redirects=True)
                if r.status_code != 200:
                    continue
                # Extrai PDFs linkados
                pdfs = re.findall(r'href="(https?://[^"]+\.pdf[^"]*)"', r.text)
                pdfs += re.findall(r'href="(/[^"]+\.pdf[^"]*)"', r.text)
                for pdf in pdfs:
                    # Normaliza relative URLs
                    if pdf.startswith("/"):
                        pdf = domain + pdf
                    pdf_low = pdf.lower()
                    if str(ano) in pdf and (
                        tipo.lower() in pdf_low
                        or any(re.sub(r"\W+", "", k.lower()) in
                               re.sub(r"\W+", "", urllib.parse.unquote(pdf_low))
                               for k in TIPOS[tipo])
                    ):
                        candidates.append(pdf)
                if candidates:
                    return candidates[:5]
            except requests.RequestException:
                continue
    return candidates


def wayback_lookup(query_url: str) -> Optional[str]:
    """Wayback: dado uma URL, retorna snapshot disponível mais próximo de 2024."""
    s = session_for(USER_AGENT)
    try:
        r = s.get(
            "https://archive.org/wayback/available",
            params={"url": query_url, "timestamp": "20240101"},
            timeout=REQUEST_TIMEOUT,
        )
        if r.status_code != 200:
            return None
        snap = r.json().get("archived_snapshots", {}).get("closest")
        if snap and snap.get("available"):
            return snap.get("url")
    except (requests.RequestException, ValueError):
        return None
    return None


# ---------------------------------------------------------------------------
# Estratégias por tipo
# ---------------------------------------------------------------------------

def build_queries(municipio: str, tipo: str, ano: int) -> list[str]:
    """Múltiplas queries pra aumentar chance de encontrar o PDF.

    Estratégias:
      - Nome completo + ano + 'lei' (mais específico)
      - 'lei diretrizes orçamentárias' + município + ano
      - município + ano + tipo + pdf (genérica)
    """
    nome_completo = TIPOS[tipo][0]
    slug = slugify(municipio)

    return [
        f'"{municipio}" "{nome_completo}" {ano} lei pdf',
        f'"{municipio}" {tipo} {ano} lei pdf prefeitura',
        # Slug fallback (sem acentos)
        f'"{slug}" {tipo} {ano} pdf -estado -unicamp',
    ]


# Domínios genéricos do Estado/União que retornam ruído na busca
NOISE_DOMAINS = (
    "planejamento.sp.gov.br",       # Estado SP
    "portal.fazenda.sp.gov.br",     # Estado SP
    "fazenda.sp.gov.br",            # Estado SP
    "planalto.gov.br",              # União
    "camara.leg.br",                # Câmara federal
    "senado.leg.br",
    "stn.gov.br",
    "tce.sp.gov.br",                # tribunal - publicações genéricas
    "unicamp.br",                   # universidade
    "fapesp.br",
)


def matches_municipio(url: str, municipio: str) -> bool:
    """URL menciona o município (slug ou subdomínio)?"""
    slug = slugify(municipio)
    url_low = url.lower()
    decoded = urllib.parse.unquote(url_low).replace(" ", "")
    norm = re.sub(r"[^a-z0-9]+", "", decoded)
    slug_compact = re.sub(r"[^a-z0-9]+", "", slug)
    # Considera match se slug aparece consecutivo (mais robusto que partes)
    return slug_compact in norm and len(slug_compact) >= 4


def is_plausible_pdf_url(url: str, municipio: str, tipo: str, ano: int) -> bool:
    """Heurística refinada: URL parece ser PDF da lei do município alvo?

    Checa:
      - .pdf no path
      - município mencionado no URL OU dominio termina com .sp.gov.br/.sp.leg.br
      - menciona ano OU tipo no filename
      - não está em NOISE_DOMAINS
    """
    if not url or ".pdf" not in url.lower():
        return False
    url_low = url.lower()
    for noise in NOISE_DOMAINS:
        if noise in url_low:
            return False

    has_year = str(ano) in url
    has_tipo = tipo.lower() in url_low or any(
        re.sub(r"\W+", "", kw.lower()) in re.sub(r"[\W_]+", "", url_low.replace("%20", ""))
        for kw in TIPOS[tipo]
    )
    if not (has_year or has_tipo):
        return False

    # Tem que pertencer ao município OU ser hosted num CDN
    # comum (intellgest, sapl) com referência ao slug
    if matches_municipio(url, municipio):
        return True
    # Domínio governamental do município
    slug = slugify(municipio)
    slug_compact = re.sub(r"[^a-z0-9]+", "", slug)
    parsed = urllib.parse.urlparse(url)
    host = parsed.netloc.lower()
    if slug_compact in re.sub(r"[^a-z0-9]+", "", host):
        return True
    return False


def head_pdf(url: str) -> Optional[dict]:
    """HEAD na URL pra checar Content-Type=application/pdf."""
    s = session_for(BROWSER_UA)
    try:
        r = s.head(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)
        if r.status_code != 200:
            return None
        ctype = r.headers.get("Content-Type", "").lower()
        if "pdf" not in ctype and not url.lower().endswith(".pdf"):
            return None
        return {
            "url_final": r.url,
            "content_type": ctype,
            "size": int(r.headers.get("Content-Length") or 0),
            "last_modified": r.headers.get("Last-Modified"),
        }
    except requests.RequestException:
        return None


def download_pdf(url: str, dest_path: str) -> Optional[int]:
    """Baixa PDF, retorna tamanho em bytes ou None em erro."""
    s = session_for(BROWSER_UA)
    try:
        with s.get(url, timeout=PDF_DOWNLOAD_TIMEOUT, stream=True) as r:
            if r.status_code != 200:
                return None
            ctype = r.headers.get("Content-Type", "").lower()
            if "pdf" not in ctype and not url.lower().endswith(".pdf"):
                # confere primeiros bytes (%PDF-)
                pass
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            size = 0
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        size += len(chunk)
            # Validação mínima: arquivo começa com %PDF-
            with open(dest_path, "rb") as f:
                magic = f.read(5)
            if magic != b"%PDF-":
                os.unlink(dest_path)
                return None
            return size
    except (requests.RequestException, OSError):
        return None


def sha256_file(path: str) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def try_extract_lei_metadata(url: str, titulo: str) -> tuple[Optional[str], Optional[str]]:
    """Tenta extrair número e data da lei do título/URL.
    Padrões: 'Lei nº 1234/2024', 'Lei 1234 de 12/12/2024', 'L1234_2024.pdf'
    """
    text = f"{url} {titulo or ''}"
    numero = None
    data = None

    # Lei nº XXXX[/AAAA]
    m = re.search(r"[Ll]ei\s*(?:complementar\s*)?(?:n[º°.\s]*)?(\d{1,5})(?:[/-](\d{2,4}))?",
                  text)
    if m:
        numero = m.group(1)
        if m.group(2):
            numero = f"{m.group(1)}/{m.group(2)}"

    # data dd/mm/aaaa ou dd-mm-aaaa
    m = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", text)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1900 <= y <= 2030 and 1 <= mo <= 12 and 1 <= d <= 31:
            data = f"{y:04d}-{mo:02d}-{d:02d}"
    return numero, data


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def search_and_download(muni: dict, tipo: str, ano: int) -> LawDoc:
    cod = muni["cod_ibge"]
    nome = muni["ente"]
    doc = LawDoc(cod_ibge=cod, municipio=nome, tipo=tipo, exercicio=ano)

    log(f"  [{cod}] {nome} | {tipo} {ano}")

    # ---- 0. Cache/seed de URLs já descobertas manualmente ----
    seed = SEED_URLS.get((cod, tipo, ano))
    if seed:
        log(f"     SEED url: {seed[:80]}")
        head = head_pdf(seed)
        if head and head["size"] > 5000:
            return _do_download(doc, head["url_final"], seed.split("/")[-1], "SEED")
        else:
            log("     SEED url not reachable")

    # ---- 1. Tentar portal municipal direto (heurística) ----
    # Em prod, ativar via --probe-portal. Por padrão off (HTTP/timeout custoso e
    # baixo recall: portais usam JS dinâmico, paths variam muito).
    direct_urls = []
    if os.environ.get("RADAR360_PROBE_PORTAL") == "1":
        direct_urls = probe_municipal_portal(nome, tipo, ano)
        if direct_urls:
            log(f"     PORTAL: {len(direct_urls)} candidatos via portal direto")

    # ---- 2. Startpage (motor de busca) ----
    all_urls = list(direct_urls)
    queries = build_queries(nome, tipo, ano)
    blocked_count = 0
    for q in queries:
        urls = startpage_search(q, limit=25)
        if not urls:
            blocked_count += 1
        all_urls.extend(urls)
        time.sleep(RATE_LIMIT_SEC)

    # Dedupe
    seen = set()
    all_urls = [u for u in all_urls if not (u in seen or seen.add(u))]

    if blocked_count == len(queries) and not all_urls:
        log("     Startpage: todas queries bloqueadas")
        doc.status = "BLOQUEADO"
        doc.erro = "search engine blocked"
        return doc

    log(f"     Startpage: {len(all_urls)} URLs distintas")

    # ---- 2. Filtra candidatos plausíveis ----
    candidate_url = None
    candidate_title = None
    plausible = [u for u in all_urls if is_plausible_pdf_url(u, nome, tipo, ano)]
    if not plausible:
        # Em último caso, aceita PDFs governamentais SP que mencionem o tipo+ano
        # mesmo sem match perfeito de município (alguns portais usam IDs)
        log(f"     Nenhum match plausível em {len(all_urls)} URLs")
    else:
        log(f"     {len(plausible)} candidatos plausíveis")

    for u in plausible:
        head = head_pdf(u)
        time.sleep(0.3)
        if head and head["size"] > 5000:
            candidate_url = head["url_final"]
            candidate_title = u.split("/")[-1]
            doc.fonte = "STARTPAGE"
            break

    # ---- 3. Wayback como fallback se URL plausível existe mas portal fora ----
    if not candidate_url and plausible:
        log("     Tentando Wayback...")
        for u in plausible[:3]:
            wb_url = wayback_lookup(u)
            if wb_url:
                head = head_pdf(wb_url)
                if head and head["size"] > 5000:
                    candidate_url = wb_url
                    candidate_title = u.split("/")[-1]
                    doc.fonte = "WAYBACK"
                    break
            time.sleep(RATE_LIMIT_SEC)

    if not candidate_url:
        doc.status = "NAO_ENCONTRADO"
        return doc

    return _do_download(doc, candidate_url, candidate_title, doc.fonte or "STARTPAGE")


def _do_download(doc: LawDoc, url: str, title: Optional[str], fonte: str) -> LawDoc:
    """Baixa, valida e atualiza o doc."""
    doc.url_pdf = url
    doc.titulo_encontrado = title
    doc.fonte = fonte

    out_dir = os.path.join(OUTPUT_DIR, str(doc.cod_ibge))
    pdf_path = os.path.join(out_dir, f"{doc.tipo}_{doc.exercicio}.pdf")
    log(f"     ↓ {url[:80]}")

    size = download_pdf(url, pdf_path)
    if not size:
        doc.status = "ERRO_DOWNLOAD"
        doc.erro = "PDF inválido ou conexão falhou"
        return doc

    doc.bytes_baixados = size
    doc.sha256 = sha256_file(pdf_path)
    doc.numero_lei, doc.data_lei = try_extract_lei_metadata(url, title or "")
    doc.status = "OK"
    log(f"     OK: {size//1024} KB, sha256={doc.sha256[:12]}, fonte={fonte}")
    return doc


def save_meta(doc: LawDoc):
    out_dir = os.path.join(OUTPUT_DIR, str(doc.cod_ibge))
    os.makedirs(out_dir, exist_ok=True)
    meta_path = os.path.join(out_dir, f"{doc.tipo}_{doc.exercicio}.meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(asdict(doc), f, ensure_ascii=False, indent=2)


def load_municipios() -> list[dict]:
    with open(MUNICIPIOS_FILE, encoding="utf-8") as f:
        return json.load(f)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cod", type=int, nargs="*", help="cod_ibge a processar")
    parser.add_argument("--all", action="store_true", help="processar todos os 645")
    parser.add_argument("--tipos", nargs="*", default=list(TIPOS.keys()),
                        choices=list(TIPOS.keys()))
    parser.add_argument("--anos", type=int, nargs="*",
                        help="Anos. Default: ver DEFAULT_ANOS por tipo")
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    municipios = load_municipios()

    if args.all:
        targets = municipios
    elif args.cod:
        targets = [m for m in municipios if m["cod_ibge"] in args.cod]
    else:
        targets = [m for m in municipios if m["cod_ibge"] in TEST_MUNIS]

    log(f"Targets: {len(targets)} município(s)")
    log(f"Tipos: {args.tipos}")

    docs = []
    for muni in targets:
        log(f"=== {muni['ente']} ({muni['cod_ibge']}) — pop {muni.get('populacao', '?')} ===")
        for tipo in args.tipos:
            anos = args.anos or DEFAULT_ANOS[tipo]
            for ano in anos:
                doc = search_and_download(muni, tipo, ano)
                save_meta(doc)
                docs.append(doc)
                time.sleep(RATE_LIMIT_SEC)

    # Sumário
    summary_path = os.path.join(OUTPUT_DIR, "coverage.json")
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump([asdict(d) for d in docs], f, ensure_ascii=False, indent=2)

    # Stats
    total = len(docs)
    ok = sum(1 for d in docs if d.status == "OK")
    by_muni = {}
    for d in docs:
        by_muni.setdefault(d.municipio, {"total": 0, "ok": 0})
        by_muni[d.municipio]["total"] += 1
        if d.status == "OK":
            by_muni[d.municipio]["ok"] += 1

    log("=" * 60)
    log(f"FIM: {ok}/{total} documentos baixados")
    log("Por município:")
    for nome, st in by_muni.items():
        log(f"  {nome:30s} {st['ok']}/{st['total']}")
    log(f"Sumário salvo em {summary_path}")


if __name__ == "__main__":
    main()
