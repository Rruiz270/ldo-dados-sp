import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, Placeholder, SemaforoMax } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface DividaRow {
  exercicio: number;
  periodo: number;
  indicador: string;
  valor: string;
  base_calculo: string | null;
  limite_legal: string | null;
  pct_do_limite: string | null;
  fonte: string;
}

interface PrecRow {
  exercicio: number;
  valor_total: string;
  qtd_processos: number | null;
  classificacao: string;
}

export default async function DividaPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let lrfDivida: DividaRow[] = [];
  let divCx: DividaRow[] = [];
  let precs: PrecRow[] = [];

  try {
    lrfDivida = (await sql`
      SELECT exercicio, periodo, indicador, valor, base_calculo, limite_legal, pct_do_limite, fonte
      FROM indicadores_lrf
      WHERE cod_ibge = ${codNum} AND indicador = 'divida'
      ORDER BY exercicio DESC, periodo DESC
      LIMIT 20
    `) as DividaRow[];
    divCx = (await sql`
      SELECT exercicio, periodo, indicador, valor, base_calculo, limite_legal, pct_do_limite, fonte_id AS fonte
      FROM divida_e_caixa
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, periodo DESC, indicador
      LIMIT 50
    `) as unknown as DividaRow[];
    precs = (await sql`
      SELECT exercicio, valor_total, qtd_processos, classificacao
      FROM precatorios WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, classificacao
    `) as PrecRow[];
  } catch (e) {
    console.error("[divida]", e);
  }

  return (
    <div className="space-y-8">
      <Section title="Dívida Consolidada Líquida (DCL)"
               subtitle="Resolução SF 40/2001 — limite 120% RCL para municípios.">
        {lrfDivida.length === 0 ? (
          <Empty msg="Sem indicador de dívida para este município." />
        ) : (
          <Table cols={["Exercício", "Período", "DCL", "Limite", "% do limite", "Status", "Fonte"]}>
            {lrfDivida.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td>{r.periodo}</Td>
                <Td>{Number(r.valor).toFixed(2)}%</Td>
                <Td>{r.limite_legal ?? 120}%</Td>
                <Td>{r.pct_do_limite ? `${Number(r.pct_do_limite).toFixed(1)}%` : "—"}</Td>
                <Td><SemaforoMax valor={r.pct_do_limite ?? r.valor} limite={100} /></Td>
                <Td className="text-xs text-slate-500">{r.fonte}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Dívida, crédito, garantias e caixa (detalhado)"
               subtitle="Operações de crédito (16% RCL/ano), garantias (22% RCL), restos a pagar, disponibilidade de caixa.">
        {divCx.length === 0 ? (
          <div>
            <Placeholder
              titulo="Aguardando sincronização RGF"
              descricao="A tabela divida_e_caixa será populada após o sync do RGF (Relatório de Gestão Fiscal) detalhado. Atualmente o SICONFI ainda está processando 2023." />
          </div>
        ) : (
          <Table cols={["Exercício", "Quad.", "Indicador", "Valor", "Limite", "Status"]}>
            {divCx.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td>{r.periodo}</Td>
                <Td className="font-medium">{r.indicador.replace(/_/g, " ")}</Td>
                <Td>{Number(r.valor).toFixed(2)}</Td>
                <Td>{r.limite_legal ?? "—"}</Td>
                <Td><SemaforoMax valor={r.pct_do_limite ?? r.valor} limite={r.limite_legal ?? 100} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Precatórios" subtitle="Passivos judiciais transitados em julgado (CF Art. 100).">
        {precs.length === 0 ? (
          <Placeholder
            titulo="Sem precatórios indexados"
            descricao="Cadastro manual ou integração com TJ-SP / Conselho Nacional de Justiça previsto para próxima fase." />
        ) : (
          <Table cols={["Exercício", "Classificação", "Qtd. processos", "Valor total"]}>
            {precs.map((r, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{r.exercicio}</Td>
                <Td className="capitalize">{r.classificacao}</Td>
                <Td>{r.qtd_processos ?? "—"}</Td>
                <Td>{Number(r.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
