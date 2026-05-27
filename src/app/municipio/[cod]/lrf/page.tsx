import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, SemaforoMax } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface LrfRow {
  exercicio: number;
  periodo: number;
  periodicidade: string;
  indicador: string;
  valor: string;
  base_calculo: string | null;
  limite_legal: string | null;
  pct_do_limite: string | null;
  fonte: string;
}

const LRF_LABELS: Record<string, { label: string; tipo: "max" | "min" }> = {
  pessoal: { label: "Despesa com pessoal (Executivo)", tipo: "max" },
  educacao: { label: "Aplicação em educação (MDE)", tipo: "min" },
  saude: { label: "Aplicação em saúde (ASPS)", tipo: "min" },
  divida: { label: "Dívida Consolidada Líquida", tipo: "max" },
  rcl: { label: "Receita Corrente Líquida", tipo: "max" },
  fundeb: { label: "FUNDEB — aplicação total", tipo: "min" },
  fundeb_profissionais: { label: "FUNDEB — remuneração profissionais", tipo: "min" },
  resultado_execucao: { label: "Resultado da execução", tipo: "max" },
};

export default async function LrfPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let rows: LrfRow[] = [];
  try {
    rows = (await sql`
      SELECT exercicio, periodo, periodicidade, indicador, valor, base_calculo, limite_legal, pct_do_limite, fonte
      FROM indicadores_lrf
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, periodo DESC, indicador
    `) as LrfRow[];
  } catch (e) {
    console.error("[lrf]", e);
  }

  // Agrupa por indicador → última leitura é a "atual"
  const atual = new Map<string, LrfRow>();
  for (const r of rows) {
    if (!atual.has(r.indicador)) atual.set(r.indicador, r);
  }

  return (
    <div className="space-y-8">
      <Section title="Limites da LRF — situação atual"
               subtitle="Lei Complementar 101/2000. Pessoal: 60% RCL (limite máximo, 57% prudencial). Dívida: 120% RCL. Educação: 25% mín. Saúde: 15% mín.">
        {atual.size === 0 ? (
          <Empty msg="Sem indicadores LRF para este município." />
        ) : (
          <Table cols={["Indicador", "Valor", "Limite legal", "% do limite", "Status", "Fonte"]}>
            {[...atual.values()].map((r) => {
              const meta = LRF_LABELS[r.indicador];
              return (
                <tr key={r.indicador} className="border-t border-slate-100">
                  <Td className="font-medium">{meta?.label ?? r.indicador}</Td>
                  <Td>{Number(r.valor).toFixed(2)}{meta?.tipo ? "%" : ""}</Td>
                  <Td>{r.limite_legal ? `${r.limite_legal}%` : "—"}</Td>
                  <Td>{r.pct_do_limite ? `${Number(r.pct_do_limite).toFixed(1)}%` : "—"}</Td>
                  <Td>
                    {meta?.tipo === "max"
                      ? <SemaforoMax valor={r.pct_do_limite ?? r.valor} limite={100} />
                      : <SemaforoMax valor={r.pct_do_limite ?? "100"} limite={100} />}
                  </Td>
                  <Td className="text-xs text-slate-500">{r.fonte} {r.exercicio}/{r.periodo}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      <Section title="Histórico completo"
               subtitle="Todos os exercícios e períodos disponíveis para este município.">
        <Table cols={["Exercício", "Período", "Indicador", "Valor", "% do limite", "Fonte"]}>
          {rows.slice(0, 80).map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <Td>{r.exercicio}</Td>
              <Td>{r.periodicidade}{r.periodo}</Td>
              <Td className="font-medium">{LRF_LABELS[r.indicador]?.label ?? r.indicador}</Td>
              <Td>{Number(r.valor).toFixed(2)}</Td>
              <Td>{r.pct_do_limite ? `${Number(r.pct_do_limite).toFixed(1)}%` : "—"}</Td>
              <Td className="text-xs text-slate-500">{r.fonte}</Td>
            </tr>
          ))}
        </Table>
        {rows.length > 80 && (
          <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">
            Mostrando primeiros 80 de {rows.length} registros.
          </div>
        )}
      </Section>
    </div>
  );
}
