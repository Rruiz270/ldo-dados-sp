import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder, fmtDate } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarRiscoManual, removerRisco } from "../actions";
import { AlertTriangle, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface RiscoRow {
  id: number;
  tipo: string;
  titulo: string;
  descricao: string | null;
  nivel: string;
  identificado_em: Date | string;
  valor_referencia: string | null;
  status: string;
}

const TIPOS_RISCO = [
  { value: "receita",        label: "Receita — frustração de arrecadação" },
  { value: "despesa",        label: "Despesa — aumento de folha, contratos" },
  { value: "divida",         label: "Dívida — encargos, vencimentos concentrados" },
  { value: "judicial",       label: "Judicial — precatórios, ações trabalhistas" },
  { value: "previdenciario", label: "Previdenciário — déficit atuarial, RPPS" },
  { value: "contratual",     label: "Contratual — obras paralisadas, aditivos" },
  { value: "orcamentario",   label: "Orçamentário — baixa execução de programas" },
  { value: "externo",        label: "Externo — piora em IDEB, IEGM, IGM" },
];

const NIVEIS = [
  { value: "baixo",   label: "Baixo",   cor: "#1d8a43" },
  { value: "medio",   label: "Médio",   cor: "#0f4f8f" },
  { value: "alto",    label: "Alto",    cor: "#d97706" },
  { value: "critico", label: "Crítico", cor: "#dc2626" },
];

const NIVEL_CFG: Record<string, { cor: string; label: string }> = Object.fromEntries(NIVEIS.map((n) => [n.value, { cor: n.cor, label: n.label }]));

export default async function RiscosImportPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();
  const podeEditar = perfil.podeImportarDados;

  let riscos: RiscoRow[] = [];
  try {
    riscos = (await sql`
      SELECT id, tipo, titulo, descricao, nivel, identificado_em, valor_referencia, status
      FROM riscos WHERE cod_ibge = ${codNum} AND status = 'aberto'
      ORDER BY CASE nivel WHEN 'critico' THEN 0 WHEN 'alto' THEN 1 WHEN 'medio' THEN 2 ELSE 3 END,
               identificado_em DESC
    `) as RiscoRow[];
  } catch (e) {
    console.error("[riscos import]", e);
  }

  async function criarAction(formData: FormData) {
    "use server";
    await criarRiscoManual({
      codIbge: codNum,
      tipo: String(formData.get("tipo") || ""),
      titulo: String(formData.get("titulo") || ""),
      descricao: String(formData.get("descricao") || ""),
      nivel: String(formData.get("nivel") || ""),
      valorReferencia: parseFloat(String(formData.get("valor_referencia") || "0")) || undefined,
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    const id = parseInt(String(formData.get("id") || "0"), 10);
    await removerRisco(id, codNum);
  }

  return (
    <div className="space-y-6">
      <a
        href={`${basePath}/municipio/${codNum}/importar`}
        className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
        style={{ color: "var(--azul-2)" }}
      >
        <ArrowLeft size={14} aria-hidden /> Voltar a importar dados
      </a>

      <header>
        <Eyebrow>Importação manual · Módulo 8 (Riscos fiscais)</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
        >
          Riscos identificados localmente
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Riscos identificados pela equipe técnica do município que ainda não foram detectados por
          alertas automáticos — passivos previdenciários, obras paralisadas, decisões judiciais
          iminentes, etc. Servem ao Anexo de Riscos Fiscais (ARF) da LDO.
        </p>
      </header>

      {podeEditar ? (
        <Section title="Registrar novo risco">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Tipo *">
                <select name="tipo" required defaultValue="" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  <option value="">(selecione)</option>
                  {TIPOS_RISCO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Nível *">
                <select name="nivel" required defaultValue="medio" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {NIVEIS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Título *">
              <input type="text" name="titulo" required placeholder="Ex.: Reajuste de folha previsto não orçado" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <Field label="Descrição">
              <textarea name="descricao" rows={3} placeholder="Contexto, fundamento, partes envolvidas, prazo previsto." className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <Field label="Valor de referência (R$) — impacto estimado">
              <input type="number" name="valor_referencia" step="0.01" min="0" placeholder="Ex.: 250000.00" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold" style={{ background: "var(--verde-2)", color: "white" }}>
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Cadastrar risco
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão" descricao={`Perfil "${perfil.nome}" não pode cadastrar riscos. Mude para Secretário.`} />
      )}

      <Section title={`Riscos em aberto (${riscos.length})`}>
        {riscos.length === 0 ? (
          <Empty msg="Nenhum risco cadastrado em aberto." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {riscos.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <AlertTriangle size={16} strokeWidth={1.75} className="mt-1 flex-shrink-0" style={{ color: NIVEL_CFG[r.nivel]?.cor ?? "var(--cinza)" }} aria-hidden />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2 mb-1">
                        <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>{r.titulo}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                          style={{ background: `${NIVEL_CFG[r.nivel]?.cor}1f`, color: NIVEL_CFG[r.nivel]?.cor, letterSpacing: "0.05em" }}
                        >
                          {NIVEL_CFG[r.nivel]?.label ?? r.nivel}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>
                          · {r.tipo}
                        </span>
                      </div>
                      {r.descricao && <div className="text-xs" style={{ color: "var(--grafite)" }}>{r.descricao}</div>}
                      <div className="text-xs mt-1 flex flex-wrap gap-3" style={{ color: "var(--cinza)" }}>
                        {r.valor_referencia && (
                          <span>Impacto estimado: <strong>{Number(r.valor_referencia).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}</strong></span>
                        )}
                        <span>Identificado em {fmtDate(r.identificado_em)}</span>
                      </div>
                    </div>
                  </div>
                  {podeEditar && (
                    <form action={removerAction}>
                      <input type="hidden" name="id" value={r.id} />
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
