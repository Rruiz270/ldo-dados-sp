import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface IdebRow {
  rede: string;
  etapa: string;
  ciclo_avaliacao: number;
  ideb_observado: string | null;
  ideb_projetado: string | null;
  meta_atingida: boolean | null;
}

interface EducRow {
  exercicio: number;
  periodo: number;
  indicador: string;
  valor: string;
  base_calculo: string | null;
  limite_legal: string | null;
  fonte_id: string | null;
  fonte_detalhe: string | null;
}

interface LrfEduc {
  exercicio: number;
  valor: string;
  limite_legal: string | null;
  pct_do_limite: string | null;
  fonte: string;
}

export default async function EducacaoPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let ideb: IdebRow[] = [];
  let siope: EducRow[] = [];
  let mdeLrf: LrfEduc[] = [];

  try {
    ideb = (await sql`
      SELECT rede, etapa, ciclo_avaliacao, ideb_observado, ideb_projetado, meta_atingida
      FROM ideb WHERE cod_ibge = ${codNum}
      ORDER BY rede, etapa, ciclo_avaliacao
    `) as IdebRow[];
    siope = (await sql`
      SELECT exercicio, periodo, indicador, valor, base_calculo, limite_legal, fonte_id, fonte_detalhe
      FROM indicadores_educacao
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, indicador
    `) as EducRow[];
    mdeLrf = (await sql`
      SELECT exercicio, valor, limite_legal, pct_do_limite, fonte
      FROM indicadores_lrf
      WHERE cod_ibge = ${codNum} AND indicador = 'educacao'
      ORDER BY exercicio DESC, periodo DESC
      LIMIT 20
    `) as LrfEduc[];
  } catch (e) {
    console.error("[educacao]", e);
  }

  return (
    <div className="space-y-8">
      <Section title="Aplicação em Manutenção e Desenvolvimento do Ensino (MDE)"
               subtitle="Mínimo constitucional 25% (CF/88 Art. 212). Fonte: Audesp / RREO Anexo 08.">
        {mdeLrf.length === 0 ? (
          <Empty msg="Sem dados de aplicação MDE para este município." />
        ) : (
          <Table cols={["Exercício", "Aplicado (%)", "Limite legal", "Status", "Fonte"]}>
            {mdeLrf.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td>{fmtPct(r.valor)}</Td>
                <Td>{r.limite_legal ?? "—"}%</Td>
                <Td><SemaforoMin valor={r.valor} limite={r.limite_legal} /></Td>
                <Td className="text-slate-500">{r.fonte}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="FUNDEB — execução e remuneração"
               subtitle="Lei 14.113/2020. Mínimo 70% em remuneração; mínimo 15% em capital (VAAT).">
        {siope.length === 0 ? (
          <Empty msg="SIOPE ainda não sincronizou este município." />
        ) : (
          <Table cols={["Exercício", "Indicador", "Valor", "Limite legal", "Fonte"]}>
            {siope.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td className="font-medium">{labelSiope(r.indicador)}</Td>
                <Td>{fmtValor(r.valor, r.indicador)}</Td>
                <Td>{r.limite_legal ? `${r.limite_legal}%` : "—"}</Td>
                <Td className="text-slate-500 text-xs">{r.fonte_id} {r.fonte_detalhe}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="IDEB — desempenho educacional"
               subtitle="Índice de Desenvolvimento da Educação Básica (INEP). Bienal.">
        {ideb.length === 0 ? (
          <Empty msg="Sem dados IDEB indexados para este município." />
        ) : (
          <Table cols={["Rede", "Etapa", "Ciclo", "IDEB observado", "Projeção", "Atingiu meta?"]}>
            {ideb.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td className="capitalize">{r.rede}</Td>
                <Td className="capitalize">{r.etapa.replace(/_/g, " ")}</Td>
                <Td>{r.ciclo_avaliacao}</Td>
                <Td className="font-medium">{r.ideb_observado ?? "—"}</Td>
                <Td className="text-slate-500">{r.ideb_projetado ?? "—"}</Td>
                <Td>
                  {r.meta_atingida === null
                    ? <span className="text-slate-400">—</span>
                    : r.meta_atingida
                    ? <span className="text-green-700 font-medium">✓ Sim</span>
                    : <span className="text-red-700 font-medium">✗ Não</span>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg md:text-xl font-semibold mb-1" style={{ color: "#0A2463" }}>{title}</h2>
      {subtitle && <p className="text-xs text-slate-600 mb-3">{subtitle}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>{cols.map(c => <th key={c} className="text-left px-3 py-2 font-medium uppercase tracking-wide text-xs">{c}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 text-slate-800 ${className}`}>{children}</td>;
}

function Empty({ msg }: { msg: string }) {
  return <div className="px-3 py-6 text-sm text-slate-500 italic">{msg}</div>;
}

function fmtPct(v: string | null): string {
  if (!v) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

function fmtValor(v: string, indicador: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  if (indicador.endsWith("_pct")) return `${n.toFixed(2)}%`;
  if (indicador.includes("valor") || indicador.includes("receita") || indicador.includes("despesa") || indicador.includes("saldo"))
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return n.toLocaleString("pt-BR");
}

const SIOPE_LABELS: Record<string, string> = {
  fundeb_receita_total: "Receita total FUNDEB",
  fundeb_despesa_total: "Despesa total FUNDEB",
  fundeb_remuneracao_pct: "% remuneração profissionais",
  fundeb_remuneracao_valor: "R$ remuneração profissionais",
  fundeb_nao_aplicado_pct: "% não aplicado",
  fundeb_disponibilidade_31dez_ano_anterior: "Saldo 31/dez anterior",
  fundeb_saldo_conciliado: "Saldo conciliado",
  fundeb_vaat_ed_infantil_pct: "% VAAT Ed. Infantil",
  fundeb_vaat_capital_pct: "% VAAT Capital",
};

function labelSiope(ind: string): string {
  return SIOPE_LABELS[ind] || ind;
}

function SemaforoMin({ valor, limite }: { valor: string; limite: string | null }) {
  if (!limite) return <span className="text-slate-400">—</span>;
  const v = Number(valor), L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span className="text-slate-400">—</span>;
  if (v < L) return <span className="text-red-700 font-medium">Abaixo do mínimo</span>;
  if (v < L * 1.05) return <span className="text-amber-700 font-medium">No limite</span>;
  return <span className="text-green-700 font-medium">Conforme</span>;
}
