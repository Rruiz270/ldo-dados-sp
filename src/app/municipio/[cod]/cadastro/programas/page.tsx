import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarPrograma, removerPrograma } from "../actions";
import { BookOpen, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ProgramaRow {
  id: number;
  exercicio: number;
  codigo: string;
  nome: string;
  objetivo: string | null;
  area: string | null;
  publico_alvo: string | null;
}

const AREAS = [
  "Educação",
  "Saúde",
  "Assistência Social",
  "Cultura",
  "Urbanismo",
  "Habitação",
  "Saneamento",
  "Gestão Ambiental",
  "Desporto e Lazer",
  "Agricultura",
  "Segurança Pública",
  "Transporte",
  "Administração",
  "Outros",
];

export default async function ProgramasPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let programas: ProgramaRow[] = [];
  try {
    programas = (await sql`
      SELECT id, exercicio, codigo, nome, objetivo, area, publico_alvo
      FROM programas WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, codigo
    `) as ProgramaRow[];
  } catch (e) {
    console.error("[programas]", e);
  }

  const podeEditar = perfil.podeEditarCadastro;
  const anoAtual = new Date().getFullYear();

  async function criarAction(formData: FormData) {
    "use server";
    await criarPrograma({
      codIbge: codNum,
      exercicio: parseInt(String(formData.get("exercicio") || "0"), 10),
      codigo: String(formData.get("codigo") || ""),
      nome: String(formData.get("nome") || ""),
      objetivo: String(formData.get("objetivo") || ""),
      area: String(formData.get("area") || ""),
      publicoAlvo: String(formData.get("publico_alvo") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    const id = parseInt(String(formData.get("id") || "0"), 10);
    await removerPrograma(id, codNum);
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
        <Eyebrow>Módulo 1 · Cadastro institucional</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
        >
          Programas do PPA
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Programas estruturantes do Plano Plurianual (PPA) com objetivo, área e público-alvo.
          Vinculados ao ano-base de planejamento.
        </p>
      </header>

      {podeEditar ? (
        <Section title="Adicionar programa">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[120px_120px_1fr] gap-3">
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
              <Field label="Código *">
                <input
                  type="text"
                  name="codigo"
                  placeholder="0001"
                  required
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)" }}
                />
              </Field>
              <Field label="Nome do programa *">
                <input
                  type="text"
                  name="nome"
                  placeholder="Ex.: Educação Infantil de Qualidade"
                  required
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)" }}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Área">
                <select name="area" defaultValue="" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  <option value="">(selecione)</option>
                  {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label="Público-alvo">
                <input type="text" name="publico_alvo" placeholder="Ex.: Crianças de 0 a 5 anos" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <Field label="Objetivo">
              <textarea name="objetivo" rows={2} placeholder="Descrição do objetivo estratégico do programa" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold"
              style={{ background: "var(--verde-2)", color: "white" }}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar programa
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão para editar" descricao={`Perfil "${perfil.nome}" só pode visualizar. Mude para Prefeito ou Secretário.`} />
      )}

      <Section title={`Programas cadastrados (${programas.length})`}>
        {programas.length === 0 ? (
          <Empty msg="Nenhum programa cadastrado ainda." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {programas.map((p) => (
              <li key={p.id} className="p-4">
                <div className="flex items-start gap-3">
                  <BookOpen size={16} strokeWidth={1.75} className="mt-1 flex-shrink-0" style={{ color: "var(--azul-2)" }} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>{p.codigo} — {p.nome}</span>
                      <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>
                        {p.exercicio}{p.area && ` · ${p.area}`}
                      </span>
                    </div>
                    {p.objetivo && <div className="text-xs mt-1" style={{ color: "var(--grafite)" }}>{p.objetivo}</div>}
                    {p.publico_alvo && (
                      <div className="text-xs mt-1 italic" style={{ color: "var(--cinza)" }}>
                        Público-alvo: {p.publico_alvo}
                      </div>
                    )}
                  </div>
                  {podeEditar && (
                    <form action={removerAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button
                        type="submit"
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                        style={{ color: "#dc2626" }}
                        title="Remover programa"
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
