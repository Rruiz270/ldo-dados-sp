import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarOrgao, atualizarOrgao, removerOrgao } from "../actions";
import { Building2, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface OrgaoRow {
  id: number;
  nome: string;
  tipo: string;
  responsavel: string | null;
  cargo_responsavel: string | null;
  contato: string | null;
  observacoes: string | null;
  ativo: boolean;
}

const TIPOS = [
  { value: "executivo",  label: "Executivo" },
  { value: "legislativo", label: "Legislativo (Câmara)" },
  { value: "autarquia",  label: "Autarquia" },
  { value: "fundacao",   label: "Fundação" },
  { value: "fundo",      label: "Fundo" },
  { value: "consorcio",  label: "Consórcio público" },
];

const TIPO_LABEL: Record<string, string> = Object.fromEntries(TIPOS.map((t) => [t.value, t.label]));

export default async function OrgaosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let orgaos: OrgaoRow[] = [];
  try {
    orgaos = (await sql`
      SELECT id, nome, tipo, responsavel, cargo_responsavel, contato, observacoes, ativo
      FROM orgaos
      WHERE cod_ibge = ${codNum}
      ORDER BY ativo DESC, tipo, nome
    `) as OrgaoRow[];
  } catch (e) {
    console.error("[orgaos]", e);
  }

  const podeEditar = perfil.podeEditarCadastro;

  async function criarAction(formData: FormData) {
    "use server";
    await criarOrgao({
      codIbge: codNum,
      nome: String(formData.get("nome") || ""),
      tipo: String(formData.get("tipo") || ""),
      responsavel: String(formData.get("responsavel") || ""),
      cargoResponsavel: String(formData.get("cargo_responsavel") || ""),
      contato: String(formData.get("contato") || ""),
      observacoes: String(formData.get("observacoes") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    const id = parseInt(String(formData.get("id") || "0"), 10);
    await removerOrgao(id, codNum);
  }

  async function atualizarAction(formData: FormData) {
    "use server";
    const id = parseInt(String(formData.get("id") || "0"), 10);
    await atualizarOrgao({
      id,
      codIbge: codNum,
      responsavel: String(formData.get("responsavel") || ""),
      cargoResponsavel: String(formData.get("cargo_responsavel") || ""),
      contato: String(formData.get("contato") || ""),
    });
  }

  const porTipo = orgaos.reduce((acc, o) => {
    acc[o.tipo] ??= [];
    acc[o.tipo].push(o);
    return acc;
  }, {} as Record<string, OrgaoRow[]>);

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
          Órgãos
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Executivo, Legislativo, autarquias, fundações, fundos e consórcios públicos do município.
          Cada órgão tem um responsável técnico nomeado.
        </p>
      </header>

      {/* Form de criação */}
      {podeEditar ? (
        <Section title="Adicionar órgão" subtitle="Inclua um novo órgão ou entidade vinculada.">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
              <Field label="Nome *">
                <input
                  type="text"
                  name="nome"
                  required
                  placeholder="Ex.: Prefeitura Municipal"
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
                />
              </Field>
              <Field label="Tipo *">
                <select
                  name="tipo"
                  required
                  defaultValue="executivo"
                  className="w-full p-2.5 rounded-lg text-sm"
                  style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
                >
                  {TIPOS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Responsável">
                <input type="text" name="responsavel" placeholder="Nome completo" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Cargo">
                <input type="text" name="cargo_responsavel" placeholder="Ex.: Prefeito" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Contato">
                <input type="text" name="contato" placeholder="Email ou telefone" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <Field label="Observações (opcional)">
              <textarea name="observacoes" rows={2} className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold"
              style={{ background: "var(--verde-2)", color: "white" }}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar órgão
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder
          titulo="Sem permissão para editar"
          descricao={`Perfil "${perfil.nome}" pode ver órgãos, mas não cadastrar. Mude para Prefeito ou Secretário.`}
        />
      )}

      {/* Listagem */}
      <Section title={`Órgãos cadastrados (${orgaos.filter((o) => o.ativo).length})`}>
        {orgaos.length === 0 ? (
          <Empty msg="Nenhum órgão cadastrado ainda." />
        ) : (
          <div className="divide-y divide-slate-100">
            {Object.entries(porTipo).map(([tipo, lista]) => (
              <div key={tipo} className="p-4">
                <h3 className="text-[11px] uppercase font-bold tracking-widest mb-2" style={{ color: "var(--cinza)", letterSpacing: "0.1em" }}>
                  {TIPO_LABEL[tipo] ?? tipo} <span style={{ color: "var(--cinza)" }}>· {lista.length}</span>
                </h3>
                <ul className="space-y-2">
                  {lista.map((o) => (
                    <li
                      key={o.id}
                      className="p-3 rounded-xl"
                      style={{
                        background: o.ativo ? "rgba(11,47,99,0.03)" : "rgba(102,112,133,0.05)",
                        border: "1px solid rgba(11,47,99,0.07)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Building2 size={14} strokeWidth={1.75} style={{ color: "var(--azul-2)" }} aria-hidden />
                            <span className="font-bold text-sm" style={{ color: o.ativo ? "var(--azul)" : "var(--cinza)" }}>
                              {o.nome}
                            </span>
                            {!o.ativo && <span className="text-[10px] uppercase font-bold" style={{ color: "var(--cinza)" }}>inativo</span>}
                          </div>
                          {(o.responsavel || o.cargo_responsavel) && (
                            <div className="text-xs mt-1" style={{ color: "var(--grafite)" }}>
                              <strong>{o.responsavel ?? "(sem responsável)"}</strong>
                              {o.cargo_responsavel && <span> · {o.cargo_responsavel}</span>}
                              {o.contato && <span> · {o.contato}</span>}
                            </div>
                          )}
                          {o.observacoes && (
                            <div className="text-xs mt-1 italic" style={{ color: "var(--cinza)" }}>
                              {o.observacoes}
                            </div>
                          )}

                          {podeEditar && !o.responsavel && (
                            <form action={atualizarAction} className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto] gap-2">
                              <input type="hidden" name="id" value={o.id} />
                              <input type="text" name="responsavel" placeholder="Nome responsável" className="p-2 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                              <input type="text" name="cargo_responsavel" placeholder="Cargo" className="p-2 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                              <input type="text" name="contato" placeholder="Contato" className="p-2 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                              <button type="submit" className="px-3 py-1 rounded text-xs font-bold" style={{ background: "var(--azul-2)", color: "white" }}>
                                Nomear
                              </button>
                            </form>
                          )}
                        </div>
                        {podeEditar && (
                          <form action={removerAction}>
                            <input type="hidden" name="id" value={o.id} />
                            <button
                              type="submit"
                              className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                              style={{ color: "#dc2626" }}
                              title="Remover órgão"
                            >
                              <Trash2 size={14} strokeWidth={2} aria-hidden />
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
