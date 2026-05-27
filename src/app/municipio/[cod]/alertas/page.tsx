import { sql } from "@/lib/db";
import { Section, Table, Td, Placeholder, fmtDate } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface AlertaRow {
  id: number;
  indicador: string;
  exercicio: number | null;
  periodo: number | null;
  nivel: string;
  mensagem: string;
  base_legal: string | null;
  status: string;
  criado_em: string;
}

interface ProvidenciaRow {
  id: number;
  descricao: string;
  responsavel: string | null;
  prazo: string | null;
  status: string;
  criado_em: string;
}

const NIVEL_COLOR: Record<string, string> = {
  informativo: "text-slate-600",
  atencao: "text-amber-700",
  critico: "text-red-700",
};

export default async function AlertasPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let alertas: AlertaRow[] = [];
  let provs: ProvidenciaRow[] = [];

  try {
    alertas = (await sql`
      SELECT id, indicador, exercicio, periodo, nivel, mensagem, base_legal, status, criado_em
      FROM alertas
      WHERE cod_ibge = ${codNum}
      ORDER BY status, criado_em DESC
    `) as AlertaRow[];
    provs = (await sql`
      SELECT id, descricao, responsavel, prazo, status, criado_em
      FROM providencias
      WHERE cod_ibge = ${codNum}
      ORDER BY status, criado_em DESC
    `) as ProvidenciaRow[];
  } catch (e) {
    console.error("[alertas]", e);
  }

  return (
    <div className="space-y-8">
      <Section title="Alertas ativos"
               subtitle="Alertas preventivos disparados pelo Radar 360 a partir dos indicadores LRF, LDO, educação, saúde e externos.">
        {alertas.length === 0 ? (
          <Placeholder
            titulo="Nenhum alerta aberto"
            descricao="Engine de alertas em construção — vai cruzar automaticamente os indicadores LRF/LDO/educação/saúde com os limites da Matriz Legal e disparar alertas preventivos quando houver risco." />
        ) : (
          <Table cols={["Nível", "Indicador", "Período", "Mensagem", "Base legal", "Status"]}>
            {alertas.map(a => (
              <tr key={a.id} className="border-t border-slate-100">
                <Td><span className={`font-medium uppercase text-xs ${NIVEL_COLOR[a.nivel] ?? "text-slate-500"}`}>{a.nivel}</span></Td>
                <Td className="font-medium">{a.indicador}</Td>
                <Td className="text-xs">{a.exercicio}{a.periodo ? `/${a.periodo}` : ""}</Td>
                <Td>{a.mensagem}</Td>
                <Td className="text-xs text-slate-500">{a.base_legal ?? "—"}</Td>
                <Td><span className="text-xs capitalize">{a.status}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Providências"
               subtitle="Ações recomendadas, responsáveis, prazos e evidências de acompanhamento.">
        {provs.length === 0 ? (
          <Placeholder
            titulo="Nenhuma providência registrada"
            descricao="Providências são cadastradas manualmente em resposta a alertas ou riscos. Cada providência registra responsável, prazo, status (pendente/em andamento/concluída/justificada) e evidência." />
        ) : (
          <Table cols={["Descrição", "Responsável", "Prazo", "Status", "Criado"]}>
            {provs.map(p => (
              <tr key={p.id} className="border-t border-slate-100">
                <Td>{p.descricao}</Td>
                <Td className="text-xs">{p.responsavel ?? "—"}</Td>
                <Td className="text-xs">{fmtDate(p.prazo)}</Td>
                <Td><span className="text-xs capitalize">{p.status}</span></Td>
                <Td className="text-xs text-slate-500">{fmtDate(p.criado_em)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
