import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface MunicRow { cod_ibge: number; nome: string; populacao: number; faixa_pop: string | null }
interface IndRow { indicador: string; exercicio: number; valor: string; limite_legal: string | null; pct_do_limite: string | null; fonte: string }
interface AreaRow { funcao: string; exercicio: number; periodo: number; eh_area_fim: boolean; dotacao_inicial: string | null; dotacao_atualizada: string | null; empenhado: string | null; liquidado: string | null; pct_do_total: string | null }
interface PubRow { dataset: string; status: string; atualizado_em: string }

async function loadAll(codNum: number) {
  const [munis, inds, areas, pubs] = await Promise.all([
    sql`SELECT cod_ibge, nome, populacao, faixa_pop FROM municipios WHERE cod_ibge = ${codNum} LIMIT 1` as Promise<MunicRow[]>,
    sql`SELECT indicador, exercicio, valor, limite_legal, pct_do_limite, fonte FROM indicadores_lrf WHERE cod_ibge = ${codNum} ORDER BY exercicio DESC, indicador` as Promise<IndRow[]>,
    sql`SELECT funcao, exercicio, periodo, eh_area_fim, dotacao_inicial, dotacao_atualizada, empenhado, liquidado, pct_do_total FROM despesa_por_funcao WHERE cod_ibge = ${codNum} ORDER BY exercicio DESC, periodo DESC, eh_area_fim DESC, empenhado DESC NULLS LAST` as Promise<AreaRow[]>,
    sql`SELECT dataset, status, atualizado_em FROM publicacao_status WHERE cod_ibge = ${codNum} ORDER BY dataset DESC` as Promise<PubRow[]>,
  ]);
  return { munic: munis[0], inds, areas, pubs };
}

function safeNum(x: unknown): number | null {
  if (x == null) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

async function buildXlsx(cod: number): Promise<Buffer> {
  const { munic, inds, areas, pubs } = await loadAll(cod);
  const wb = new ExcelJS.Workbook();
  wb.creator = "LDO Dados SP · Instituto i10";
  wb.created = new Date();

  // ===== Aba 1: Resumo =====
  const s1 = wb.addWorksheet("Resumo");
  s1.columns = [{ width: 32 }, { width: 50 }];
  s1.addRows([
    ["Município", munic?.nome ?? "?"],
    ["Código IBGE", munic?.cod_ibge ?? cod],
    ["População", munic?.populacao ?? ""],
    ["Faixa populacional", munic?.faixa_pop ?? ""],
    ["", ""],
    ["Gerado em", new Date().toISOString()],
    ["Fonte", "Tesouro Nacional (SICONFI) + TCE-SP (Audesp)"],
    ["URL", `https://institutoi10.com.br/ldo-dados/municipio/${cod}`],
  ]);
  s1.getCell("A1").font = { bold: true, size: 14 };

  // ===== Aba 2: Indicadores LRF =====
  const s2 = wb.addWorksheet("Indicadores LRF");
  s2.columns = [
    { header: "Indicador", key: "indicador", width: 24 },
    { header: "Exercício", key: "exercicio", width: 12 },
    { header: "Valor (%)", key: "valor", width: 14 },
    { header: "Limite Legal (%)", key: "limite", width: 18 },
    { header: "% do Limite", key: "pct", width: 14 },
    { header: "Fonte", key: "fonte", width: 14 },
  ];
  s2.getRow(1).font = { bold: true };
  inds.forEach((i) => {
    s2.addRow({
      indicador: i.indicador,
      exercicio: i.exercicio,
      valor: safeNum(i.valor),
      limite: safeNum(i.limite_legal),
      pct: safeNum(i.pct_do_limite),
      fonte: i.fonte,
    });
  });

  // ===== Aba 3: Áreas-fim e Despesas por Função =====
  const s3 = wb.addWorksheet("Despesas por Função");
  s3.columns = [
    { header: "Função", key: "funcao", width: 30 },
    { header: "Tipo", key: "tipo", width: 12 },
    { header: "Exercício", key: "exercicio", width: 12 },
    { header: "Bimestre", key: "periodo", width: 12 },
    { header: "Dotação Inicial (Meta LOA)", key: "dot_ini", width: 26 },
    { header: "Dotação Atualizada", key: "dot_atu", width: 22 },
    { header: "Empenhado", key: "emp", width: 18 },
    { header: "Liquidado", key: "liq", width: 18 },
    { header: "% Execução", key: "pct_exec", width: 14 },
    { header: "% Orçamento", key: "pct_orc", width: 14 },
  ];
  s3.getRow(1).font = { bold: true };
  areas.forEach((a) => {
    const dot = safeNum(a.dotacao_inicial);
    const liq = safeNum(a.liquidado);
    const pctExec = dot && liq && dot > 0 ? (liq / dot) * 100 : null;
    s3.addRow({
      funcao: a.funcao,
      tipo: a.eh_area_fim ? "área-fim" : "área-meio",
      exercicio: a.exercicio,
      periodo: a.periodo,
      dot_ini: dot,
      dot_atu: safeNum(a.dotacao_atualizada),
      emp: safeNum(a.empenhado),
      liq: liq,
      pct_exec: pctExec,
      pct_orc: safeNum(a.pct_do_total),
    });
  });
  s3.getColumn("dot_ini").numFmt = '"R$" #,##0.00';
  s3.getColumn("dot_atu").numFmt = '"R$" #,##0.00';
  s3.getColumn("emp").numFmt = '"R$" #,##0.00';
  s3.getColumn("liq").numFmt = '"R$" #,##0.00';
  s3.getColumn("pct_exec").numFmt = '0.00"%"';
  s3.getColumn("pct_orc").numFmt = '0.00"%"';

  // ===== Aba 4: Cobertura =====
  const s4 = wb.addWorksheet("Cobertura de Publicação");
  s4.columns = [
    { header: "Dataset", key: "dataset", width: 30 },
    { header: "Status", key: "status", width: 18 },
    { header: "Última Verificação", key: "ts", width: 28 },
  ];
  s4.getRow(1).font = { bold: true };
  pubs.forEach((p) => {
    s4.addRow({ dataset: p.dataset, status: p.status, ts: p.atualizado_em });
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function buildHtml(cod: number, munic: MunicRow | undefined, inds: IndRow[], areas: AreaRow[], pubs: PubRow[]): string {
  const areasFim = areas.filter((a) => a.eh_area_fim);
  const pubCount = pubs.filter((p) => p.status === "PUBLICADO").length;
  const pctPub = pubs.length > 0 ? Math.round((pubCount / pubs.length) * 100) : 0;
  const fmtBRL = (v: string | null) => {
    const n = safeNum(v);
    if (n == null) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  };
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Relatório Fiscal · ${munic?.nome ?? cod}</title>
<style>
  @page { size: A4; margin: 18mm 15mm; }
  body { font-family: 'Helvetica', Arial, sans-serif; color: #0F172A; font-size: 11px; line-height: 1.4; }
  .header { border-bottom: 3px solid #0A2463; padding-bottom: 8px; margin-bottom: 18px; }
  .header .brand { font-size: 10px; color: #00B4D8; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; }
  h1 { font-family: Georgia, serif; color: #0A2463; font-size: 28px; margin: 4px 0 2px; }
  .meta { color: #64748B; font-size: 11px; }
  h2 { color: #0A2463; font-size: 14px; margin: 20px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th { background: #F1F5F9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #CBD5E1; }
  td { padding: 6px 8px; border-bottom: 1px solid #F1F5F9; }
  td.r { text-align: right; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 600; text-transform: uppercase; }
  .pill.ok { background: #D1FAE5; color: #065F46; }
  .pill.warn { background: #FEF3C7; color: #92400E; }
  .pill.bad { background: #FEE2E2; color: #991B1B; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #E2E8F0; font-size: 9px; color: #94A3B8; }
</style></head>
<body>
<div class="header">
  <div class="brand">Instituto i10 · LDO Dados SP</div>
  <h1>${munic?.nome ?? "Município"}</h1>
  <div class="meta">
    IBGE ${munic?.cod_ibge ?? cod} · População ${munic?.populacao?.toLocaleString("pt-BR") ?? "—"} hab ·
    Transparência <strong>${pctPub}%</strong> (${pubCount}/${pubs.length} relatórios publicados)
  </div>
</div>

<h2>Indicadores LRF (cumprimento de limites legais)</h2>
${inds.length === 0 ? '<p class="meta">Nenhum indicador disponível para este município.</p>' : `
<table>
  <thead><tr><th>Indicador</th><th class="r">Valor</th><th class="r">Limite</th><th class="r">% do limite</th><th>Fonte</th></tr></thead>
  <tbody>
    ${inds.slice(0, 20).map((i) => `
      <tr>
        <td>${i.indicador}</td>
        <td class="r"><strong>${safeNum(i.valor)?.toFixed(2) ?? "—"}%</strong></td>
        <td class="r">${safeNum(i.limite_legal)?.toFixed(1) ?? "—"}%</td>
        <td class="r">${safeNum(i.pct_do_limite)?.toFixed(1) ?? "—"}%</td>
        <td><span class="pill ok">${i.fonte}</span></td>
      </tr>
    `).join("")}
  </tbody>
</table>`}

<h2>Despesas por área-fim</h2>
${areasFim.length === 0 ? `<p class="meta">Município não publicou o RREO Anexo 02. Cerca de 115 dos 645 municípios paulistas estão nessa situação.</p>` : `
<table>
  <thead><tr><th>Área</th><th class="r">Meta (LOA)</th><th class="r">Empenhado</th><th class="r">Liquidado</th><th class="r">% Exec</th><th class="r">% Orç</th></tr></thead>
  <tbody>
    ${areasFim.map((a) => {
      const dot = safeNum(a.dotacao_inicial);
      const liq = safeNum(a.liquidado);
      const exec = dot && liq && dot > 0 ? (liq / dot * 100) : null;
      return `
        <tr>
          <td><strong>${a.funcao}</strong></td>
          <td class="r">${fmtBRL(a.dotacao_inicial)}</td>
          <td class="r">${fmtBRL(a.empenhado)}</td>
          <td class="r">${fmtBRL(a.liquidado)}</td>
          <td class="r">${exec?.toFixed(1) ?? "—"}%</td>
          <td class="r">${safeNum(a.pct_do_total)?.toFixed(1) ?? "—"}%</td>
        </tr>
      `;
    }).join("")}
  </tbody>
</table>`}

<div class="footer">
  Fontes: Tesouro Nacional (SICONFI) e TCE-SP (Audesp) · Dados atualizados diariamente às 04h ·
  https://institutoi10.com.br/ldo-dados/municipio/${cod} ·
  Gerado em ${new Date().toLocaleString("pt-BR")}
</div>
</body></html>`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cod: string; fmt: string }> },
) {
  const { cod, fmt } = await params;
  const codNum = parseInt(cod, 10);
  if (Number.isNaN(codNum)) {
    return NextResponse.json({ error: "cod inválido" }, { status: 400 });
  }

  if (fmt === "xlsx") {
    const buf = await buildXlsx(codNum);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="ldo-dados-${codNum}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (fmt === "pdf" || fmt === "html") {
    const { munic, inds, areas, pubs } = await loadAll(codNum);
    const html = buildHtml(codNum, munic, inds, areas, pubs);
    // V1: serve HTML estilizado para impressão (Cmd+P → Salvar como PDF).
    // V2: substituir por @react-pdf/renderer ou puppeteer pra gerar PDF binário.
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json({ error: "formato inválido (use xlsx ou pdf)" }, { status: 400 });
}
