import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty } from "@/components/ModuloUI";
import { Users, ArrowLeft, Mail, Phone, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface RespRow {
  orgao_id: number;
  orgao_nome: string;
  orgao_tipo: string;
  responsavel: string;
  cargo_responsavel: string | null;
  contato: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  executivo: "Executivo",
  legislativo: "Legislativo (Câmara)",
  autarquia: "Autarquia",
  fundacao: "Fundação",
  fundo: "Fundo",
  consorcio: "Consórcio público",
};

export default async function ResponsaveisPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  let resp: RespRow[] = [];
  try {
    resp = (await sql`
      SELECT id AS orgao_id, nome AS orgao_nome, tipo AS orgao_tipo, responsavel, cargo_responsavel, contato
      FROM orgaos
      WHERE cod_ibge = ${codNum} AND ativo = TRUE AND responsavel IS NOT NULL
      ORDER BY tipo, nome
    `) as RespRow[];
  } catch (e) {
    console.error("[responsaveis]", e);
  }

  // Agrupa por tipo de órgão
  const porTipo = resp.reduce((acc, r) => {
    acc[r.orgao_tipo] ??= [];
    acc[r.orgao_tipo].push(r);
    return acc;
  }, {} as Record<string, RespRow[]>);

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
          Responsáveis técnicos
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Visão consolidada dos responsáveis nomeados nos órgãos do município. Cadastros e
          atualizações são feitos pelo módulo de Órgãos.
        </p>
      </header>

      {resp.length === 0 ? (
        <Section title="Nenhum responsável nomeado" subtitle="Comece pelo cadastro dos órgãos para indicar responsáveis técnicos.">
          <div className="p-6 flex flex-col items-center text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-3" style={{ background: "rgba(11,47,99,0.08)", color: "var(--azul-2)" }}>
              <Users size={24} strokeWidth={1.75} aria-hidden />
            </div>
            <p className="text-sm mb-4 max-w-md" style={{ color: "var(--cinza)" }}>
              Cada órgão cadastrado pode ter um responsável técnico nomeado (prefeito, secretário, controlador, etc.).
              Vá em Órgãos e use o botão Nomear para registrar.
            </p>
            <a
              href={`${basePath}/municipio/${codNum}/cadastro/orgaos`}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold"
              style={{ background: "var(--verde-2)", color: "white" }}
            >
              Ir para Órgãos <ArrowRight size={14} aria-hidden />
            </a>
          </div>
        </Section>
      ) : (
        <Section title={`Responsáveis nomeados (${resp.length})`} subtitle="Visão consolidada por tipo de órgão.">
          <div className="divide-y divide-slate-100">
            {Object.entries(porTipo).map(([tipo, lista]) => (
              <div key={tipo} className="p-4">
                <h3 className="text-[11px] uppercase font-bold tracking-widest mb-3" style={{ color: "var(--cinza)", letterSpacing: "0.1em" }}>
                  {TIPO_LABEL[tipo] ?? tipo} <span>· {lista.length}</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {lista.map((r) => (
                    <div
                      key={r.orgao_id}
                      className="p-3 rounded-xl"
                      style={{ background: "white", border: "1px solid rgba(11,47,99,0.08)" }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-xs font-bold flex-shrink-0"
                          style={{ background: "rgba(78,181,31,0.13)", color: "var(--verde-2)" }}
                        >
                          {iniciais(r.responsavel)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-bold" style={{ color: "var(--azul)" }}>{r.responsavel}</div>
                          {r.cargo_responsavel && (
                            <div className="text-xs mb-1" style={{ color: "var(--cinza)" }}>{r.cargo_responsavel}</div>
                          )}
                          <div className="text-[11px] mt-1" style={{ color: "var(--grafite)" }}>{r.orgao_nome}</div>
                          {r.contato && (
                            <div className="text-[11px] mt-1.5 inline-flex items-center gap-1" style={{ color: "var(--azul-2)" }}>
                              {r.contato.includes("@") ? <Mail size={11} aria-hidden /> : <Phone size={11} aria-hidden />}
                              {r.contato}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
