import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarFonteRecurso, removerFonteRecurso } from "../actions";
import { Coins, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface FonteRow {
  id: number;
  exercicio: number;
  codigo: string;
  nome: string;
  vinculacao: string | null;
}

const VINCULACOES = [
  { value: "livre", label: "Livre (Tesouro)" },
  { value: "educacao", label: "Educação (MDE)" },
  { value: "fundeb", label: "Fundeb" },
  { value: "saude", label: "Saúde (ASPS)" },
  { value: "assistencia", label: "Assistência Social" },
  { value: "convenios", label: "Convênios" },
  { value: "operacoes_credito", label: "Operações de crédito" },
  { value: "previdencia", label: "Previdência (RPPS)" },
  { value: "outros", label: "Outros" },
];

const VINC_LABEL: Record<string, string> = Object.fromEntries(VINCULACOES.map((v) => [v.value, v.label]));

export default async function FontesRecursosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let fontes: FonteRow[] = [];
  try {
    fontes = (await sql`
      SELECT id, exercicio, codigo, nome, vinculacao
      FROM fontes_recursos WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, codigo
    `) as FonteRow[];
  } catch (e) {
    console.error("[fontes-recursos]", e);
  }

  const podeEditar = perfil.podeEditarCadastro;
  const anoAtual = new Date().getFullYear();

  async function criarAction(formData: FormData) {
    "use server";
    await criarFonteRecurso({
      codIbge: codNum,
      exercicio: parseInt(String(formData.get("exercicio") || "0"), 10),
      codigo: String(formData.get("codigo") || ""),
      nome: String(formData.get("nome") || ""),
      vinculacao: String(formData.get("vinculacao") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    const id = parseInt(String(formData.get("id") || "0"), 10);
    await removerFonteRecurso(id, codNum);
  }

  // Agrupa por vinculação
  const porVinc = fontes.reduce((acc, f) => {
    const v = f.vinculacao || "sem_vinculacao";
    acc[v] ??= [];
    acc[v].push(f);
    return acc;
  }, {} as Record<string, FonteRow[]>);

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
        <Eyebrow>Módulo 1 · Cadastro institucional</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
        >
          Fontes de recursos
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Códigos de fonte usados na execução orçamentária, com a respectiva vinculação legal.
          Servem para analisar a aderência da despesa às fontes disponíveis (ex.: cumprimento do mínimo de educação).
        </p>
      </header>

      {podeEditar ? (
        <Section title="Adicionar fonte de recurso">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[120px_120px_1fr_180px] gap-3">
              <Field label="Exercício *">
                <input type="number" name="exercicio" defaultValue={anoAtual} min="2020" max="2099" required className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Código *">
                <input type="text" name="codigo" placeholder="00" required className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Nome *">
                <input type="text" name="nome" placeholder="Ex.: Recursos Próprios" required className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Vinculação">
                <select name="vinculacao" defaultValue="livre" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  {VINCULACOES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </Field>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold"
              style={{ background: "var(--verde-2)", color: "white" }}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar fonte
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão para editar" descricao={`Perfil "${perfil.nome}" só pode visualizar.`} />
      )}

      <Section title={`Fontes cadastradas (${fontes.length})`}>
        {fontes.length === 0 ? (
          <Empty msg="Nenhuma fonte de recurso cadastrada ainda." />
        ) : (
          <div className="divide-y divide-slate-100">
            {Object.entries(porVinc).map(([vinc, lista]) => (
              <div key={vinc} className="p-4">
                <h3 className="text-[11px] uppercase font-bold tracking-widest mb-2" style={{ color: "var(--cinza)", letterSpacing: "0.1em" }}>
                  {VINC_LABEL[vinc] ?? "Sem vinculação"} <span>· {lista.length}</span>
                </h3>
                <ul className="space-y-2">
                  {lista.map((f) => (
                    <li
                      key={f.id}
                      className="p-3 rounded-xl"
                      style={{ background: "rgba(11,47,99,0.03)", border: "1px solid rgba(11,47,99,0.07)" }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Coins size={14} strokeWidth={1.75} style={{ color: "var(--azul-2)" }} aria-hidden />
                          <span className="font-mono text-xs font-bold" style={{ color: "var(--cinza)" }}>{f.codigo}</span>
                          <span className="text-sm font-semibold" style={{ color: "var(--azul)" }}>{f.nome}</span>
                          <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>
                            · {f.exercicio}
                          </span>
                        </div>
                        {podeEditar && (
                          <form action={removerAction}>
                            <input type="hidden" name="id" value={f.id} />
                            <button
                              type="submit"
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              style={{ color: "#dc2626" }}
                              title="Remover"
                            >
                              <Trash2 size={13} strokeWidth={2} aria-hidden />
                            </button>
                          </form>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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
