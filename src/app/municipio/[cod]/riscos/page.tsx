import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, Placeholder, fmtDate } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface RiscoRow {
  id: number;
  tipo: string;
  titulo: string;
  descricao: string | null;
  nivel: string;
  identificado_em: string;
  fonte_indicador: string | null;
  status: string;
}

interface SolucaoRow {
  tipo_risco: string;
  titulo: string;
  descricao: string;
  fundamento_legal: string | null;
  prioridade: number;
}

const NIVEL_COLOR: Record<string, string> = {
  baixo: "text-green-700",
  medio: "text-cyan-700",
  alto: "text-amber-700",
  critico: "text-red-700",
};

export default async function RiscosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let riscos: RiscoRow[] = [];
  let solucoes: SolucaoRow[] = [];

  try {
    riscos = (await sql`
      SELECT id, tipo, titulo, descricao, nivel, identificado_em, fonte_indicador, status
      FROM riscos
      WHERE cod_ibge = ${codNum}
      ORDER BY
        CASE nivel WHEN 'critico' THEN 0 WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END,
        identificado_em DESC
    `) as RiscoRow[];
    solucoes = (await sql`
      SELECT tipo_risco, titulo, descricao, fundamento_legal, prioridade
      FROM solucoes_possiveis
      ORDER BY prioridade DESC, tipo_risco
    `) as SolucaoRow[];
  } catch (e) {
    console.error("[riscos]", e);
  }

  return (
    <div className="space-y-8">
      <Section title="Riscos identificados"
               subtitle="Riscos fiscais, orçamentários, judiciais, previdenciários, contratuais e externos. Classificados por nível de criticidade.">
        {riscos.length === 0 ? (
          <Placeholder
            titulo="Nenhum risco aberto neste município"
            descricao="Riscos serão automaticamente cadastrados quando indicadores LRF/LDO/educação/saúde ultrapassarem os limites legais ou apresentarem tendência negativa. Cadastro manual também disponível." />
        ) : (
          <Table cols={["Nível", "Tipo", "Título", "Indicador-gatilho", "Status", "Identificado"]}>
            {riscos.map(r => (
              <tr key={r.id} className="border-t border-slate-100">
                <Td><span className={`font-medium uppercase text-xs ${NIVEL_COLOR[r.nivel] ?? "text-slate-500"}`}>{r.nivel}</span></Td>
                <Td className="capitalize">{r.tipo}</Td>
                <Td className="font-medium">{r.titulo}</Td>
                <Td className="text-xs text-slate-500">{r.fonte_indicador ?? "—"}</Td>
                <Td><span className="text-xs capitalize">{r.status}</span></Td>
                <Td className="text-xs text-slate-500">{fmtDate(r.identificado_em)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Soluções recomendadas (catálogo)"
               subtitle="Conjunto de soluções possíveis cadastradas pelo Radar 360 para cada tipo de risco — referência para o gestor.">
        <Table cols={["Tipo de risco", "Solução", "Fundamento legal"]}>
          {solucoes.map((s, i) => (
            <tr key={i} className="border-t border-slate-100">
              <Td className="capitalize font-medium">{s.tipo_risco}</Td>
              <Td>
                <div className="font-medium">{s.titulo}</div>
                <div className="text-xs text-slate-600 mt-1">{s.descricao}</div>
              </Td>
              <Td className="text-xs text-slate-500">{s.fundamento_legal ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Section>
    </div>
  );
}
