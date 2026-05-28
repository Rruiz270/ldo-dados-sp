import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder, fmtBRL, fmtDate } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarConvenio, removerConvenio } from "../actions";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ConvenioRow {
  id: number;
  numero_convenio: string | null;
  objeto: string;
  concedente: string | null;
  esfera_concedente: string | null;
  valor_total: string | null;
  valor_contrapartida: string | null;
  data_inicio: Date | string | null;
  data_fim: Date | string | null;
  status: string;
  area: string | null;
  observacoes: string | null;
}

const STATUS = [
  { value: "em_execucao", label: "Em execução", cor: "#0f4f8f" },
  { value: "concluido",   label: "Concluído",   cor: "#1d8a43" },
  { value: "rescindido",  label: "Rescindido",  cor: "#dc2626" },
  { value: "inadimplente", label: "Inadimplente", cor: "#d97706" },
];
const STATUS_CFG: Record<string, { label: string; cor: string }> = Object.fromEntries(STATUS.map((s) => [s.value, { label: s.label, cor: s.cor }]));

const ESFERAS = ["federal", "estadual", "consorcio", "outros"];
const AREAS = ["educacao", "saude", "infraestrutura", "assistencia_social", "agricultura", "cultura", "esporte", "outros"];

export default async function ConveniosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();
  const podeEditar = perfil.podeImportarDados;

  let convenios: ConvenioRow[] = [];
  let totalEmExecucao = 0;
  try {
    convenios = (await sql`
      SELECT id, numero_convenio, objeto, concedente, esfera_concedente,
             valor_total, valor_contrapartida, data_inicio, data_fim, status, area, observacoes
      FROM convenios WHERE cod_ibge = ${codNum}
      ORDER BY CASE status WHEN 'em_execucao' THEN 0 WHEN 'inadimplente' THEN 1 ELSE 2 END,
               valor_total DESC NULLS LAST
    `) as ConvenioRow[];
    totalEmExecucao = convenios
      .filter((c) => c.status === "em_execucao")
      .reduce((s, c) => s + Number(c.valor_total || 0), 0);
  } catch (e) {
    console.error("[convenios]", e);
  }

  async function criarAction(formData: FormData) {
    "use server";
    await criarConvenio({
      codIbge: codNum,
      numeroConvenio: String(formData.get("numero_convenio") || ""),
      objeto: String(formData.get("objeto") || ""),
      concedente: String(formData.get("concedente") || ""),
      esferaConcedente: String(formData.get("esfera_concedente") || ""),
      valorTotal: parseFloat(String(formData.get("valor_total") || "0")) || undefined,
      valorContrapartida: parseFloat(String(formData.get("valor_contrapartida") || "0")) || undefined,
      dataInicio: String(formData.get("data_inicio") || ""),
      dataFim: String(formData.get("data_fim") || ""),
      status: String(formData.get("status") || "em_execucao"),
      area: String(formData.get("area") || ""),
      observacoes: String(formData.get("observacoes") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    await removerConvenio(parseInt(String(formData.get("id") || "0"), 10), codNum);
  }

  return (
    <div className="space-y-6">
      <a href={`${basePath}/municipio/${codNum}/importar`} className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--azul-2)" }}>
        <ArrowLeft size={14} aria-hidden /> Voltar a importar dados
      </a>

      <header>
        <Eyebrow>Importação manual · Transferências voluntárias</Eyebrow>
        <h1 className="font-bold mt-3" style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Convênios
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Convênios e transferências voluntárias recebidas/realizadas pelo município. Total em
          execução: <strong>{fmtBRL(totalEmExecucao)}</strong>.
        </p>
      </header>

      {podeEditar ? (
        <Section title="Cadastrar convênio">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
              <Field label="Número">
                <input type="text" name="numero_convenio" placeholder="Nº/AAAA" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Objeto *">
                <input type="text" name="objeto" required placeholder="Ex.: Repasse para creches" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Concedente">
                <input type="text" name="concedente" placeholder="Ex.: FNDE / FUNASA / Estado-SP" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Esfera">
                <select name="esfera_concedente" defaultValue="federal" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {ESFERAS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Valor total (R$)">
                <input type="number" name="valor_total" step="0.01" min="0" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Contrapartida (R$)">
                <input type="number" name="valor_contrapartida" step="0.01" min="0" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Início"><input type="date" name="data_inicio" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} /></Field>
              <Field label="Fim"><input type="date" name="data_fim" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} /></Field>
              <Field label="Status">
                <select name="status" defaultValue="em_execucao" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Área">
                <select name="area" defaultValue="outros" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Observações">
              <textarea name="observacoes" rows={2} className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold" style={{ background: "var(--verde-2)", color: "white" }}>
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar convênio
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão" descricao={`Perfil "${perfil.nome}" não pode importar. Mude para Secretário.`} />
      )}

      <Section title={`Convênios cadastrados (${convenios.length})`}>
        {convenios.length === 0 ? (
          <Empty msg="Nenhum convênio cadastrado." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {convenios.map((c) => (
              <li key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 mb-1">
                      <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>{c.objeto}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                        style={{ background: `${STATUS_CFG[c.status]?.cor}1f`, color: STATUS_CFG[c.status]?.cor, letterSpacing: "0.05em" }}
                      >
                        {STATUS_CFG[c.status]?.label ?? c.status}
                      </span>
                      {c.numero_convenio && <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>· {c.numero_convenio}</span>}
                    </div>
                    <div className="text-xs mt-1 flex flex-wrap gap-3" style={{ color: "var(--cinza)" }}>
                      {c.concedente && <span><strong>{c.concedente}</strong> ({c.esfera_concedente})</span>}
                      {c.valor_total && <span>· Total: <strong>{fmtBRL(c.valor_total)}</strong></span>}
                      {c.valor_contrapartida && <span>· Contrapartida: {fmtBRL(c.valor_contrapartida)}</span>}
                      {c.data_inicio && c.data_fim && <span>· {fmtDate(c.data_inicio)} a {fmtDate(c.data_fim)}</span>}
                      {c.area && <span>· {c.area}</span>}
                    </div>
                  </div>
                  {podeEditar && (
                    <form action={removerAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="p-2 rounded-lg hover:bg-red-50 transition-colors" style={{ color: "#dc2626" }} title="Remover">
                        <Trash2 size={14} strokeWidth={2} aria-hidden />
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold block mb-1.5 uppercase tracking-wider" style={{ color: "var(--azul)", letterSpacing: "0.05em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}
