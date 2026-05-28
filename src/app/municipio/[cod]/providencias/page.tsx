import { sql } from "@/lib/db";
import { Section, Empty, Eyebrow } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { Plus, Calendar, User, Paperclip, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ProvidRow {
  id: number;
  alerta_id: number | null;
  risco_id: number | null;
  descricao: string;
  responsavel: string | null;
  prazo: Date | string | null;
  status: string;
  evidencia_url: string | null;
  criado_em: Date | string;
  alerta_msg: string | null;
}

const STATUS_LABEL: Record<string, { label: string; cor: string; bg: string }> = {
  pendente:     { label: "Pendente",     cor: "#d97706", bg: "rgba(217,119,6,0.13)" },
  em_andamento: { label: "Em andamento", cor: "#0f4f8f", bg: "rgba(15,79,143,0.13)" },
  concluida:    { label: "Concluída",    cor: "#1d8a43", bg: "rgba(29,138,67,0.13)" },
  justificada:  { label: "Justificada",  cor: "#667085", bg: "rgba(102,112,133,0.13)" },
  cancelada:    { label: "Cancelada",    cor: "#dc2626", bg: "rgba(220,38,38,0.13)" },
};

export default async function ProvidenciasPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let providencias: ProvidRow[] = [];
  let stats = { pendente: 0, em_andamento: 0, concluida: 0, justificada: 0, total: 0 };
  try {
    providencias = (await sql`
      SELECT p.id, p.alerta_id, p.risco_id, p.descricao, p.responsavel, p.prazo, p.status,
             p.evidencia_url, p.criado_em, a.mensagem AS alerta_msg
      FROM providencias p
      LEFT JOIN alertas a ON a.id = p.alerta_id
      WHERE p.cod_ibge = ${codNum}
      ORDER BY
        CASE p.status WHEN 'pendente' THEN 0 WHEN 'em_andamento' THEN 1 ELSE 2 END,
        p.prazo NULLS LAST,
        p.criado_em DESC
    `) as ProvidRow[];

    const s = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendente,
        COUNT(*) FILTER (WHERE status = 'em_andamento')::int AS em_andamento,
        COUNT(*) FILTER (WHERE status = 'concluida')::int AS concluida,
        COUNT(*) FILTER (WHERE status = 'justificada')::int AS justificada,
        COUNT(*)::int AS total
      FROM providencias WHERE cod_ibge = ${codNum}
    `) as typeof stats[];
    if (s[0]) stats = s[0];
  } catch (e) {
    console.error("[providencias]", e);
  }

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Módulo 9 — Alertas, providências e soluções</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
          <div>
            <h1
              className="font-bold"
              style={{ color: "var(--azul)", fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Providências
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--cinza)" }}>
              Ações concretas designadas a partir de alertas e riscos identificados. Cada providência
              registra responsável, prazo, status e evidência de cumprimento.
            </p>
          </div>
          {perfil.podeCriarProvidencia && (
            <a
              href={`${basePath}/municipio/${codNum}/providencias/novo`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold"
              style={{ background: "var(--verde-2)", color: "white" }}
            >
              <Plus size={16} strokeWidth={2.5} aria-hidden /> Nova providência
            </a>
          )}
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <StatChip label="Total" valor={stats.total} cor="var(--azul)" />
        <StatChip label="Pendentes" valor={stats.pendente} cor={STATUS_LABEL.pendente.cor} />
        <StatChip label="Em andamento" valor={stats.em_andamento} cor={STATUS_LABEL.em_andamento.cor} />
        <StatChip label="Concluídas" valor={stats.concluida} cor={STATUS_LABEL.concluida.cor} />
        <StatChip label="Justificadas" valor={stats.justificada} cor={STATUS_LABEL.justificada.cor} />
      </div>

      <Section title="Lista de providências" subtitle="Ordenadas por status (pendentes primeiro) e prazo.">
        {providencias.length === 0 ? (
          <Empty msg={perfil.podeCriarProvidencia
            ? "Nenhuma providência cadastrada. Crie a primeira a partir de um alerta ou risco."
            : "Nenhuma providência cadastrada por este município ainda."} />
        ) : (
          <ul>
            {providencias.map((p) => (
              <li key={p.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                <a
                  href={`${basePath}/municipio/${codNum}/providencias/${p.id}`}
                  className="flex items-start gap-3 hover:bg-slate-50 -mx-4 px-4 py-1 rounded transition-colors"
                >
                  <StatusBadge status={p.status} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: "var(--azul)" }}>
                      {p.descricao}
                    </div>
                    {p.alerta_msg && (
                      <div className="text-xs mt-1 italic" style={{ color: "var(--cinza)" }}>
                        a partir do alerta: {p.alerta_msg}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs mt-2" style={{ color: "var(--cinza)" }}>
                      {p.responsavel && (
                        <span className="inline-flex items-center gap-1">
                          <User size={12} aria-hidden /> {p.responsavel}
                        </span>
                      )}
                      {p.prazo && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} aria-hidden /> {fmtData(p.prazo)}
                        </span>
                      )}
                      {p.evidencia_url && (
                        <span className="inline-flex items-center gap-1" style={{ color: "var(--verde-2)" }}>
                          <Paperclip size={12} aria-hidden /> evidência anexada
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={14} className="mt-1 flex-shrink-0" style={{ color: "var(--cinza)" }} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function StatChip({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div
      className="p-3 rounded-xl text-center"
      style={{ background: "white", border: "1px solid rgba(11,47,99,0.09)" }}
    >
      <div className="text-2xl font-bold" style={{ color: cor, letterSpacing: "-0.03em" }}>
        {valor}
      </div>
      <div className="text-[11px] uppercase font-semibold tracking-wider" style={{ color: "var(--cinza)" }}>
        {label}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_LABEL[status] ?? STATUS_LABEL.pendente;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.cor, letterSpacing: "0.05em" }}
    >
      {cfg.label}
    </span>
  );
}

function fmtData(d: Date | string): string {
  if (d instanceof Date) return d.toLocaleDateString("pt-BR");
  return String(d).slice(0, 10).split("-").reverse().join("/");
}
