import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder, fmtBRL, fmtDate } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { criarPrecatorio, removerPrecatorio } from "../actions";
import { Gavel, Trash2, ArrowLeft, Plus } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface PrecatorioRow {
  exercicio: number;
  valor_total: string;
  qtd_processos: number | null;
  classificacao: string;
  observacoes: string | null;
  atualizado_em: Date | string;
}

export default async function PrecatoriosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();
  const podeEditar = perfil.podeImportarDados;
  const anoAtual = new Date().getFullYear();

  let precatorios: PrecatorioRow[] = [];
  let totalGeral = 0;
  try {
    precatorios = (await sql`
      SELECT exercicio, valor_total, qtd_processos, classificacao, observacoes, atualizado_em
      FROM precatorios WHERE cod_ibge = ${codNum}
      ORDER BY exercicio DESC, classificacao
    `) as PrecatorioRow[];
    totalGeral = precatorios.reduce((s, p) => s + Number(p.valor_total || 0), 0);
  } catch (e) {
    console.error("[precatorios]", e);
  }

  async function criarAction(formData: FormData) {
    "use server";
    await criarPrecatorio({
      codIbge: codNum,
      exercicio: parseInt(String(formData.get("exercicio") || "0"), 10),
      valorTotal: parseFloat(String(formData.get("valor_total") || "0")),
      qtdProcessos: parseInt(String(formData.get("qtd_processos") || "0"), 10) || undefined,
      classificacao: String(formData.get("classificacao") || ""),
      observacoes: String(formData.get("observacoes") || ""),
    });
  }

  async function removerAction(formData: FormData) {
    "use server";
    await removerPrecatorio(
      codNum,
      parseInt(String(formData.get("exercicio") || "0"), 10),
      String(formData.get("classificacao") || ""),
    );
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
        <Eyebrow>Importação manual · Módulo 7 (Dívida e caixa)</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
        >
          Precatórios
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Passivos judiciais transitados em julgado (CF Art. 100). Distinguir entre alimentares (folha,
          previdenciários, indenizações) e comuns (demais). Total geral: <strong>{fmtBRL(totalGeral)}</strong>.
        </p>
      </header>

      {podeEditar ? (
        <Section title="Adicionar precatório (consolidado por ano/classificação)">
          <form action={criarAction} className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[120px_180px_1fr_180px] gap-3">
              <Field label="Exercício *">
                <input type="number" name="exercicio" defaultValue={anoAtual} min="2020" max="2099" required className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Classificação *">
                <select name="classificacao" required defaultValue="alimentar" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }}>
                  <option value="alimentar">Alimentar</option>
                  <option value="comum">Comum</option>
                </select>
              </Field>
              <Field label="Valor total (R$) *">
                <input type="number" name="valor_total" step="0.01" min="0" required placeholder="Ex.: 1500000.00" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
              <Field label="Qtd. processos">
                <input type="number" name="qtd_processos" min="0" placeholder="Ex.: 23" className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
              </Field>
            </div>
            <Field label="Observações">
              <textarea name="observacoes" rows={2} placeholder="Origem, fonte legal, etc." className="w-full p-2.5 rounded-lg text-sm" style={{ border: "1px solid rgba(11,47,99,0.15)" }} />
            </Field>
            <button type="submit" className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold" style={{ background: "var(--verde-2)", color: "white" }}>
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Adicionar precatório
            </button>
          </form>
        </Section>
      ) : (
        <Placeholder titulo="Sem permissão" descricao={`Perfil "${perfil.nome}" não pode importar dados. Mude para Secretário.`} />
      )}

      <Section title={`Precatórios cadastrados (${precatorios.length})`}>
        {precatorios.length === 0 ? (
          <Empty msg="Nenhum precatório cadastrado ainda." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {precatorios.map((p) => (
              <li key={`${p.exercicio}-${p.classificacao}`} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <Gavel size={14} strokeWidth={1.75} style={{ color: "var(--azul-2)" }} aria-hidden />
                      <span className="font-bold text-sm capitalize" style={{ color: "var(--azul)" }}>{p.classificacao}</span>
                      <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "var(--cinza)" }}>· {p.exercicio}</span>
                    </div>
                    <div className="text-lg font-bold mt-1" style={{ color: "var(--azul)" }}>{fmtBRL(p.valor_total)}</div>
                    {p.qtd_processos && (
                      <div className="text-xs" style={{ color: "var(--cinza)" }}>{p.qtd_processos} processos · atualizado em {fmtDate(p.atualizado_em)}</div>
                    )}
                    {p.observacoes && <div className="text-xs mt-1 italic" style={{ color: "var(--grafite)" }}>{p.observacoes}</div>}
                  </div>
                  {podeEditar && (
                    <form action={removerAction}>
                      <input type="hidden" name="exercicio" value={p.exercicio} />
                      <input type="hidden" name="classificacao" value={p.classificacao} />
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
