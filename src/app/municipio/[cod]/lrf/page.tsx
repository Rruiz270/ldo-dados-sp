import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, SemaforoMax, SemaforoMin } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

// Linha vinda de vw_lrf_indicadores (indicadores_lrf + catálogo lrf_indicador_meta,
// já filtrada pelo gate SP via vw_municipios_publicados).
interface LrfRow {
  exercicio: number;
  periodo: number;
  periodicidade: string;
  indicador: string;
  rotulo: string;
  tipo: "fiscal_lrf" | "constitucional";
  natureza: "teto" | "piso";
  valor: string;
  base_calculo: string | null;
  limite_legal: string | null;
  pct_do_limite: string | null;
  limite_efetivo: string | null;
  limite_prudencial: string | null;
  limite_alerta: string | null;
  base_legal: string | null;
  ordem: number;
  fonte: string;
}

const fmt = (v: string | number | null | undefined, suf = "%"): string => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}${suf}` : "—";
};

export default async function LrfPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let rows: LrfRow[] = [];
  try {
    rows = (await sql`
      SELECT exercicio, periodo, periodicidade, indicador, rotulo, tipo, natureza,
             valor, base_calculo, limite_legal, pct_do_limite,
             limite_efetivo, limite_prudencial, limite_alerta, base_legal, ordem, fonte
      FROM vw_lrf_indicadores
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, periodo DESC, ordem
    `) as LrfRow[];
  } catch (e) {
    console.error("[lrf]", e);
  }

  // FUNDEB às vezes vem com % absurdo (>500) por divergência de base — filtra ruído.
  rows = rows.filter((r) => !(r.indicador.startsWith("fundeb") && Number(r.valor) > 500));

  // Agrupa por indicador → primeira ocorrência é a leitura mais recente.
  const atual = new Map<string, LrfRow>();
  for (const r of rows) if (!atual.has(r.indicador)) atual.set(r.indicador, r);

  const ultimos = [...atual.values()].sort((a, b) => a.ordem - b.ordem);
  const tetos = ultimos.filter((r) => r.natureza === "teto");
  const pisos = ultimos.filter((r) => r.natureza === "piso");

  return (
    <div className="space-y-8">
      {/* TETOS FISCAIS */}
      <Section
        title="Limites fiscais (tetos da LRF)"
        subtitle="Lei Complementar 101/2000 e Resoluções do Senado. Tetos sobre a Receita Corrente Líquida (alto = pior). Faixas prudencial/alerta só existem onde a lei prevê — pessoal (57%/54%) e dívida (alerta 108%); nos demais tetos aparecem como '—'."
      >
        {tetos.length === 0 ? (
          <Empty msg="Sem indicadores fiscais (tetos) para este município." />
        ) : (
          <Table cols={["Indicador", "Valor", "Limite (teto)", "Prudencial", "Alerta", "% do limite", "Status", "Fonte"]}>
            {tetos.map((r) => (
              <tr key={r.indicador} className="border-t border-slate-100">
                <Td className="font-medium">{r.rotulo}</Td>
                <Td>{fmt(r.valor)}</Td>
                <Td>{fmt(r.limite_efetivo)}</Td>
                <Td>{fmt(r.limite_prudencial)}</Td>
                <Td>{fmt(r.limite_alerta)}</Td>
                <Td>{fmt(r.pct_do_limite, "%")}</Td>
                <Td>
                  {r.limite_efetivo == null ? (
                    <span className="text-xs text-slate-400">informativo</span>
                  ) : (
                    <SemaforoMax
                      valor={r.valor}
                      limite={r.limite_efetivo}
                      limitePrudencial={r.limite_prudencial}
                      limiteAlerta={r.limite_alerta}
                    />
                  )}
                </Td>
                <Td className="text-xs text-slate-500">
                  {r.fonte} {r.exercicio}/{r.periodicidade}{r.periodo}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* PISOS CONSTITUCIONAIS */}
      <Section
        title="Mínimos constitucionais (pisos)"
        subtitle="Pisos obrigatórios de aplicação (alto = melhor): educação/MDE ≥ 25% (CF Art. 212), saúde/ASPS ≥ 15% (CF Art. 198 · LC 141/2012), FUNDEB = 100% e FUNDEB profissionais ≥ 70% (Lei 14.113/2020)."
      >
        {pisos.length === 0 ? (
          <Empty msg="Sem indicadores constitucionais (pisos) para este município." />
        ) : (
          <Table cols={["Indicador", "Aplicado", "Mínimo legal", "% do mínimo", "Situação", "Fonte"]}>
            {pisos.map((r) => (
              <tr key={r.indicador} className="border-t border-slate-100">
                <Td className="font-medium">{r.rotulo}</Td>
                <Td>{fmt(r.valor)}</Td>
                <Td>{fmt(r.limite_efetivo)}</Td>
                <Td>{fmt(r.pct_do_limite, "%")}</Td>
                <Td>
                  <SemaforoMin valor={r.valor} limite={r.limite_efetivo} />
                </Td>
                <Td className="text-xs text-slate-500">
                  {r.fonte} {r.exercicio}/{r.periodicidade}{r.periodo}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* HISTÓRICO */}
      <Section
        title="Histórico completo"
        subtitle="Todos os exercícios e períodos disponíveis para este município."
      >
        <Table cols={["Exercício", "Período", "Indicador", "Natureza", "Valor", "% do limite", "Fonte"]}>
          {rows.slice(0, 120).map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              <Td>{r.exercicio}</Td>
              <Td>{r.periodicidade}{r.periodo}</Td>
              <Td className="font-medium">{r.rotulo}</Td>
              <Td className="text-xs text-slate-500">{r.natureza === "teto" ? "teto" : "piso"}</Td>
              <Td>{fmt(r.valor)}</Td>
              <Td>{fmt(r.pct_do_limite, "%")}</Td>
              <Td className="text-xs text-slate-500">{r.fonte}</Td>
            </tr>
          ))}
        </Table>
        {rows.length > 120 && (
          <div className="px-3 py-2 text-xs text-slate-500 border-t border-slate-100">
            Mostrando primeiros 120 de {rows.length} registros.
          </div>
        )}
      </Section>
    </div>
  );
}
