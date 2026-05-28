import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder, fmtBRL, fmtDate } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarContrato, removerContrato } from "../actions";
import { FileSignature, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ContratoRow {
  id: number;
  numero_contrato: string | null;
  objeto: string;
  contratado: string | null;
  cnpj_contratado: string | null;
  valor_anual: string | null;
  data_inicio: Date | string | null;
  data_fim: Date | string | null;
  modalidade: string | null;
  area: string | null;
  risco_paralisacao: string | null;
  observacoes: string | null;
}

const MODALIDADES = ["pregao", "concorrencia", "dispensa", "inexigibilidade", "tomada_precos", "outros"];
const AREAS = ["educacao", "saude", "limpeza_urbana", "transporte", "obras", "tecnologia", "alimentacao", "seguranca", "outros"];
const RISCOS = ["baixo", "medio", "alto"];

export default async function ContratosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();
  const podeEditar = perfil.podeImportarDados;

  let contratos: ContratoRow[] = [];
  let totalAnual = 0;
  try {
    contratos = (await sql`
      SELECT id, numero_contrato, objeto, contratado, cnpj_contratado, valor_anual,
             data_inicio, data_fim, modalidade, area, risco_paralisacao, observacoes
      FROM contratos_continuados WHERE cod_ibge = ${codNum}
      ORDER BY valor_anual DESC NULLS LAST, data_inicio DESC NULLS LAST
    `) as ContratoRow[];
    totalAnual = contratos.reduce((s, c) => s + Number(c.valor_anual || 0), 0);
  } catch (e) {
    console.error("[contratos]", e);
  }

  async function criarAction(formData: FormData) {
    "use server";
    await criarContrato({
      codIbge: codNum,
      numeroContrato: String(formData.get("numero_contrato") || ""),
      objeto: String(formData.get("objeto") || ""),
      contratado: String(formData.get("contratado") || ""),
      cnpjContratado: String(formData.get("cnpj_contratado") || ""),
      valorAnual: parseFloat(String(formData.get("valor_anual") || "0")) || undefined,
      dataInicio: String(formData.get("data_inicio") || ""),
      dataFim: String(formData.get("data_fim") || ""),
      modalidade: String(formData.get("modalidade") || ""),
      area: String(formData.get("area") || ""),
      riscoParalisacao: String(formData.get("risco_paralisacao") || ""),
      observacoes: String(formData.get("observacoes") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    await removerContrato(parseInt(String(formData.get("id") || "0"), 10), codNum);
  }

  return (
    <div className="space-y-6">
      <a href={`${basePath}/municipio/${codNum}/importar`} className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--azul-2)" }}>
        <ArrowLeft size={14} aria-hidden /> Voltar a importar dados
      </a>

      <header>
        <Eyebrow>Importação manual · LRF Art. 16</Eyebrow>
        <h1 className="font-bold mt-3" style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Contratos continuados
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Despesas obrigatórias de caráter continuado (LRF Art. 16). Total anual:{" "}
          <strong>{fmtBRL(totalAnual)}</strong>.
        </p>
      </header>

      {podeEditar ? (
        <Section title="Cadastrar contrato continuado">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-3">
              <Field label="Número *">
                <input type="text" name="numero_contrato" placeholder="Nº/AAAA" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Objeto *">
                <input type="text" name="objeto" required placeholder="Ex.: Serviços continuados de limpeza urbana" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Contratado">
                <input type="text" name="contratado" placeholder="Razão social" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="CNPJ">
                <input type="text" name="cnpj_contratado" placeholder="00.000.000/0001-00" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Field label="Valor anual (R$)">
                <input type="number" name="valor_anual" step="0.01" min="0" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Início">
                <input type="date" name="data_inicio" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Fim">
                <input type="date" name="data_fim" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Modalidade">
                <select name="modalidade" defaultValue="pregao" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {MODALIDADES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Área">
                <select name="area" defaultValue="outros" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Risco de paralisação">
                <select name="risco_paralisacao" defaultValue="medio" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {RISCOS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Observações">
              <textarea name="observacoes" rows={2} className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold" style={{ background: "var(--verde-2)", color: "white" }}>
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar contrato
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão" descricao={`Perfil "${perfil.nome}" não pode importar. Mude para Secretário.`} />
      )}

      <Section title={`Contratos cadastrados (${contratos.length})`}>
        {contratos.length === 0 ? (
          <Empty msg="Nenhum contrato continuado cadastrado." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {contratos.map((c) => (
              <li key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <FileSignature size={16} strokeWidth={1.75} className="mt-1 flex-shrink-0" style={{ color: "var(--azul-2)" }} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>{c.objeto}</span>
                        {c.numero_contrato && <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>· {c.numero_contrato}</span>}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--grafite)" }}>
                        {c.contratado && <span><strong>{c.contratado}</strong></span>}
                        {c.cnpj_contratado && <span> · {c.cnpj_contratado}</span>}
                      </div>
                      <div className="text-xs mt-1 flex flex-wrap gap-3" style={{ color: "var(--cinza)" }}>
                        {c.valor_anual && <span><strong>{fmtBRL(c.valor_anual)}</strong>/ano</span>}
                        {c.area && <span>· {c.area}</span>}
                        {c.modalidade && <span>· {c.modalidade}</span>}
                        {c.data_inicio && c.data_fim && <span>· {fmtDate(c.data_inicio)} a {fmtDate(c.data_fim)}</span>}
                        {c.risco_paralisacao && <span>· risco {c.risco_paralisacao}</span>}
                      </div>
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
