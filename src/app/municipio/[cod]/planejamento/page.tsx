import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, Placeholder } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface DocLegal {
  id: number;
  tipo: string;
  exercicio: number | null;
  inicio_exercicio: number | null;
  fim_exercicio: number | null;
  numero_lei: string | null;
  data_lei: string | null;
  url_pdf: string | null;
  validado: boolean;
}

interface MetaFiscal {
  exercicio: number;
  indicador: string;
  meta_valor: string | null;
  meta_pct: string | null;
  base_legal: string | null;
}

interface IndFisc {
  exercicio: number;
  periodo: number;
  indicador: string;
  valor: string;
  meta: string | null;
  fonte: string;
}

export default async function PlanejamentoPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let docs: DocLegal[] = [];
  let metas: MetaFiscal[] = [];
  let fiscais: IndFisc[] = [];

  try {
    docs = (await sql`
      SELECT id, tipo, exercicio, inicio_exercicio, fim_exercicio, numero_lei, data_lei, url_pdf, validado
      FROM documentos_legais
      WHERE cod_ibge = ${codNum}
      ORDER BY tipo, exercicio DESC NULLS LAST
    `) as DocLegal[];
    metas = (await sql`
      SELECT exercicio, indicador, meta_valor, meta_pct, base_legal
      FROM ldo_metas_fiscais
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, indicador
    `) as MetaFiscal[];
    fiscais = (await sql`
      SELECT exercicio, periodo, indicador, valor, meta, fonte
      FROM indicadores_fiscais
      WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, periodo DESC
      LIMIT 20
    `) as IndFisc[];
  } catch (e) {
    console.error("[planejamento]", e);
  }

  return (
    <div className="space-y-8">
      <Section title="Documentos legais (PPA, LDO, LOA)"
               subtitle="Leis orçamentárias municipais. Cobertura best-effort — PPA/LDO/LOA são fragmentados entre portais municipais.">
        {docs.length === 0 ? (
          <div>
            <Placeholder
              titulo="Nenhum documento indexado"
              descricao="Estamos construindo um crawler por família de portal (intellgest, SAPL, IPM, mitraonline). Cobertura inicial ~10%, alvo 70%." />
          </div>
        ) : (
          <Table cols={["Tipo", "Vigência", "Lei nº", "Data", "Validado?", "Link"]}>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <Td className="font-medium">{d.tipo}</Td>
                <Td>{d.tipo === "PPA"
                  ? `${d.inicio_exercicio ?? "?"} – ${d.fim_exercicio ?? "?"}`
                  : d.exercicio ?? "—"}</Td>
                <Td className="text-xs">{d.numero_lei || "—"}</Td>
                <Td className="text-xs text-slate-500">{d.data_lei?.slice(0, 10) ?? "—"}</Td>
                <Td>{d.validado
                  ? <span className="text-green-700 font-medium">✓</span>
                  : <span className="text-slate-400">pendente</span>}</Td>
                <Td>{d.url_pdf
                  ? <a href={d.url_pdf} target="_blank" rel="noopener" className="text-cyan-700 underline text-xs">abrir PDF</a>
                  : "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Metas fiscais da LDO"
               subtitle="Resultado primário, resultado nominal, dívida — metas estabelecidas pela LDO local.">
        {metas.length === 0 ? (
          <Placeholder
            titulo="Sem metas LDO estruturadas"
            descricao="Metas serão extraídas dos PDFs da LDO + Anexo de Metas Fiscais (AMF) do SICONFI quando o crawler de portais municipais for executado." />
        ) : (
          <Table cols={["Exercício", "Indicador", "Meta (R$)", "Meta (%)", "Base legal"]}>
            {metas.map((m, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{m.exercicio}</Td>
                <Td className="font-medium">{m.indicador.replace(/_/g, " ")}</Td>
                <Td>{m.meta_valor ? Number(m.meta_valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</Td>
                <Td>{m.meta_pct ? `${Number(m.meta_pct).toFixed(2)}%` : "—"}</Td>
                <Td className="text-xs text-slate-500">{m.base_legal ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Resultado primário / nominal — execução"
               subtitle="Valores realizados vs meta da LDO. Fonte: RREO Anexo 06 (SICONFI).">
        {fiscais.length === 0 ? (
          <Empty msg="Sem indicadores fiscais para este município." />
        ) : (
          <Table cols={["Exercício", "Bim.", "Indicador", "Realizado", "Meta LDO", "Fonte"]}>
            {fiscais.map((f, i) => (
              <tr key={i} className="border-t border-slate-100">
                <Td>{f.exercicio}</Td>
                <Td>{f.periodo}</Td>
                <Td className="font-medium">{f.indicador.replace(/_/g, " ")}</Td>
                <Td>{Number(f.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</Td>
                <Td>{f.meta ? Number(f.meta).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—"}</Td>
                <Td className="text-xs text-slate-500">{f.fonte}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
