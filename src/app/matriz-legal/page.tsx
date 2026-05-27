import { sql } from "@/lib/db";
import { Section, Table, Td, Empty } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface MatrizRow {
  id: number;
  norma: string;
  artigo: string | null;
  ementa: string | null;
  indicador: string | null;
  parametro: string | null;
  link_oficial: string | null;
}

interface FonteRow {
  id: string;
  operador: string;
  url_base: string | null;
  tipo_acesso: string | null;
  cobertura: string | null;
  observacoes: string | null;
}

export default async function MatrizLegalPage() {
  let matriz: MatrizRow[] = [];
  let fontes: FonteRow[] = [];

  try {
    matriz = (await sql`
      SELECT id, norma, artigo, ementa, indicador, parametro, link_oficial
      FROM matriz_legal
      WHERE ativo = TRUE
      ORDER BY norma, artigo
    `) as MatrizRow[];
    fontes = (await sql`
      SELECT id, operador, url_base, tipo_acesso, cobertura, observacoes
      FROM fontes
      WHERE ativo = TRUE
      ORDER BY id
    `) as FonteRow[];
  } catch (e) {
    console.error("[matriz-legal]", e);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-slate-500 font-medium">Radar Fiscal 360</div>
        <h1 className="text-3xl md:text-4xl font-bold mt-1" style={{ color: "#0A2463", fontFamily: "var(--font-display)" }}>
          Matriz Legal
        </h1>
        <p className="text-sm text-slate-600 mt-2">
          Cada indicador, alerta e providência do Radar 360 é vinculado à norma que o sustenta — permitindo rastreabilidade técnica das análises.
        </p>
      </div>

      <Section title="Base normativa dos indicadores"
               subtitle="Constituição Federal, LRF, Lei 4.320/64, Lei do Fundeb, LC 141 (Saúde) e resoluções do Senado.">
        {matriz.length === 0 ? (
          <Empty msg="Matriz legal não carregada." />
        ) : (
          <Table cols={["Norma", "Artigo", "Ementa", "Indicador", "Parâmetro", "Link"]}>
            {matriz.map(m => (
              <tr key={m.id} className="border-t border-slate-100">
                <Td className="font-medium">{m.norma}</Td>
                <Td className="text-xs">{m.artigo ?? "—"}</Td>
                <Td>{m.ementa}</Td>
                <Td className="text-xs text-slate-600">{m.indicador ?? "—"}</Td>
                <Td className="text-xs">{m.parametro ?? "—"}</Td>
                <Td>{m.link_oficial
                  ? <a href={m.link_oficial} target="_blank" rel="noopener" className="text-cyan-700 underline text-xs">abrir</a>
                  : "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Fontes oficiais integradas"
               subtitle="APIs e portais oficiais que alimentam o Radar 360 com dados auditáveis.">
        {fontes.length === 0 ? (
          <Empty msg="Sem fontes cadastradas." />
        ) : (
          <Table cols={["ID", "Operador", "Tipo de acesso", "Cobertura", "Observações"]}>
            {fontes.map(f => (
              <tr key={f.id} className="border-t border-slate-100">
                <Td className="font-medium">{f.id}</Td>
                <Td className="text-xs">{f.operador}</Td>
                <Td className="text-xs text-slate-500">{f.tipo_acesso ?? "—"}</Td>
                <Td className="text-xs">{f.cobertura ?? "—"}</Td>
                <Td className="text-xs text-slate-600">{f.observacoes ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
