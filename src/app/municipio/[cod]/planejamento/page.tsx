import { sql } from "@/lib/db";
import { Section, Table, Td, Empty, Placeholder, fmtDate } from "@/components/ModuloUI";

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

interface ProgramaRow {
  exercicio: number;
  codigo: string;
  nome: string;
  objetivo: string | null;
  total_estimado: string | null;
  orgao: string;
  n_acoes: number;
}

const META_LABEL: Record<string, string> = {
  receita_total: "Receita Total",
  receita_primaria: "Receitas Primárias",
  despesa_total: "Despesa Total",
  despesa_primaria: "Despesas Primárias",
  pessoal_encargos: "Pessoal e Encargos",
  outras_despesas_correntes: "Outras Despesas Correntes",
  reserva_contingencia: "Reserva de Contingência",
};

export default async function PlanejamentoPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let docs: DocLegal[] = [];
  let metas: MetaFiscal[] = [];
  let fiscais: IndFisc[] = [];
  let programas: ProgramaRow[] = [];

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
    programas = (await sql`
      SELECT p.exercicio, p.codigo, p.nome, p.objetivo, p.total_estimado,
             COALESCE(o.nome, '—') AS orgao,
             COUNT(a.id)::int AS n_acoes
      FROM programas p
      LEFT JOIN orgaos o ON o.id = p.orgao_id
      LEFT JOIN acoes a ON a.programa_id = p.id
      WHERE p.cod_ibge = ${codNum}
      GROUP BY p.id, o.nome
      ORDER BY p.total_estimado DESC NULLS LAST
    `) as ProgramaRow[];
  } catch (e) {
    console.error("[planejamento]", e);
  }

  // Programas agrupados por órgão (para a visão PPA)
  const porOrgao = new Map<string, ProgramaRow[]>();
  for (const p of programas) {
    const arr = porOrgao.get(p.orgao) ?? [];
    arr.push(p);
    porOrgao.set(p.orgao, arr);
  }
  const metasExerc = metas.length ? Math.max(...metas.map((m) => m.exercicio)) : null;

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
                <Td className="text-xs text-slate-500">{fmtDate(d.data_lei)}</Td>
                <Td>{d.validado
                  ? <span className="text-green-700 font-medium">validado</span>
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
          <Table cols={["Exercício", "Indicador", "Meta (R$)", "% RCL", "Base legal"]}>
            {metas.map((m, i) => (
              <tr key={i}>
                <Td>{m.exercicio}</Td>
                <Td className="font-semibold">{META_LABEL[m.indicador] ?? m.indicador.replace(/_/g, " ")}</Td>
                <Td>{m.meta_valor ? Number(m.meta_valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—"}</Td>
                <Td>{m.meta_pct ? `${Number(m.meta_pct).toFixed(2)}%` : "—"}</Td>
                <Td className="text-xs">{m.base_legal ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Programas e Ações (PPA / Anexo V da LDO) */}
      <Section
        title="Programas e Ações de governo"
        subtitle={
          metasExerc
            ? `Quadro geral de programas por órgão — exercício ${programas[0]?.exercicio ?? metasExerc} (LDO Anexo V).`
            : "Quadro geral de programas por órgão (LDO Anexo V)."
        }
      >
        {programas.length === 0 ? (
          <Placeholder
            titulo="Sem programas estruturados"
            descricao="Programas e ações são extraídos do Anexo V da LDO (Quadro Geral de Programas e Ações). Importe o anexo do município para popular esta visão."
          />
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--linha)" }}>
            {[...porOrgao.entries()].map(([orgao, progs]) => {
              const totalOrgao = progs.reduce((s, p) => s + (Number(p.total_estimado) || 0), 0);
              return (
                <details key={orgao} className="group">
                  <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-3 hover:bg-white/[0.03]">
                    <span className="text-xs" style={{ color: "var(--txt3)" }}>▸</span>
                    <span className="font-semibold flex-1" style={{ color: "var(--txt)" }}>{orgao}</span>
                    <span className="text-xs" style={{ color: "var(--txt3)" }}>{progs.length} prog.</span>
                    <span className="text-sm font-bold tabular-nums" style={{ color: "var(--cyan)" }}>
                      {totalOrgao.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
                    </span>
                  </summary>
                  <div className="px-4 pb-3">
                    <table className="w-full text-sm">
                      <tbody>
                        {progs.map((p) => (
                          <tr key={p.codigo} style={{ borderTop: "1px solid var(--linha)" }}>
                            <td className="py-2 pr-3 align-top" style={{ width: 56, color: "var(--txt3)", fontVariantNumeric: "tabular-nums" }}>{p.codigo}</td>
                            <td className="py-2 pr-3">
                              <div className="font-medium" style={{ color: "var(--txt)" }}>{p.nome}</div>
                              {p.objetivo && <div className="text-xs mt-0.5" style={{ color: "var(--txt3)" }}>{p.objetivo}</div>}
                            </td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap align-top" style={{ color: "var(--txt2)" }}>{p.n_acoes} ações</td>
                            <td className="py-2 text-right whitespace-nowrap align-top font-semibold tabular-nums" style={{ color: "var(--txt)" }}>
                              {p.total_estimado ? Number(p.total_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
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
