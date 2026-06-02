import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder, StatusMetaBadge, NotificacaoBadge, notificacaoDevida, fmtNum } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarAcao, upsertMetaFisica, marcarStatusMeta } from "../actions";
import { Target, ArrowLeft, Plus, ListPlus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ProgramaRow { id: number; codigo: string; nome: string; area: string | null; }
interface AcaoRow { id: number; programa_id: number; codigo: string; nome: string; unidade_medida: string | null; }
interface MetaRow {
  acao_id: number;
  exercicio: number;
  meta_quantidade: string | null;
  realizado_quantidade: string | null;
  pct_execucao: string | null;
  status_acompanhamento: string | null;
  bimestre_referencia: number | null;
}

const STATUS_OPCOES = ["pendente", "preenchido", "notificado", "escalonado"] as const;

export default async function MetasFisicasPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();
  const podeEditar = perfil.podeEditarCadastro;
  const anoAtual = new Date().getFullYear();

  let programas: ProgramaRow[] = [];
  let acoes: AcaoRow[] = [];
  let metas: MetaRow[] = [];
  try {
    programas = (await sql`
      SELECT id, codigo, nome, area FROM programas
      WHERE cod_ibge = ${codNum} ORDER BY area NULLS LAST, codigo
    `) as ProgramaRow[];
    acoes = (await sql`
      SELECT a.id, a.programa_id, a.codigo, a.nome, a.unidade_medida
      FROM acoes a JOIN programas p ON p.id = a.programa_id
      WHERE p.cod_ibge = ${codNum} ORDER BY a.codigo
    `) as AcaoRow[];
    metas = (await sql`
      SELECT mf.acao_id, mf.exercicio, mf.meta_quantidade, mf.realizado_quantidade,
             mf.pct_execucao, mf.status_acompanhamento, mf.bimestre_referencia
      FROM metas_fisicas mf
      JOIN acoes a ON a.id = mf.acao_id
      JOIN programas p ON p.id = a.programa_id
      WHERE p.cod_ibge = ${codNum}
      ORDER BY mf.exercicio DESC
    `) as MetaRow[];
  } catch (e) {
    console.error("[metas-fisicas]", e);
  }

  const metasPorAcao = new Map<number, MetaRow[]>();
  for (const m of metas) {
    if (!metasPorAcao.has(m.acao_id)) metasPorAcao.set(m.acao_id, []);
    metasPorAcao.get(m.acao_id)!.push(m);
  }
  const acoesPorPrograma = new Map<number, AcaoRow[]>();
  for (const a of acoes) {
    if (!acoesPorPrograma.has(a.programa_id)) acoesPorPrograma.set(a.programa_id, []);
    acoesPorPrograma.get(a.programa_id)!.push(a);
  }

  async function criarAcaoAction(formData: FormData) {
    "use server";
    await criarAcao({
      codIbge: codNum,
      programaId: parseInt(String(formData.get("programa_id") || "0"), 10),
      codigo: String(formData.get("codigo") || ""),
      nome: String(formData.get("nome") || ""),
      produto: String(formData.get("produto") || ""),
      unidadeMedida: String(formData.get("unidade_medida") || ""),
    });
  }

  async function salvarMetaAction(formData: FormData) {
    "use server";
    const meta = String(formData.get("meta_quantidade") || "").trim();
    const real = String(formData.get("realizado_quantidade") || "").trim();
    const bim = String(formData.get("bimestre_referencia") || "").trim();
    await upsertMetaFisica({
      codIbge: codNum,
      acaoId: parseInt(String(formData.get("acao_id") || "0"), 10),
      exercicio: parseInt(String(formData.get("exercicio") || "0"), 10),
      metaQuantidade: meta ? parseFloat(meta) : undefined,
      realizadoQuantidade: real ? parseFloat(real) : undefined,
      bimestreReferencia: bim ? parseInt(bim, 10) : undefined,
      responsavelArea: String(formData.get("responsavel_area") || ""),
      observacoes: String(formData.get("observacoes") || ""),
    });
  }

  async function statusAction(formData: FormData) {
    "use server";
    await marcarStatusMeta({
      codIbge: codNum,
      acaoId: parseInt(String(formData.get("acao_id") || "0"), 10),
      exercicio: parseInt(String(formData.get("exercicio") || "0"), 10),
      status: String(formData.get("status") || ""),
    });
  }

  return (
    <div className="space-y-6">
      <a href={`${basePath}/municipio/${codNum}/cadastro`} className="inline-flex items-center gap-1 text-xs font-bold hover:underline" style={{ color: "var(--azul-2)" }}>
        <ArrowLeft size={14} aria-hidden /> Voltar ao cadastro
      </a>

      <header>
        <Eyebrow>Módulo 1 · Acompanhamento de metas físicas</Eyebrow>
        <h1 className="font-bold mt-3" style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}>
          Metas físicas das ações
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Preencha meta e realizado por ação e exercício. O percentual de execução é calculado automaticamente.
          O status de acompanhamento (pendente → preenchido → notificado → escalonado) é apenas uma mudança de
          estado visual — nenhuma notificação é enviada por e-mail/WhatsApp.
        </p>
      </header>

      {!podeEditar && (
        <Placeholder titulo="Somente leitura" descricao={`Perfil "${perfil.nome}" pode ver, mas não preencher. Mude para Prefeito ou Secretário.`} />
      )}

      {programas.length === 0 ? (
        <Section title="Sem programas">
          <Empty msg="Cadastre programas e ações antes de preencher metas físicas." />
        </Section>
      ) : (
        <>
          {podeEditar && (
            <Section title="Adicionar ação a um programa" subtitle="As metas físicas são preenchidas por ação. Crie a ação aqui se ela ainda não existir.">
              <form action={criarAcaoAction} className="p-5 space-y-4">
                <Field label="Programa *">
                  <select name="programa_id" required defaultValue="" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                    <option value="">(selecione)</option>
                    {programas.map((p) => (
                      <option key={p.id} value={p.id}>{p.codigo} — {p.nome}{p.area ? ` (${p.area})` : ""}</option>
                    ))}
                  </select>
                </Field>
                <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
                  <Field label="Código *">
                    <input type="text" name="codigo" placeholder="2001" required className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                  </Field>
                  <Field label="Nome da ação *">
                    <input type="text" name="nome" placeholder="Ex.: Construção de creches" required className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                  </Field>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Produto">
                    <input type="text" name="produto" placeholder="Ex.: Creche entregue" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                  </Field>
                  <Field label="Unidade de medida">
                    <input type="text" name="unidade_medida" placeholder="Ex.: unidade" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                  </Field>
                </div>
                <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold" style={{ background: "var(--azul-2)", color: "white" }}>
                  <ListPlus size={16} strokeWidth={2.5} aria-hidden /> Adicionar ação
                </button>
              </form>
            </Section>
          )}

          <Section title={`Ações e metas físicas (${acoes.length} ação/ações)`}>
            {acoes.length === 0 ? (
              <Empty msg="Nenhuma ação cadastrada. Adicione uma ação acima." />
            ) : (
              <div className="p-5 space-y-5">
                {programas.map((prog) => {
                  const acoesP = acoesPorPrograma.get(prog.id) ?? [];
                  if (acoesP.length === 0) return null;
                  return (
                    <div key={prog.id} className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(11,47,99,0.09)" }}>
                      <div className="px-4 py-2.5" style={{ background: "rgba(11,47,99,0.04)" }}>
                        <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>{prog.codigo} — {prog.nome}</span>
                        {prog.area && <span className="ml-2 text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>{prog.area}</span>}
                      </div>
                      <ul className="divide-y divide-slate-100">
                        {acoesP.map((a) => {
                          const ms = metasPorAcao.get(a.id) ?? [];
                          return (
                            <li key={a.id} className="px-4 py-3 space-y-3">
                              <div className="flex items-center gap-2">
                                <Target size={15} strokeWidth={1.75} style={{ color: "var(--azul-2)" }} aria-hidden />
                                <span className="font-semibold text-sm" style={{ color: "var(--grafite)" }}>{a.codigo} — {a.nome}</span>
                                {a.unidade_medida && <span className="text-xs" style={{ color: "var(--cinza)" }}>({a.unidade_medida})</span>}
                              </div>

                              {ms.length > 0 && (
                                <ul className="space-y-1.5 pl-7">
                                  {ms.map((m) => {
                                    const pct = m.pct_execucao != null ? Number(m.pct_execucao) : null;
                                    const notif = notificacaoDevida(m.status_acompanhamento, m.exercicio, m.bimestre_referencia);
                                    return (
                                      <li key={m.exercicio} className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="font-bold" style={{ color: "var(--cinza)" }}>{m.exercicio}{m.bimestre_referencia ? ` · B${m.bimestre_referencia}` : ""}</span>
                                        <span style={{ color: "var(--grafite)" }}>meta {fmtNum(m.meta_quantidade)} · real {fmtNum(m.realizado_quantidade)}</span>
                                        <span className="font-bold" style={{ color: pct != null && pct >= 90 ? "var(--verde-2)" : pct != null && pct >= 50 ? "#d97706" : "#dc2626" }}>
                                          {pct != null ? `${pct.toFixed(1)}%` : "—"}
                                        </span>
                                        <StatusMetaBadge status={m.status_acompanhamento} />
                                        <NotificacaoBadge tipo={notif} />
                                        {podeEditar && (
                                          <form action={statusAction} className="inline-flex items-center gap-1">
                                            <input type="hidden" name="acao_id" value={a.id} />
                                            <input type="hidden" name="exercicio" value={m.exercicio} />
                                            <select name="status" defaultValue={m.status_acompanhamento ?? "pendente"} className="p-1 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                                              {STATUS_OPCOES.map((s) => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                            <button type="submit" className="px-2 py-1 rounded text-xs font-bold" style={{ background: "rgba(11,47,99,0.08)", color: "var(--azul)" }}>Aplicar</button>
                                          </form>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}

                              {podeEditar && (
                                <form action={salvarMetaAction} className="pl-7 grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                                  <input type="hidden" name="acao_id" value={a.id} />
                                  <MiniField label="Exercício">
                                    <input type="number" name="exercicio" defaultValue={anoAtual} min="2000" max="2099" required className="w-full p-1.5 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                                  </MiniField>
                                  <MiniField label="Bimestre">
                                    <input type="number" name="bimestre_referencia" min="1" max="6" placeholder="1-6" className="w-full p-1.5 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                                  </MiniField>
                                  <MiniField label="Meta">
                                    <input type="number" name="meta_quantidade" step="any" className="w-full p-1.5 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                                  </MiniField>
                                  <MiniField label="Realizado">
                                    <input type="number" name="realizado_quantidade" step="any" className="w-full p-1.5 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                                  </MiniField>
                                  <MiniField label="Responsável">
                                    <input type="text" name="responsavel_area" placeholder="Secretaria" className="w-full p-1.5 rounded text-xs" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
                                  </MiniField>
                                  <button type="submit" className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: "var(--verde-2)", color: "white" }}>
                                    <Plus size={13} strokeWidth={2.5} aria-hidden /> Salvar
                                  </button>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold block mb-1.5 uppercase tracking-wider" style={{ color: "var(--azul)", letterSpacing: "0.05em" }}>{label}</span>
      {children}
    </label>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold block mb-1 uppercase tracking-wider" style={{ color: "var(--cinza)" }}>{label}</span>
      {children}
    </label>
  );
}
