import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ cod: string }>;
}

const MODULOS = [
  { slug: "",             label: "Painel preventivo",      emoji: "🟢" },
  { slug: "planejamento", label: "Planejamento e LDO",     emoji: "📋" },
  { slug: "lrf",          label: "Limites da LRF",          emoji: "⚖️" },
  { slug: "educacao",     label: "Educação e Fundeb",       emoji: "🎓" },
  { slug: "saude",        label: "Saúde",                   emoji: "🏥" },
  { slug: "divida",       label: "Dívida e caixa",          emoji: "💰" },
  { slug: "contexto",     label: "Contexto externo",        emoji: "📊" },
  { slug: "riscos",       label: "Riscos fiscais",          emoji: "⚠️" },
  { slug: "alertas",      label: "Alertas e providências",  emoji: "🔔" },
];

export default async function MunicipioLayout({ children, params }: LayoutProps) {
  const { cod } = await params;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  let nome = "";
  let populacao: number | null = null;
  try {
    const rows = (await sql`
      SELECT nome, populacao FROM municipios WHERE cod_ibge = ${parseInt(cod, 10)} LIMIT 1
    `) as Array<{ nome: string; populacao: number | null }>;
    if (rows[0]) {
      nome = rows[0].nome;
      populacao = rows[0].populacao;
    }
  } catch {}

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
      {/* Header do município */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="text-xs uppercase font-semibold tracking-widest" style={{ color: "var(--cinza)" }}>
          <Link href={`${basePath}/`} className="hover:underline" style={{ color: "var(--azul)" }}>
            Município
          </Link>
          <span className="mx-2">/</span>
          <span>{cod}</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <h1
            className="font-bold"
            style={{
              color: "var(--azul)",
              fontSize: "clamp(28px, 4vw, 44px)",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            {nome || `Município ${cod}`}
          </h1>
          {populacao && (
            <span
              className="px-3 py-1.5 rounded-full text-xs font-bold inline-block w-fit"
              style={{
                background: "rgba(78,181,31,0.13)",
                color: "var(--verde-2)",
                letterSpacing: "0.06em",
              }}
            >
              {populacao.toLocaleString("pt-BR")} habitantes
            </span>
          )}
        </div>
      </div>

      {/* Layout: nav lateral à esquerda, conteúdo à direita */}
      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5 md:gap-7">
        <aside
          className="md:sticky md:top-20 md:self-start md:max-h-[calc(100vh-100px)] md:overflow-auto rounded-[22px] p-3 md:p-4"
          style={{
            background: "rgba(255,255,255,0.86)",
            border: "1px solid rgba(11,47,99,0.08)",
            boxShadow: "0 18px 45px rgba(11,47,99,0.12)",
          }}
        >
          <h3
            className="font-bold uppercase text-xs tracking-widest mb-3 px-2"
            style={{ color: "var(--azul)", letterSpacing: "0.08em" }}
          >
            Módulos
          </h3>
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {MODULOS.map((m) => {
              const href = m.slug
                ? `${basePath}/municipio/${cod}/${m.slug}`
                : `${basePath}/municipio/${cod}`;
              return (
                <Link
                  key={m.slug || "root"}
                  href={href}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap hover:bg-slate-100 transition-colors"
                  style={{ color: "var(--grafite)" }}
                >
                  <span className="text-base" aria-hidden>{m.emoji}</span>
                  <span>{m.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
