// PainelConformidade — VISÃO Controle Interno / Câmara / Vereador
// (tipoVisao = 'conformidade'). Destaca os indicadores em FAIXA amarela/vermelha
// (vw_lrf_indicadores) e os alertas abertos (tabela alertas, se existir).
// Server component, somente leitura.
import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, SemaforoMax, SemaforoMin, fmtPct, fmtDate } from "@/components/ModuloUI";
import { AlertTriangle, ShieldCheck } from "lucide-react";

interface LrfRow {
  indicador: string;
  rotulo: string | null;
  natureza: "teto" | "piso";
  valor: string | null;
  limite_efetivo: string | null;
  limite_prudencial: string | null;
  limite_alerta: string | null;
  base_legal: string | null;
  exercicio: number;
  periodo: number;
  periodicidade: string;
}

interface AlertaRow {
  id: number;
  indicador: string;
  nivel: string;
  mensagem: string;
  base_legal: string | null;
  exercicio: number | null;
  periodo: number | null;
  criado_em: string;
}

// Classifica se a leitura está fora da faixa "conforme" (amarela ou pior).
// Tetos: >= alerta/prudencial, ou >= 90% do teto. Pisos: abaixo do mínimo.
function emFaixaCritica(r: LrfRow): "vermelho" | "amarelo" | null {
  if (r.valor == null || r.limite_efetivo == null) return null;
  const v = Number(r.valor);
  const L = Number(r.limite_efetivo);
  if (!Number.isFinite(v) || !Number.isFinite(L) || L <= 0) return null;
  if (r.natureza === "piso") {
    if (v < L) return "vermelho";
    if (v < L * 1.02) return "amarelo"; // no fio do piso
    return null;
  }
  // teto
  const prud = r.limite_prudencial != null ? Number(r.limite_prudencial) : null;
  const al = r.limite_alerta != null ? Number(r.limite_alerta) : null;
  if (v >= L) return "vermelho";
  if (prud != null && Number.isFinite(prud) && v >= prud) return "vermelho";
  if (al != null && Number.isFinite(al) && v >= al) return "amarelo";
  if (v >= L * 0.9) return "amarelo";
  return null;
}

export async function PainelConformidade({ codIbge }: { codIbge: number }) {
  let lrf: LrfRow[] = [];
  let alertas: AlertaRow[] = [];
  try {
    lrf = (await sql`
      SELECT indicador, rotulo, natureza, valor, limite_efetivo,
             limite_prudencial, limite_alerta, base_legal,
             exercicio, periodo, periodicidade
      FROM vw_lrf_indicadores
      WHERE cod_ibge = ${codIbge}
      ORDER BY exercicio DESC, periodo DESC
    `) as LrfRow[];
  } catch (e) {
    console.error("[PainelConformidade.lrf]", e);
  }

  try {
    alertas = (await sql`
      SELECT id, indicador, nivel, mensagem, base_legal, exercicio, periodo, criado_em
      FROM alertas
      WHERE cod_ibge = ${codIbge} AND status IN ('aberto', 'em_andamento')
      ORDER BY
        CASE nivel WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END,
        criado_em DESC
      LIMIT 50
    `) as AlertaRow[];
  } catch (e) {
    // tabela alertas pode não existir em alguns ambientes — degrada graciosamente
    console.error("[PainelConformidade.alertas]", e);
  }

  // FUNDEB ruído.
  lrf = lrf.filter((r) => !(r.indicador.startsWith("fundeb") && Number(r.valor) > 500));
  const atual = new Map<string, LrfRow>();
  for (const r of lrf) if (!atual.has(r.indicador)) atual.set(r.indicador, r);

  const criticos = [...atual.values()]
    .map((r) => ({ r, faixa: emFaixaCritica(r) }))
    .filter((x) => x.faixa !== null)
    .sort((a, b) => (a.faixa === "vermelho" ? -1 : 1) - (b.faixa === "vermelho" ? -1 : 1));

  return (
    <div className="space-y-5">
      <Section
        title="Conformidade — indicadores em faixa de atenção"
        subtitle="Indicadores fiscais (tetos da LRF) e constitucionais (pisos) que estão na faixa amarela (atenção/alerta) ou vermelha (prudencial/acima do teto ou abaixo do mínimo). Verde fica fora desta lista."
      >
        <div className="p-5">
          {criticos.length === 0 ? (
            <div className="flex items-center gap-3 px-2 py-6" style={{ color: "var(--verde-2)" }}>
              <ShieldCheck size={20} aria-hidden />
              <span className="text-sm">Nenhum indicador em faixa de atenção no período mais recente publicado.</span>
            </div>
          ) : (
            <ul className="space-y-3">
              {criticos.map(({ r, faixa }) => (
                <li
                  key={r.indicador}
                  className="p-4 rounded-2xl flex items-start justify-between gap-3"
                  style={{
                    background: faixa === "vermelho" ? "rgba(220,38,38,0.05)" : "rgba(217,119,6,0.06)",
                    border: `1px solid ${faixa === "vermelho" ? "rgba(220,38,38,0.2)" : "rgba(217,119,6,0.2)"}`,
                  }}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" style={{ color: faixa === "vermelho" ? "#dc2626" : "#d97706" }} aria-hidden />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm" style={{ color: "var(--azul)" }}>{r.rotulo ?? r.indicador}</div>
                      <div className="text-xs mt-0.5" style={{ color: "var(--cinza)" }}>
                        {r.natureza === "teto" ? "teto" : "mínimo"} {fmtPct(r.limite_efetivo)} · ref. {r.exercicio}/{r.periodicidade}{r.periodo}
                        {r.base_legal ? ` · ${r.base_legal}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-lg font-bold" style={{ color: "var(--grafite)" }}>{fmtPct(r.valor)}</span>
                    {r.natureza === "teto" ? (
                      <SemaforoMax valor={r.valor} limite={r.limite_efetivo} limitePrudencial={r.limite_prudencial} limiteAlerta={r.limite_alerta} />
                    ) : (
                      <SemaforoMin valor={r.valor} limite={r.limite_efetivo} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      <Section
        title="Alertas abertos"
        subtitle="Alertas de conformidade gerados pelo motor de regras (abertos ou em andamento), ordenados por gravidade."
      >
        <div className="p-5">
          {alertas.length === 0 ? (
            <Empty msg="Nenhum alerta aberto para este município." />
          ) : (
            <ul className="space-y-2">
              {alertas.map((a) => (
                <li key={a.id} className="p-3 rounded-xl flex items-start gap-3" style={{ border: "1px solid rgba(11,47,99,0.08)" }}>
                  <NivelBadge nivel={a.nivel} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm" style={{ color: "var(--grafite)" }}>{a.mensagem}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--cinza)" }}>
                      <Eyebrow small>{a.indicador}</Eyebrow>{" "}
                      {a.exercicio ? `${a.exercicio}${a.periodo ? `/${a.periodo}` : ""} · ` : ""}
                      {a.base_legal ? `${a.base_legal} · ` : ""}aberto em {fmtDate(a.criado_em)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>
    </div>
  );
}

function NivelBadge({ nivel }: { nivel: string }) {
  const map: Record<string, { rotulo: string; cor: string }> = {
    critico: { rotulo: "Crítico", cor: "#dc2626" },
    atencao: { rotulo: "Atenção", cor: "#d97706" },
    informativo: { rotulo: "Info", cor: "var(--azul-2)" },
  };
  const m = map[nivel] ?? map.informativo;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold flex-shrink-0" style={{ color: m.cor, background: `${m.cor}1f` }}>
      {m.rotulo}
    </span>
  );
}
