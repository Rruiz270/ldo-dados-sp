import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarMetaFiscal, removerMetaFiscal } from "../actions";
import { Target, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface MetaRow {
  exercicio: number;
  indicador: string;
  meta_valor: string | null;
  meta_pct: string | null;
  base_legal: string | null;
}

const INDICADORES = [
  { value: "resultado_primario", label: "Resultado primário", base: "LDO Anexo de Metas Fiscais (AMF)" },
  { value: "resultado_nominal", label: "Resultado nominal", base: "LDO Anexo de Metas Fiscais (AMF)" },
  { value: "divida_consolidada", label: "Dívida Consolidada Líquida", base: "Res. SF 40/2001 — 120% RCL" },
  { value: "receita_total", label: "Receita total", base: "LOA" },
  { value: "despesa_total", label: "Despesa total fixada", base: "LOA" },
];
const INDICADOR_LABEL: Record<string, string> = Object.fromEntries(INDICADORES.map((i) => [i.value, i.label]));

export default async function MetasPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let metas: MetaRow[] = [];
  try {
    metas = (await sql`
      SELECT exercicio, indicador, meta_valor, meta_pct, base_legal
      FROM ldo_metas_fiscais WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, indicador
    `) as MetaRow[];
  } catch (e) {
    console.error("[metas]", e);
  }

  const podeEditar = perfil.podeEditarCadastro;
  const anoAtual = new Date().getFullYear();

  async function criarAction(formData: FormData) {
    "use server";
    const metaValor = String(formData.get("meta_valor") || "").trim();
    const metaPct = String(formData.get("meta_pct") || "").trim();
    await criarMetaFiscal({
      codIbge: codNum,
      exercicio: parseInt(String(formData.get("exercicio") || "0"), 10),
      indicador: String(formData.get("indicador") || ""),
      metaValor: metaValor ? parseFloat(metaValor) : undefined,
      metaPct: metaPct ? parseFloat(metaPct) : undefined,
      baseLegal: String(formData.get("base_legal") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    await removerMetaFiscal(
      codNum,
      parseInt(String(formData.get("exercicio") || "0"), 10),
      String(formData.get("indicador") || ""),
    );
  }

  return (
    <div className="space-y-6">
      <a
        href={`${basePath}/municipio/${codNum}/cadastro`}
        className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
        style={{ color: "var(--azul-2)" }}
      >
        <ArrowLeft size={14} aria-hidden /> Voltar ao cadastro
      </a>

      <header>
        <Eyebrow>Módulo 4 · Planejamento e LDO</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
        >
          Metas fiscais da LDO
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Metas estabelecidas pela LDO local — resultado primário, resultado nominal e dívida.
          Servem como referência para os alertas de aderência da execução fiscal (RREO Anexo 06).
        </p>
      </header>

      {podeEditar ? (
        <Section title="Adicionar meta fiscal">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
              <Field label="Exercício *">
                <input
                  type="number"
                  name="exercicio"
                  defaultValue={anoAtual}
                  min="2020"
                  max="2099"
                  required
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)" }}
                />
              </Field>
              <Field label="Indicador *">
                <select name="indicador" required defaultValue="" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  <option value="">(selecione)</option>
                  {INDICADORES.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Meta em R$ (opcional)">
                <input
                  type="number"
                  name="meta_valor"
                  step="0.01"
                  placeholder="Ex.: 1500000.00"
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)" }}
                />
              </Field>
              <Field label="Meta em % (opcional)">
                <input
                  type="number"
                  name="meta_pct"
                  step="0.01"
                  placeholder="Ex.: 2.5"
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)" }}
                />
              </Field>
            </div>
            <Field label="Base legal (opcional)">
              <input type="text" name="base_legal" placeholder="Ex.: Lei Municipal nº 4.232/2024 art. 5º" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold"
              style={{ background: "var(--verde-2)", color: "white" }}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar meta
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão para editar" descricao={`Perfil "${perfil.nome}" só pode visualizar.`} />
      )}

      <Section title={`Metas cadastradas (${metas.length})`}>
        {metas.length === 0 ? (
          <Empty msg="Nenhuma meta fiscal cadastrada ainda." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {metas.map((m) => (
              <li key={`${m.exercicio}-${m.indicador}`} className="p-4">
                <div className="flex items-start gap-3">
                  <Target size={16} strokeWidth={1.75} className="mt-1 flex-shrink-0" style={{ color: "var(--azul-2)" }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>
                        {INDICADOR_LABEL[m.indicador] ?? m.indicador} — {m.exercicio}
                      </span>
                    </div>
                    <div className="text-xs mt-1 flex flex-wrap gap-3" style={{ color: "var(--grafite)" }}>
                      {m.meta_valor && (
                        <span>
                          <strong>R$ {Number(m.meta_valor).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}</strong>
                        </span>
                      )}
                      {m.meta_pct && (
                        <span>
                          <strong>{Number(m.meta_pct).toFixed(2)}%</strong>
                        </span>
                      )}
                      {m.base_legal && <span style={{ color: "var(--cinza)" }}>· {m.base_legal}</span>}
                    </div>
                  </div>
                  {podeEditar && (
                    <form action={removerAction}>
                      <input type="hidden" name="exercicio" value={m.exercicio} />
                      <input type="hidden" name="indicador" value={m.indicador} />
                      <button
                        type="submit"
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                        style={{ color: "#dc2626" }}
                        title="Remover meta"
                      >
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
