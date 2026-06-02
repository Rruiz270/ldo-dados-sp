// PainelMetasPasta — VISÃO "Secretário de pasta" (tipoVisao = 'pasta').
// Lista programas → ações → metas físicas do município, filtrável por área,
// com pct_execucao e badge do status_acompanhamento (0009). Server component.
import { sql } from "@/lib/db";
import {
  Section,
  Eyebrow,
  Empty,
  StatusMetaBadge,
  NotificacaoBadge,
  notificacaoDevida,
  fmtNum,
} from "@/components/ModuloUI";
import { Target, ArrowRight } from "lucide-react";

interface MetaRow {
  programa_id: number;
  programa_codigo: string;
  programa_nome: string;
  area: string | null;
  acao_id: number;
  acao_codigo: string;
  acao_nome: string;
  unidade_medida: string | null;
  exercicio: number;
  meta_quantidade: string | null;
  realizado_quantidade: string | null;
  pct_execucao: string | null;
  status_acompanhamento: string | null;
  bimestre_referencia: number | null;
  responsavel_area: string | null;
}

function pctColor(pct: number | null): string {
  if (pct === null) return "var(--cinza)";
  if (pct >= 90) return "var(--verde-2)";
  if (pct >= 50) return "#d97706";
  return "#dc2626";
}

export async function PainelMetasPasta({
  codIbge,
  basePath,
  area,
}: {
  codIbge: number;
  basePath: string;
  area?: string;
}) {
  let rows: MetaRow[] = [];
  let areas: string[] = [];
  try {
    rows = (await sql`
      SELECT
        p.id   AS programa_id,
        p.codigo AS programa_codigo,
        p.nome   AS programa_nome,
        p.area,
        a.id   AS acao_id,
        a.codigo AS acao_codigo,
        a.nome   AS acao_nome,
        a.unidade_medida,
        mf.exercicio,
        mf.meta_quantidade,
        mf.realizado_quantidade,
        mf.pct_execucao,
        mf.status_acompanhamento,
        mf.bimestre_referencia,
        mf.responsavel_area
      FROM programas p
      JOIN acoes a          ON a.programa_id = p.id
      LEFT JOIN metas_fisicas mf ON mf.acao_id = a.id
      WHERE p.cod_ibge = ${codIbge}
        ${area ? sql`AND p.area = ${area}` : sql``}
      ORDER BY p.area NULLS LAST, p.codigo, a.codigo, mf.exercicio DESC
    `) as MetaRow[];

    const areaRows = (await sql`
      SELECT DISTINCT area FROM programas
      WHERE cod_ibge = ${codIbge} AND area IS NOT NULL
      ORDER BY area
    `) as Array<{ area: string }>;
    areas = areaRows.map((r) => r.area);
  } catch (e) {
    console.error("[PainelMetasPasta]", e);
  }

  // Agrupa por programa.
  const programas = new Map<number, { codigo: string; nome: string; area: string | null; metas: MetaRow[] }>();
  for (const r of rows) {
    if (!programas.has(r.programa_id)) {
      programas.set(r.programa_id, { codigo: r.programa_codigo, nome: r.programa_nome, area: r.area, metas: [] });
    }
    if (r.acao_id) programas.get(r.programa_id)!.metas.push(r);
  }

  // KPIs de acompanhamento.
  const comMeta = rows.filter((r) => r.exercicio != null);
  const pendentes = comMeta.filter((r) => r.status_acompanhamento === "pendente").length;
  const devidas = comMeta.filter(
    (r) => notificacaoDevida(r.status_acompanhamento, r.exercicio, r.bimestre_referencia) !== "ok",
  ).length;

  return (
    <Section
      title="Metas físicas da sua pasta"
      subtitle="Programas, ações e metas físicas do município com percentual de execução e situação de acompanhamento. Filtre por área para ver apenas a sua pasta."
    >
      <div className="p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <Eyebrow small>Acompanhamento</Eyebrow>
            <span style={{ color: "var(--cinza)" }}>
              {comMeta.length} meta(s) · {pendentes} pendente(s) · {devidas} com notificação/escalonamento devido
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <FiltroArea href={`${basePath}/municipio/${codIbge}`} label="Todas" ativo={!area} />
            {areas.map((a) => (
              <FiltroArea
                key={a}
                href={`${basePath}/municipio/${codIbge}?area=${encodeURIComponent(a)}`}
                label={a}
                ativo={area === a}
              />
            ))}
          </div>
        </div>

        {programas.size === 0 ? (
          <Empty msg="Nenhum programa/ação cadastrado para este município (ou para esta área)." />
        ) : (
          <div className="space-y-5">
            {[...programas.values()].map((prog) => (
              <div
                key={prog.codigo}
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(11,47,99,0.09)" }}
              >
                <div
                  className="px-4 py-3 flex items-center justify-between gap-2"
                  style={{ background: "rgba(11,47,99,0.04)" }}
                >
                  <div>
                    <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>
                      {prog.codigo} — {prog.nome}
                    </span>
                    {prog.area && (
                      <span className="ml-2 text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>
                        {prog.area}
                      </span>
                    )}
                  </div>
                </div>
                <ul className="divide-y divide-slate-100">
                  {prog.metas.map((m) => {
                    const pct = m.pct_execucao != null ? Number(m.pct_execucao) : null;
                    const notif = notificacaoDevida(m.status_acompanhamento, m.exercicio, m.bimestre_referencia);
                    return (
                      <li key={`${m.acao_id}-${m.exercicio}`} className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <Target size={15} strokeWidth={1.75} className="mt-1 flex-shrink-0" style={{ color: "var(--azul-2)" }} aria-hidden />
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="font-semibold text-sm" style={{ color: "var(--grafite)" }}>
                                {m.acao_codigo} — {m.acao_nome}
                              </span>
                              {m.exercicio != null && (
                                <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>
                                  {m.exercicio}{m.bimestre_referencia ? ` · B${m.bimestre_referencia}` : ""}
                                </span>
                              )}
                            </div>
                            <div className="text-xs mt-1 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: "var(--cinza)" }}>
                              <span>
                                Meta: <strong style={{ color: "var(--grafite)" }}>{fmtNum(m.meta_quantidade)}</strong>
                                {m.unidade_medida ? ` ${m.unidade_medida}` : ""}
                              </span>
                              <span>
                                Realizado: <strong style={{ color: "var(--grafite)" }}>{fmtNum(m.realizado_quantidade)}</strong>
                              </span>
                              {m.responsavel_area && <span>· {m.responsavel_area}</span>}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            <span className="text-base font-bold" style={{ color: pctColor(pct) }}>
                              {pct != null ? `${pct.toFixed(1)}%` : "—"}
                            </span>
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <StatusMetaBadge status={m.status_acompanhamento} />
                              <NotificacaoBadge tipo={notif} />
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <a
          href={`${basePath}/municipio/${codIbge}/cadastro/metas-fisicas`}
          className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
          style={{ color: "var(--verde-2)" }}
        >
          Preencher / atualizar metas físicas <ArrowRight size={13} aria-hidden />
        </a>
      </div>
    </Section>
  );
}

function FiltroArea({ href, label, ativo }: { href: string; label: string; ativo: boolean }) {
  return (
    <a
      href={href}
      className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
      style={{
        background: ativo ? "var(--azul)" : "white",
        color: ativo ? "white" : "var(--azul)",
        border: "1px solid rgba(11,47,99,0.12)",
      }}
    >
      {label}
    </a>
  );
}
