import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, Placeholder } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ExtRow {
  fonte_id: string;
  indicador: string;
  categoria: string | null;
  periodo_referencia: string;
  valor_numerico: string | null;
  valor_texto: string | null;
  unidade: string | null;
  metadata: Record<string, unknown> | null;
}

export default async function ContextoPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let rows: ExtRow[] = [];
  let porFonte: Array<{ fonte_id: string; n: number }> = [];

  try {
    rows = (await sql`
      SELECT fonte_id, indicador, categoria, periodo_referencia,
             valor_numerico, valor_texto, unidade, metadata
      FROM indicadores_externos
      WHERE cod_ibge = ${codNum}
      ORDER BY periodo_referencia DESC, indicador
      LIMIT 200
    `) as ExtRow[];
    porFonte = (await sql`
      SELECT fonte_id, COUNT(*)::int AS n
      FROM indicadores_externos
      WHERE cod_ibge = ${codNum}
      GROUP BY fonte_id
      ORDER BY n DESC
    `) as Array<{ fonte_id: string; n: number }>;
  } catch (e) {
    console.error("[contexto]", e);
  }

  return (
    <div className="space-y-8">
      <Section title="Contexto externo"
               subtitle="Indicadores de fontes externas (INEP, IBGE, IEGM, ambientais, socioeconômicos). Subsidiam diagnóstico comparativo da gestão e dos resultados das políticas públicas.">
        {porFonte.length === 0 ? (
          <Empty msg="Sem indicadores externos para este município (INEP/IEGM/IGM ainda em sincronização)." />
        ) : (
          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            {porFonte.map(f => (
              <div key={f.fonte_id} className="bg-slate-50 rounded-lg px-3 py-2">
                <div className="text-xs uppercase text-slate-500 font-medium">{f.fonte_id}</div>
                <div className="text-lg font-semibold" style={{ color: "#0A2463" }}>{f.n.toLocaleString("pt-BR")}</div>
                <div className="text-xs text-slate-500">indicadores</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {rows.length > 0 && (
        <Section title="Últimos indicadores indexados"
                 subtitle="Taxas de aprovação/reprovação/abandono, IDEB, e demais indicadores externos disponíveis.">
          <Table cols={["Período", "Fonte", "Categoria", "Indicador", "Valor", "Unidade"]}>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.periodo_referencia?.slice(0, 10) ?? "—"}</Td>
                <Td className="text-xs text-slate-500">{r.fonte_id}</Td>
                <Td className="text-xs text-slate-500">{r.categoria ?? "—"}</Td>
                <Td className="font-medium">{r.indicador.replace(/_/g, " ")}</Td>
                <Td>
                  {r.valor_numerico !== null
                    ? Number(r.valor_numerico).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
                    : r.valor_texto ?? "—"}
                </Td>
                <Td className="text-xs text-slate-500">{r.unidade ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Placeholder
        titulo="Outras fontes na fila"
        descricao="IEGM (TCE-SP), IGM (CFA), CETESB ambiental, SNIS saneamento, IBGE PIB municipal — serão integrados na próxima rodada de scrapers." />
    </div>
  );
}
