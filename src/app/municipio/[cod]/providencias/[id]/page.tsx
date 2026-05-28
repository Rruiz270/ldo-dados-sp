import { sql } from "@/lib/db";
import { Section, Eyebrow, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { notFound } from "next/navigation";
import { atualizarProvidencia, type ProvidenciaStatus } from "../actions";
import { urlSeguraParaHref } from "@/lib/url-safe";
import { Calendar, User, Paperclip, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string; id: string }>; }

interface ProvidDetail {
  id: number;
  alerta_id: number | null;
  risco_id: number | null;
  cod_ibge: number;
  descricao: string;
  responsavel: string | null;
  prazo: Date | string | null;
  status: string;
  evidencia_url: string | null;
  criado_em: Date | string;
  atualizado_em: Date | string;
  alerta_msg: string | null;
  alerta_base_legal: string | null;
  alerta_categoria: string | null;
  alerta_nivel: string | null;
  risco_titulo: string | null;
}

const STATUS_OPTIONS: Array<{ value: ProvidenciaStatus; label: string; cor: string }> = [
  { value: "pendente",     label: "Pendente",     cor: "#d97706" },
  { value: "em_andamento", label: "Em andamento", cor: "#0f4f8f" },
  { value: "concluida",    label: "Concluída",    cor: "#1d8a43" },
  { value: "justificada",  label: "Justificada",  cor: "#667085" },
  { value: "cancelada",    label: "Cancelada",    cor: "#dc2626" },
];

export default async function ProvidenciaDetalhe({ params }: PageProps) {
  const { cod, id } = await params;
  const codNum = parseInt(cod, 10);
  const idNum = parseInt(id, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  if (Number.isNaN(idNum)) notFound();

  let p: ProvidDetail | null = null;
  try {
    const rows = (await sql`
      SELECT p.*,
             a.mensagem      AS alerta_msg,
             a.base_legal    AS alerta_base_legal,
             a.categoria     AS alerta_categoria,
             a.nivel         AS alerta_nivel,
             r.titulo        AS risco_titulo
      FROM providencias p
      LEFT JOIN alertas a ON a.id = p.alerta_id
      LEFT JOIN riscos r  ON r.id = p.risco_id
      WHERE p.id = ${idNum} AND p.cod_ibge = ${codNum}
    `) as ProvidDetail[];
    p = rows[0] ?? null;
  } catch (e) {
    console.error("[providencia detalhe]", e);
  }

  if (!p) notFound();

  async function updateStatus(formData: FormData) {
    "use server";
    const status = String(formData.get("status") || "") as ProvidenciaStatus;
    await atualizarProvidencia({ id: idNum, codIbge: codNum, status });
  }

  async function updateCampos(formData: FormData) {
    "use server";
    await atualizarProvidencia({
      id: idNum,
      codIbge: codNum,
      responsavel: String(formData.get("responsavel") || ""),
      prazo: String(formData.get("prazo") || ""),
      evidenciaUrl: String(formData.get("evidencia_url") || ""),
    });
  }

  const podeEditar = perfil.podeCriarProvidencia;

  return (
    <div className="space-y-6">
      <a
        href={`${basePath}/municipio/${codNum}/providencias`}
        className="inline-flex items-center gap-1 text-xs font-bold hover:underline"
        style={{ color: "var(--azul-2)" }}
      >
        <ArrowLeft size={14} aria-hidden /> Voltar à lista
      </a>

      <header>
        <Eyebrow>Providência #{p.id}</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(22px, 3vw, 32px)", letterSpacing: "-0.03em", lineHeight: 1.15 }}
        >
          {p.descricao}
        </h1>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <StatusChip status={p.status} />
          {p.responsavel && (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--cinza)" }}>
              <User size={13} aria-hidden /> {p.responsavel}
            </span>
          )}
          {p.prazo && (
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--cinza)" }}>
              <Calendar size={13} aria-hidden /> Prazo: {fmtData(p.prazo)}
            </span>
          )}
        </div>
      </header>

      {/* Alerta/Risco de origem */}
      {p.alerta_msg && (
        <Section title="Alerta de origem">
          <div className="p-4">
            <div className="font-semibold text-sm" style={{ color: "var(--azul)" }}>
              {p.alerta_msg}
            </div>
            <div className="text-xs mt-1 flex flex-wrap gap-2" style={{ color: "var(--cinza)" }}>
              {p.alerta_nivel && <span className="capitalize font-bold">{p.alerta_nivel}</span>}
              {p.alerta_categoria && <span>· {p.alerta_categoria}</span>}
              {p.alerta_base_legal && <span>· {p.alerta_base_legal}</span>}
            </div>
          </div>
        </Section>
      )}

      {p.risco_titulo && (
        <Section title="Risco de origem">
          <div className="p-4 font-semibold text-sm" style={{ color: "var(--azul)" }}>
            {p.risco_titulo}
          </div>
        </Section>
      )}

      {/* Mudar status */}
      <Section
        title="Atualizar status"
        subtitle={podeEditar
          ? "Selecione o novo status. Concluir/justificar fecha automaticamente o alerta vinculado."
          : `Apenas perfis com permissão de gestão podem alterar o status (atual: ${perfil.nome}).`}
      >
        <div className="p-4">
          {!podeEditar ? (
            <Placeholder
              titulo="Sem permissão"
              descricao={`Mude para Prefeito, Secretário ou Controle Interno no switcher do topo para editar.`}
            />
          ) : (
            <form action={updateStatus} className="flex flex-wrap items-center gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  name="status"
                  value={opt.value}
                  type="submit"
                  className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${p?.status === opt.value ? "ring-2" : "opacity-80 hover:opacity-100"}`}
                  style={{
                    background: p?.status === opt.value ? opt.cor : "white",
                    color: p?.status === opt.value ? "white" : opt.cor,
                    border: `1px solid ${opt.cor}`,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </form>
          )}
        </div>
      </Section>

      {/* Detalhes editáveis */}
      <Section title="Detalhes" subtitle="Responsável, prazo e evidência.">
        {!podeEditar ? (
          <div className="p-4 space-y-3 text-sm" style={{ color: "var(--grafite)" }}>
            <div><strong>Responsável:</strong> {p.responsavel ?? "—"}</div>
            <div><strong>Prazo:</strong> {p.prazo ? fmtData(p.prazo) : "—"}</div>
            <div>
              <strong>Evidência:</strong>{" "}
              {urlSeguraParaHref(p.evidencia_url) ? (
                <a href={urlSeguraParaHref(p.evidencia_url)!} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--azul-2)" }}>
                  abrir documento
                </a>
              ) : "—"}
            </div>
          </div>
        ) : (
          <form action={updateCampos} className="p-4 space-y-4">
            <Field label="Responsável">
              <input
                type="text"
                name="responsavel"
                defaultValue={p.responsavel ?? ""}
                className="w-full p-2.5 rounded-lg text-sm"
                style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
              />
            </Field>
            <Field label="Prazo">
              <input
                type="date"
                name="prazo"
                defaultValue={p.prazo ? toDateInput(p.prazo) : ""}
                className="w-full p-2.5 rounded-lg text-sm"
                style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
              />
            </Field>
            <Field label="URL de evidência">
              <input
                type="url"
                name="evidencia_url"
                defaultValue={p.evidencia_url ?? ""}
                placeholder="https://"
                className="w-full p-2.5 rounded-lg text-sm"
                style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
              />
            </Field>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold"
              style={{ background: "var(--azul-2)", color: "white" }}
            >
              Salvar detalhes
            </button>
          </form>
        )}
      </Section>

      {/* Evidência atual */}
      {urlSeguraParaHref(p.evidencia_url) && (
        <Section title="Evidência registrada">
          <div className="p-4">
            <a
              href={urlSeguraParaHref(p.evidencia_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold break-all"
              style={{ color: "var(--azul-2)" }}
            >
              <Paperclip size={14} aria-hidden /> {p.evidencia_url}
            </a>
          </div>
        </Section>
      )}

      <div className="text-xs" style={{ color: "var(--cinza)" }}>
        Criada em {fmtData(p.criado_em)} · Atualizada em {fmtData(p.atualizado_em)}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status);
  return (
    <span
      className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase"
      style={{
        background: `${opt?.cor ?? "#667085"}1f`,
        color: opt?.cor ?? "#667085",
        letterSpacing: "0.05em",
      }}
    >
      {opt?.label ?? status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold block mb-1.5" style={{ color: "var(--azul)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function fmtData(d: Date | string): string {
  if (d instanceof Date) return d.toLocaleDateString("pt-BR");
  return String(d).slice(0, 10).split("-").reverse().join("/");
}

function toDateInput(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
