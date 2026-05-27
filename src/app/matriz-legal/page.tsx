import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, Eyebrow } from "@/components/ModuloUI";

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
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-7">
      <header>
        <Eyebrow>Base normativa do sistema</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{
            color: "var(--azul)",
            fontSize: "clamp(34px, 5vw, 52px)",
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          Matriz Legal
        </h1>
        <p className="text-sm md:text-base mt-3 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Cada indicador, alerta e providência do Radar 360 é vinculado à norma que o sustenta —
          permitindo rastreabilidade técnica das análises e sustentação jurídica das decisões.
        </p>
      </header>

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
