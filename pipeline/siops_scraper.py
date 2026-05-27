#!/usr/bin/env python3
"""
SIOPS Scraper — Municípios de SP
=================================
Coleta os "Indicadores Municipais" do SIOPS (Sistema de Informações sobre
Orçamentos Públicos em Saúde — Ministério da Saúde / DataSUS) para os 645
municípios paulistas.

Por que não API: SIOPS não publica API REST pública. A entrega oficial é via
navegação por formulário HTTP POST em
  http://siops.datasus.gov.br/relindicadoresmun2.php
que dispara um POST em
  http://siops.datasus.gov.br/consdetalhereenvio2.php
retornando uma tabela HTML com 14 indicadores municipais (séries 1.x receitas,
2.x despesas, 3.x aplicação ASPS).

Periodicidade: BIMESTRAL (6 períodos por ano). Códigos de período da página:
  12 = 1º bim   14 = 2º bim   1 = 3º bim
  18 = 4º bim   20 = 5º bim   2 = 6º bim (encerramento anual)

Indicador-chave: 3.2 = % da receita própria aplicada em Saúde (LC 141/2012,
piso de 15% para municípios).

Estratégia:
  - Rate limit 1 req/s (~1.5s de gap real entre POSTs).
  - User-Agent identifica o operador.
  - Saída por (ano, período): JSON cru + CSV achatado + status.json.
  - status.json: PUBLICADO / NAO_PUBLICADO / ERRO_COLETA por (município, periodo).
  - Range: 2023-2026, 6 bimestres cada (auto-skip de períodos cujo prazo
    legal de envio ainda não venceu — SIOPS exige envio até o dia 30 do mês
    seguinte ao fim do bimestre, Portaria GM/MS 53/2013).
  - Suporte a "apenas X municípios" via --limit para testes.
"""

import argparse
import csv
import html
import json
import os
import re
import sys
import time
from datetime import datetime

import requests

BASE_URL = "http://siops.datasus.gov.br"
FORM_URL = f"{BASE_URL}/consdetalhereenvio2.php"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "siops_data")
MUNICIPIOS_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "siconfi_data", "municipios_sp.json",
)

UF_SP = 35  # código IBGE da UF São Paulo no SIOPS

# (label, código_periodo_siops, ord_bimestre) — ord_bimestre é o que salvamos
# no DB (1..6) por ser intuitivo; o código_periodo é só pro POST.
PERIODOS_BIMESTRAIS = [
    (1, 12),
    (2, 14),
    (3, 1),
    (4, 18),
    (5, 20),
    (6, 2),
]

ANOS = (2023, 2024, 2025, 2026)

# Mapeamento código SIOPS → identificador estável (snake_case) + descrição +
# limite_legal + base_calculo
# Base de cálculo "%" = percentual; "R$" = valor monetário absoluto.
INDICADORES_MAP = {
    "1.1": ("part_impostos_receita_total",
            "Participação da receita de impostos na receita total do Município",
            None, "pct"),
    "1.2": ("part_transferencias_intergov",
            "Participação das transferências intergovernamentais na receita total",
            None, "pct"),
    "1.3": ("part_transf_sus_total",
            "Participação das transferências para Saúde (SUS) no total transferido ao Município",
            None, "pct"),
    "1.4": ("part_transf_uniao_saude",
            "Participação das transferências da União para Saúde no total de transferências para saúde",
            None, "pct"),
    "1.5": ("part_transf_uniao_saude_total_uniao",
            "Participação das transferências da União para Saúde (SUS) no total da União para o Município",
            None, "pct"),
    "1.6": ("part_impostos_transf_const_receita_total",
            "Participação da Receita de Impostos e Transferências Constitucionais e Legais na Receita Total",
            None, "pct"),
    "2.1": ("despesa_saude_per_capita",
            "Despesa total com Saúde, em R$/hab, sob responsabilidade do Município",
            None, "rs_per_capita"),
    "2.2": ("part_pessoal_despesa_saude",
            "Participação da despesa com pessoal na despesa total com Saúde",
            None, "pct"),
    "2.3": ("part_medicamentos_despesa_saude",
            "Participação da despesa com medicamentos na despesa total com Saúde",
            None, "pct"),
    "2.4": ("part_servicos_terceiros_pj_despesa_saude",
            "Participação da despesa com serviços de terceiros (PJ) na despesa total com Saúde",
            None, "pct"),
    "2.5": ("part_investimentos_despesa_saude",
            "Participação da despesa com investimentos na despesa total com Saúde",
            None, "pct"),
    "2.6": ("part_instituicoes_privadas_sem_fins",
            "Despesas com Instituições Privadas Sem Fins Lucrativos",
            None, "pct"),
    "3.1": ("part_transf_saude_despesa_saude",
            "Participação das transferências para Saúde em relação à despesa total com saúde",
            None, "pct"),
    "3.2": ("asps_pct",
            "Participação da receita própria aplicada em Saúde conforme LC 141/2012 (piso 15%)",
            15.0, "pct"),
}

REQUEST_TIMEOUT = 60
RATE_GAP = 1.2          # gap entre POSTs (segundos). Limite real ~1 req/s.
MAX_RETRIES = 3

STATUS_PUBLICADO = "PUBLICADO"
STATUS_NAO_PUBLICADO = "NAO_PUBLICADO"
STATUS_ERRO = "ERRO_COLETA"

session = requests.Session()
session.headers.update(
    {"User-Agent": "Radar360-SP/1.0 (raphael.ruiz@betteredu.com.br)"}
)


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def is_extraction_due(ano, ord_bim, today=None):
    """SIOPS: prazo de envio = dia 30 do mês seguinte ao fim do bimestre
    (Port. GM/MS 53/2013). Damos +30 dias de folga p/ consolidação."""
    today = today or datetime.now()
    fim_mes = ord_bim * 2          # bim 1 → mês 2, bim 6 → mês 12
    dy, dm = ano, fim_mes + 2      # +1 prazo legal +1 folga
    while dm > 12:
        dy += 1
        dm -= 12
    return today >= datetime(dy, dm, 1)


def _parse_value(raw):
    """Converte '14,37 %', 'R$ 2.092,03', '0,00' em float ou None."""
    if raw is None:
        return None
    s = html.unescape(raw)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("\xa0", " ").replace("&nbsp;", " ")
    s = re.sub(r"[Rr]\$|%|\s", "", s)
    if not s or s in ("-", "--"):
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def parse_indicators(html_text):
    """Extrai dict {codigo_siops: valor_float} da tabela de indicadores."""
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html_text, re.DOTALL)
    out = {}
    for tr in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.DOTALL)
        if len(cells) < 3:
            continue
        code = re.sub(r"<[^>]+>", "", cells[0]).strip()
        if not re.match(r"^\d+\.\d+$", code):
            continue
        # valor está na última célula (ou penúltima quando há "Transmissão Única")
        val = _parse_value(cells[-1])
        if val is None and len(cells) >= 4:
            val = _parse_value(cells[-2])
        if code in INDICADORES_MAP:
            out[code] = val
    return out


def fetch_one(cod_ibge, ano, periodo_codigo):
    """POST único. Retorna (raw_html, parsed_dict, error_str_or_None).
    cod_ibge: 7-dígitos IBGE (ex 3500105). SIOPS aceita os 6 primeiros."""
    # SIOPS usa os 6 primeiros dígitos (cod IBGE truncado, padrão MS).
    cod_siops = int(str(cod_ibge)[:6])
    data = {
        "cmbAno": str(ano),
        "cmbPeriodo": str(periodo_codigo),
        "cmbUF": str(UF_SP),
        "cmbMunicipio[]": str(cod_siops),
        "BtConsultar": "Consultar",
        "siops": "10",
    }
    for attempt in range(MAX_RETRIES):
        try:
            r = session.post(FORM_URL, data=data, timeout=REQUEST_TIMEOUT)
            r.raise_for_status()
            # SIOPS responde latin-1
            r.encoding = "iso-8859-1"
            text = r.text
            parsed = parse_indicators(text)
            return text, parsed, None
        except Exception as e:
            err = str(e)
            if attempt < MAX_RETRIES - 1:
                time.sleep(3 * (attempt + 1))
    return None, {}, err


def load_municipios(limit=None):
    with open(MUNICIPIOS_FILE, "r", encoding="utf-8") as f:
        munis = json.load(f)
    if limit:
        munis = munis[:limit]
    return munis


def load_existing(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as f:
        items = json.load(f)
    return {it["cod_ibge"]: it for it in items}


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


def extract_one(municipios, ano, ord_bim, periodo_codigo, force=False):
    """Coleta um (ano, bimestre) para todos os municípios passados.
    Retorna # de novos municípios extraídos."""
    prefix = f"siops_{ano}_bim{ord_bim}"
    json_path = os.path.join(OUTPUT_DIR, f"{prefix}.json")
    status_path = os.path.join(OUTPUT_DIR, f"{prefix}.status.json")

    existing = load_existing(json_path)    # {cod_ibge: full_row_dict}
    status_map = load_status(status_path)  # {cod_ibge: status}

    to_fetch = []
    for m in municipios:
        cod = m["cod_ibge"]
        if not force and status_map.get(cod) == STATUS_PUBLICADO and cod in existing:
            continue
        to_fetch.append(m)

    if not to_fetch:
        log(f"  {prefix}: completo ({len(existing)} munis) - skip")
        return 0

    log(f"{prefix}: {len(to_fetch)}/{len(municipios)} a buscar (existing: {len(existing)})")

    novos = done = 0
    for m in to_fetch:
        cod = m["cod_ibge"]
        nome = m.get("ente", "?")
        _, indicadores, err = fetch_one(cod, ano, periodo_codigo)
        done += 1

        if err:
            status_map[cod] = STATUS_ERRO
        elif not indicadores:
            status_map[cod] = STATUS_NAO_PUBLICADO
        else:
            status_map[cod] = STATUS_PUBLICADO
            existing[cod] = {
                "cod_ibge": cod,
                "nome": nome,
                "ano": ano,
                "bimestre": ord_bim,
                "indicadores": indicadores,        # {codigo_siops: valor_float}
                "coletado_em": datetime.now().isoformat(),
            }
            novos += 1

        if done % 10 == 0 or done == len(to_fetch):
            pub = sum(1 for s in status_map.values() if s == STATUS_PUBLICADO)
            np_ = sum(1 for s in status_map.values() if s == STATUS_NAO_PUBLICADO)
            er = sum(1 for s in status_map.values() if s == STATUS_ERRO)
            log(f"  {done}/{len(to_fetch)} | P:{pub} N:{np_} E:{er} | último: {nome}")

        time.sleep(RATE_GAP)

    save_json(list(existing.values()), f"{prefix}.json")
    # CSV achatado: uma linha por (município, indicador)
    flat = []
    for row in existing.values():
        for codigo, valor in row["indicadores"].items():
            ident, _, _, _ = INDICADORES_MAP.get(codigo, (codigo, "", None, None))
            flat.append({
                "cod_ibge": row["cod_ibge"],
                "nome": row["nome"],
                "ano": row["ano"],
                "bimestre": row["bimestre"],
                "indicador_codigo_siops": codigo,
                "indicador": ident,
                "valor": valor,
            })
    save_csv(flat, f"{prefix}.csv")
    save_json(status_map, f"{prefix}.status.json")

    log(f"  {prefix}: salvos {len(existing)} munis / +{novos} novos")
    return novos


def write_coverage_summary(municipios):
    summary = {
        m["cod_ibge"]: {
            "cod_ibge": m["cod_ibge"],
            "nome": m.get("ente"),
            "pop": m.get("populacao"),
        }
        for m in municipios
    }
    for ano in ANOS:
        for ord_bim, _ in PERIODOS_BIMESTRAIS:
            prefix = f"siops_{ano}_bim{ord_bim}"
            sm = load_status(os.path.join(OUTPUT_DIR, f"{prefix}.status.json"))
            for cod, st in sm.items():
                if cod in summary:
                    summary[cod][prefix] = st
    save_json(list(summary.values()), "coverage.json")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="Coletar só os N primeiros municípios (teste)")
    ap.add_argument("--ano", type=int, default=None,
                    help="Restringir a 1 ano (senão roda 2023-2026)")
    ap.add_argument("--bimestre", type=int, default=None,
                    help="Restringir a 1 bimestre (1..6)")
    ap.add_argument("--force", action="store_true",
                    help="Re-buscar mesmo PUBLICADO em cache")
    args = ap.parse_args()

    start = datetime.now()
    log("=" * 64)
    log("SIOPS Scraper — Municípios SP")
    if args.limit:
        log(f"  MODO TESTE: limit={args.limit}")
    log("=" * 64)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    municipios = load_municipios(limit=args.limit)
    log(f"  {len(municipios)} municípios")

    anos = (args.ano,) if args.ano else ANOS
    if args.bimestre:
        periodos = [(o, c) for o, c in PERIODOS_BIMESTRAIS if o == args.bimestre]
    else:
        periodos = PERIODOS_BIMESTRAIS

    total_novos = 0
    for ano in anos:
        for ord_bim, periodo_codigo in periodos:
            if not is_extraction_due(ano, ord_bim):
                log(f"  siops_{ano}_bim{ord_bim}: prazo legal ainda não venceu - skip")
                continue
            total_novos += extract_one(
                municipios, ano, ord_bim, periodo_codigo, force=args.force
            )

    write_coverage_summary(municipios)

    metadata = {
        "data_extracao": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "duracao_segundos": (datetime.now() - start).total_seconds(),
        "municipios": len(municipios),
        "extracoes": len(anos) * len(periodos),
        "novos_no_run": total_novos,
        "limit": args.limit,
    }
    save_json(metadata, "metadata_extracao.json")
    # Também salva o mapa de indicadores para referência
    save_json({k: {"id": v[0], "descricao": v[1], "limite_legal": v[2], "base_calculo": v[3]}
               for k, v in INDICADORES_MAP.items()}, "indicadores_map.json")

    log("=" * 64)
    log(f"FIM em {datetime.now() - start} | +{total_novos} novos")


if __name__ == "__main__":
    main()
