"""Parser para portais municipais SP da família Instar Tecnologia.

Identificação:
  - Classes CSS proprietárias: sw_lato_bold, sw_lato_black, sw_ubuntu
  - Path padrão: /portal/leis_decretos/
  - Endpoint AJAX: /portal/leis_decretos/acao/

URL schema do search avançado (descoberto via JS submit handler):
  /portal/leis_decretos/{pagina}/{dataIni}/{dataFin}/{assunto}/{categoria}/
      {numero}/{ano}/{ementa}/{situacao}/{autor}/{vereador}/{mesa}/{comissao}/
      {nome}/{numeroIni}/{numeroFin}/{anoIni}/{anoFin}/{opcoesFiltro}/
      {ordenacao}/{tipoBuscaNav}/{secretaria}

  Use "0" para campos vazios.
  ementa é text de busca (URL-encoded). tipoBuscaNav = "simples" ou "avancada".

Estratégia para encontrar PPA/LDO/LOA:
  - Busca por ementa "diretrizes orçamentárias" + ano → LDO
  - Busca por ementa "lei orçamentária" + ano → LOA
  - Busca por ementa "plano plurianual" + ano → PPA

Para cada match (lei detail page):
  - Extrai número da lei, data, ementa do HTML
  - Faz POST acao=anexos&id={lei_id} pra listar PDFs anexos
  - Retorna URL do PDF principal ou URL da página HTML (texto inline)
"""
from __future__ import annotations

import json
import re
import time
import urllib.parse
from typing import Optional

import requests

USER_AGENT = "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"
TIMEOUT = 8.0
RATE_LIMIT = 1.0

# Buscas de ementa por tipo
SEARCH_TERMS = {
    "LDO": "diretrizes orcamentarias",
    "LOA": "lei orcamentaria anual",
    "PPA": "plano plurianual",
}

# Variações alternativas (caso a primeira não case)
SEARCH_TERMS_ALT = {
    "LDO": ["diretrizes orçamentárias", "LDO"],
    "LOA": ["orçamento anual", "lei orçamentária"],
    "PPA": ["PPA", "plurianual"],
}


def _session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Accept": "text/html,application/xhtml+xml",
    })
    return s


def _build_search_url(base: str, ementa: str = "0", ano: str = "0",
                      categoria: str = "0", assunto: str = "0") -> str:
    """Constrói URL de busca avançada Instar com slots posicionais.

    Schema (descoberto via JS submit handler):
      /portal/leis_decretos/{pagina}/{dataIni}/{dataFin}/{assunto}/{categoria}/
        {numero}/{ano}/{ementa}/{situacao}/{autor}/{vereador}/{mesa}/{comissao}/
        {nome}/{numIni}/{numFin}/{anoIni}/{anoFin}/{opcoes}/{ordenacao}/
        {tipoBusca}/{secretaria}

    - assunto: filtra por tema (ex: 65=Diretrizes Orçamentárias)
    - categoria: filtra por tipo doc (ex: 1=Lei Ordinária, 2=Lei Complementar)
    - ementa: texto livre de busca
    """
    ementa_enc = urllib.parse.quote(ementa, safe="") if ementa != "0" else "0"
    parts = [
        "1",          # pagina
        "0", "0",     # dataIni, dataFin
        assunto,      # assunto (tema/categoria orçamentária)
        categoria,    # categoria (tipo doc)
        "0",          # numero
        ano,          # ano
        ementa_enc,   # ementa
        "0",          # situacao
        "0", "0", "0", "0", "0",  # autor/vereador/mesa/comissao/nome
        "0", "0",     # numIni, numFin
        "0", "0",     # anoIni, anoFin
        "E",          # opcoesFiltro
        "data-decrescente",
        "avancada",
        "0",          # secretaria
    ]
    return base.rstrip("/") + "/portal/leis_decretos/" + "/".join(parts)


def _extract_law_cards(html: str) -> list[dict]:
    """Da página de listing, extrai cards das leis: id, numero, titulo, ementa.

    Estrutura Instar (descoberta por inspeção):
      <div class="leg_norma_listagem ...">
        <div class="leg_titulo_norma">
          <div class="leg_numero_norma"><span>Nº 4376</span></div>
          <div class="leg_categoria_norma">Lei Ordinária</div>
          ...
          <a href="/portal/leis_decretos/{lei_id}/">      ← detalhe
          <a href="/portal/download/legislacao/{token}/"> ← PDF (quando existe)
        </div>
        ...<strong>Data:</strong> 26/08/2024
        <div class="leg_ementa_listagem ...">Ementa...</div>
      </div>
    """
    out: list[dict] = []
    # Quebra HTML em chunks usando as posições dos divs leg_norma_listagem
    starts = [m.start() for m in re.finditer(
        r'<div class="leg_norma_listagem', html)]
    starts.append(len(html))
    seen_ids: set[str] = set()
    for i in range(len(starts) - 1):
        card = html[starts[i]: starts[i + 1]]
        if "leg_titulo_norma" not in card:
            continue
        # ID da lei: pode estar em <a href="/portal/leis_decretos/{id}/"> (sites
        # maiores) OU em <input class="leg_id_norma" value="{id}"> (todos sites)
        m_id = re.search(r'href="/portal/leis_decretos/(\d+)/"', card)
        if m_id:
            lei_id = m_id.group(1)
        else:
            m_id2 = re.search(r'class="leg_id_norma"[^>]+value="(\d+)"', card)
            if not m_id2:
                continue
            lei_id = m_id2.group(1)
        if lei_id in seen_ids:
            continue
        seen_ids.add(lei_id)

        # Numero da lei
        m_num = re.search(r'leg_numero_norma[^>]*>\s*<span>([^<]+)</span>', card)
        numero_raw = (m_num.group(1).strip() if m_num else "").lstrip("Nº ").strip()

        # Categoria (Lei Ordinária, Lei Complementar, Decreto...)
        m_cat = re.search(r'leg_categoria_norma[^>]*>\s*([^<]+?)\s*</div>', card)
        categoria = m_cat.group(1).strip() if m_cat else ""

        # Data dd/mm/yyyy
        m_data = re.search(r'<strong>Data:</strong>\s*([0-9/]+)', card)
        data_str = m_data.group(1).strip() if m_data else ""

        # Ementa
        m_em = re.search(r'leg_ementa_listagem[^>]*>([^<]+)', card)
        ementa = m_em.group(1).strip() if m_em else ""

        # PDF download token (quando existe — não tem em todas leis)
        m_dl = re.search(r'href="(/portal/download/legislacao/[^"]+)"', card)
        download_path = m_dl.group(1) if m_dl else None

        # Titulo sintético no formato Instar
        titulo = f"{categoria.upper()} Nº {numero_raw}"
        if data_str:
            titulo += f", {data_str}"

        out.append({
            "lei_id": lei_id,
            "url_detalhe_path": f"/portal/leis_decretos/{lei_id}/",
            "url_download_path": download_path,
            "numero": numero_raw,
            "categoria": categoria,
            "data_str": data_str,
            "titulo": titulo,
            "ementa": re.sub(r"\s+", " ", ementa).strip(),
        })
    return out


def _detect_assunto_for_tipo(base: str, session: requests.Session,
                              tipo: str) -> Optional[str]:
    """Discover the ASSUNTO ID matching this tipo on this municipality.

    Em Instar, "assunto" = tema temático (Diretrizes Orçamentárias, Plano
    Plurianual, Orça Receita/Despesa). "Categoria" = tipo de documento
    (Lei Ordinária, Decreto). Para PPA/LDO/LOA, filtramos POR ASSUNTO.

    Cada município tem sua própria taxonomia; o ID varia.
    """
    try:
        r = session.get(base.rstrip("/") + "/portal/leis_decretos/",
                        timeout=TIMEOUT)
        if r.status_code != 200:
            return None
    except requests.RequestException:
        return None

    html = r.text
    # Encontra form_assunto e extrai options
    options: list[tuple[str, str]] = []
    for m in re.finditer(
        r'<select[^>]+(?:id="form_assunto"|name="form_assunto")[^>]*>(.*?)</select>',
        html, re.DOTALL,
    ):
        block = m.group(1)
        for opt in re.finditer(
            r"<option[^>]+value=['\"]?([0-9]+)['\"]?[^>]*>([^<]+)",
            block,
        ):
            options.append((opt.group(1), opt.group(2)))
    if not options:
        return None
    # Keywords por tipo, ordenado por especificidade
    keywords = {
        "LDO": ["diretrizes orçament", "diretrizes orcament", "ldo"],
        "LOA": ["orça receita", "orca receita", "orçamento anual",
                 "lei orçamentária anual", "loa"],
        "PPA": ["plano plurianual - ppa", "plurianual - ppa", "plurianual"],
    }
    # Match priorizando o mais específico
    for kw in keywords.get(tipo, []):
        for value, text in options:
            if kw in text.lower():
                return value
    return None


def _ementa_matches_tipo(ementa: str, titulo: str, tipo: str,
                          categoria: str = "") -> bool:
    """Confirma que o card retornado realmente é do tipo procurado.

    Para LDO/LOA/PPA, queremos APENAS Lei Ordinária/Complementar — não
    Decretos regulamentadores. Decretos como '7136 - estima receita e fixa
    despesa' são apenas operacionais.
    """
    blob = (ementa + " " + titulo).lower()
    cat_low = categoria.lower()
    # Filtra decretos / portarias — só queremos a LEI
    if "decreto" in cat_low or "portaria" in cat_low or "instru" in cat_low:
        return False
    if tipo == "LDO":
        return ("diretrizes orçament" in blob or "diretrizes orcament" in blob
                or "diretriz orçament" in blob or " ldo " in blob
                or blob.startswith("ldo"))
    if tipo == "LOA":
        # LOA tem termos específicos: "estima a receita", "fixa a despesa",
        # "lei orçamentária anual"
        return ("lei orçamentária" in blob or "lei orcamentaria" in blob
                or "orçamento anual" in blob
                or ("estima" in blob and "receita" in blob and "despesa" in blob)
                or "loa" in blob[:200])
    if tipo == "PPA":
        return "plurianual" in blob or " ppa " in blob
    return False


def _extract_ano_from_ementa(ementa: str, titulo: str, tipo: str) -> Optional[int]:
    """Determina o ano de vigência da lei a partir da ementa.

    LDO/LOA: ementa diz 'exercício financeiro de 2025' → ano = 2025
    PPA: ementa diz 'período 2026-2029' OR 'quadriênio 2026-2029' → ano = 2026
    """
    if tipo == "PPA":
        # PPA: range (2026-2029) ou (2022/2025)
        for pat in (
            r"(?:per[íi]odo|qu[aá]dri[êe]nio)[^0-9]{0,30}(20\d{2})\s*[-/–a]+\s*(20\d{2})",
            r"(20\d{2})\s*[-/–]\s*(20\d{2})",
            r"\bexerc[íi]cios\s+(?:de\s+)?(20\d{2})\s+a\s+(20\d{2})",
        ):
            m = re.search(pat, ementa, re.IGNORECASE)
            if m:
                return int(m.group(1))
        # Sem range, mas ementa menciona um ano só (ex: PPA "2026")
        m = re.search(r"\b(20\d{2})\b", ementa)
        if m:
            return int(m.group(1))
        return None
    # LDO / LOA
    m = re.search(r"exerc[íi]cio[^0-9]{0,40}(\d{4})", ementa, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # Próximo ano após a data da lei (heurística — LDO publicada em 2023 = 2024)
    m = re.search(r"\b(20\d{2})\b", ementa)
    if m:
        return int(m.group(1))
    return None


def _fetch_anexos(base: str, session: requests.Session, lei_id: str) -> list[str]:
    """POST acao=anexos&id={lei_id} → retorna lista de URLs absolutas de PDFs."""
    try:
        r = session.post(
            base.rstrip("/") + "/portal/leis_decretos/acao/",
            data={"acao": "anexos", "id": lei_id},
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": base.rstrip("/") + f"/portal/leis_decretos/{lei_id}/",
            },
            timeout=TIMEOUT,
        )
        if r.status_code != 200:
            return []
        data = json.loads(r.text)
    except (requests.RequestException, json.JSONDecodeError):
        return []
    conteudo = data.get("conteudo") or ""
    if not conteudo:
        return []
    urls = re.findall(r'href="(/portal/download/legislacao-anexos/[^"]+)"',
                      conteudo)
    return [base.rstrip("/") + u for u in urls]


def find_documents(cod_ibge: int, url_base: str) -> list[dict]:
    """Procura PPA/LDO/LOA neste portal Instar.

    Retorna lista de dicts:
      {
        "tipo": "LDO" | "LOA" | "PPA",
        "ano": int,                 # ano de vigência
        "url_pdf": Optional[str],   # primeiro PDF anexo
        "url_anexos": list[str],    # todos PDFs anexos (pode estar vazio)
        "url_html": str,            # página detalhe da lei (texto inline)
        "titulo": str,              # ex "LEI ORDINÁRIA Nº 4376, 26 DE AGOSTO DE 2024"
        "numero_lei": str,
        "ementa": str,
        "data_lei": Optional[str],  # ISO yyyy-mm-dd
      }
    """
    session = _session()
    base = url_base.rstrip("/")
    results: list[dict] = []

    # Para cada tipo, MESCLAMOS resultados de 2 estratégias:
    #  (a) filtro por assunto temático (Diretrizes Orçamentárias, etc.)
    #  (b) busca por texto livre na ementa
    # Algumas leis estão fora do assunto correto mas aparecem na busca textual,
    # e vice-versa. Mesclar maximiza recall.
    for tipo in ("LDO", "LOA", "PPA"):
        assunto_id = _detect_assunto_for_tipo(base, session, tipo) or "0"
        time.sleep(RATE_LIMIT)

        all_cards: dict[str, dict] = {}

        # Estratégia (a) — assunto
        if assunto_id != "0":
            url1 = _build_search_url(base, assunto=assunto_id)
            try:
                r = session.get(url1, timeout=TIMEOUT)
                if r.status_code == 200:
                    for c in _extract_law_cards(r.text):
                        all_cards[c["lei_id"]] = c
            except requests.RequestException:
                pass
            time.sleep(RATE_LIMIT)

        # Estratégia (b) — ementa text (todas variações)
        for query in [SEARCH_TERMS[tipo]] + SEARCH_TERMS_ALT.get(tipo, []):
            url2 = _build_search_url(base, ementa=query)
            try:
                r = session.get(url2, timeout=TIMEOUT)
                if r.status_code == 200:
                    for c in _extract_law_cards(r.text):
                        all_cards.setdefault(c["lei_id"], c)
            except requests.RequestException:
                pass
            time.sleep(RATE_LIMIT)
            # Após 1 query bem-sucedida, se já temos resultados, podemos parar
            if len(all_cards) >= 5:
                break

        cards = list(all_cards.values())

        for card in cards:
            if not _ementa_matches_tipo(card["ementa"], card["titulo"], tipo,
                                         card.get("categoria", "")):
                continue
            ano = _extract_ano_from_ementa(card["ementa"], card["titulo"], tipo)
            if not ano:
                continue
            # Data da lei (já dd/mm/yyyy → ISO)
            data_lei = _data_to_iso(card.get("data_str", ""))
            # PDF do texto da lei: o botão "Baixar" da listagem dá download direto
            url_pdf = (base + card["url_download_path"]
                       if card.get("url_download_path") else None)
            url_html = base + card["url_detalhe_path"]
            # Fetch anexos (PDFs adicionais — tabelas, demonstrativos)
            time.sleep(RATE_LIMIT)
            anexos = _fetch_anexos(base, session, card["lei_id"])
            results.append({
                "tipo": tipo,
                "ano": ano,
                "url_pdf": url_pdf,
                "url_anexos": anexos,
                "url_html": url_html,
                "titulo": card["titulo"],
                "numero_lei": card["numero"],
                "ementa": card["ementa"],
                "data_lei": data_lei,
            })

    return _dedupe(results)


def _data_to_iso(data_str: str) -> Optional[str]:
    """'26/08/2024' → '2024-08-26'."""
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", data_str.strip())
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{y:04d}-{mo:02d}-{d:02d}"


def _parse_data_lei(titulo: str) -> Optional[str]:
    """'LEI ORDINÁRIA Nº 4376, 26 DE AGOSTO DE 2024' → '2024-08-26'."""
    meses = {
        "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3, "abril": 4,
        "maio": 5, "junho": 6, "julho": 7, "agosto": 8, "setembro": 9,
        "outubro": 10, "novembro": 11, "dezembro": 12,
    }
    m = re.search(
        r"(\d{1,2})\s+DE\s+([A-Za-zÇçÃãÁáÉéÍíÓóÚúÊê]+)\s+DE\s+(\d{4})",
        titulo, re.IGNORECASE,
    )
    if not m:
        # tentar dd/mm/aaaa
        m2 = re.search(r"(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})", titulo)
        if m2:
            d, mo, y = m2.group(1), m2.group(2), m2.group(3)
            return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
        return None
    day = int(m.group(1))
    mes_name = m.group(2).lower()
    year = int(m.group(3))
    mes = meses.get(mes_name)
    if not mes:
        return None
    return f"{year:04d}-{mes:02d}-{day:02d}"


def _pick_primary_pdf(urls: list[str]) -> Optional[str]:
    """Escolhe o PDF principal (texto da lei), descartando 'Anexo III' etc.

    Heurística: arquivos com 'lei' no nome ou sem 'anexo' no path.
    """
    if not urls:
        return None
    # Os download URLs Instar têm tokens cifrados; o nome do anexo está só
    # na JSON resposta. Aqui retornamos o primeiro como fallback simples.
    return urls[0]


def _dedupe(docs: list[dict]) -> list[dict]:
    """Remove duplicatas (tipo, ano), preferindo o mais recente (data_lei)."""
    by_key: dict[tuple, dict] = {}
    for d in docs:
        key = (d["tipo"], d["ano"])
        cur = by_key.get(key)
        if cur is None or (d.get("data_lei") or "") > (cur.get("data_lei") or ""):
            by_key[key] = d
    return list(by_key.values())


if __name__ == "__main__":
    # Smoke test
    import sys
    base = sys.argv[1] if len(sys.argv) > 1 else "https://www.adamantina.sp.gov.br"
    docs = find_documents(3500105, base)
    for d in docs:
        print(d["tipo"], d["ano"], "|", d["titulo"][:80],
              "| anexos:", len(d["url_anexos"]))
