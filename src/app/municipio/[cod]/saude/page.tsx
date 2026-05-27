import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface SaudeRow {
  exercicio: number;
  periodo: number;
  indicador: string;
  valor: string;
  limite_legal: string | null;
  fonte_id: string | null;
  fonte_detalhe: string | null;
}

interface LrfRow {
  exercicio: number;
  periodo: number;
  valor: string;
  limite_legal: string | null;
  pct_do_limite: string | null;
  fonte: string;
}

export default async function SaudePage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let siops: SaudeRow[] = [];
  let lrfSaude: LrfRow[] = [];

  try {
    siops = (await sql`
      SELECT exercicio, periodo, indicador, valor, limite_legal, fonte_id, fonte_detalhe
      FROM indicadores_saude
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, periodo DESC, indicador
    `) as SaudeRow[];
    lrfSaude = (await sql`
      SELECT exercicio, periodo, valor, limite_legal, pct_do_limite, fonte
      FROM indicadores_lrf
      WHERE cod_ibge = ${codNum} AND indicador = 'saude'
      ORDER BY exercicio DESC, periodo DESC
      LIMIT 20
    `) as LrfRow[];
  } catch (e) {
    console.error("[saude]", e);
  }

  // ASPS atual = último valor de asps_pct
  const aspsAtual = siops.find(r => r.indicador === "asps_pct");

  return (
    <div className="space-y-8">
      <Section title="ASPS — Ações e Serviços Públicos de Saúde"
               subtitle="Mínimo legal 15% das receitas de impostos (LC 141/2012 Art. 7º). Fonte: SIOPS.">
        {!aspsAtual ? (
          <Empty msg="SIOPS ainda não sincronizou este município." />
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Stat label="Aplicado em saúde"
                  value={`${Number(aspsAtual.valor).toFixed(2)}%`}
                  sub={`Exercício ${aspsAtual.exercicio}, bimestre ${aspsAtual.periodo}`} />
            <Stat label="Mínimo legal" value="15%" sub="LC 141/2012" />
            <Stat label="Status"
                  value={<SemaforoMin valor={aspsAtual.valor} limite="15" />}
                  sub="" />
          </div>
        )}
      </Section>

      <Section title="Aplicação Saúde — série Audesp (LRF)"
               subtitle="Histórico de aplicação em saúde validado pelo TCE-SP.">
        {lrfSaude.length === 0 ? (
          <Empty msg="Sem série Audesp de saúde para este município." />
        ) : (
          <Table cols={["Exercício", "Período", "Aplicado", "Limite legal", "% do limite", "Fonte"]}>
            {lrfSaude.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td>{r.periodo}</Td>
                <Td>{fmtPct(r.valor)}</Td>
                <Td>{r.limite_legal ?? "—"}%</Td>
                <Td>{r.pct_do_limite ? `${Number(r.pct_do_limite).toFixed(1)}%` : "—"}</Td>
                <Td className="text-slate-500">{r.fonte}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="SIOPS — indicadores de saúde detalhados"
               subtitle="14 indicadores: receitas vinculadas, despesas, investimentos, instituições privadas etc.">
        {siops.length === 0 ? (
          <Empty msg="SIOPS ainda não sincronizou este município." />
        ) : (
          <Table cols={["Exercício", "Bim.", "Indicador", "Valor", "Limite", "Detalhe SIOPS"]}>
            {siops.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td>{r.periodo}</Td>
                <Td className="font-medium">{labelSiops(r.indicador)}</Td>
                <Td>{fmtValor(r.valor, r.indicador)}</Td>
                <Td>{r.limite_legal ? `${r.limite_legal}%` : "—"}</Td>
                <Td className="text-slate-500 text-xs">{r.fonte_detalhe}</Td>
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
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">{children}</div>
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

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="text-2xl font-bold my-1" style={{ color: "#0A2463" }}>{value}</div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
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
  if (indicador.endsWith("_pct") || indicador.startsWith("part_")) return `${n.toFixed(2)}%`;
  if (indicador.includes("despesa") || indicador.includes("receita") || indicador.includes("per_capita"))
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return n.toLocaleString("pt-BR");
}

const SIOPS_LABELS: Record<string, string> = {
  asps_pct: "% aplicado em saúde (ASPS)",
  despesa_saude_per_capita: "Despesa saúde per capita",
  part_impostos_receita_total: "% impostos / receita total",
  part_impostos_transf_const_receita_total: "% impostos + transf. const. / receita",
  part_investimentos_despesa_saude: "% investimentos / despesa saúde",
  part_instituicoes_privadas_sem_fins: "% pago a instituições sem fins lucrativos",
};

function labelSiops(ind: string): string {
  return SIOPS_LABELS[ind] || ind.replace(/_/g, " ");
}

function SemaforoMin({ valor, limite }: { valor: string; limite: string }) {
  const v = Number(valor), L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span className="text-slate-400">—</span>;
  if (v < L) return <span className="text-red-700 font-medium">Abaixo do mínimo</span>;
  if (v < L * 1.05) return <span className="text-amber-700 font-medium">No limite</span>;
  return <span className="text-green-700 font-medium">Conforme</span>;
}
