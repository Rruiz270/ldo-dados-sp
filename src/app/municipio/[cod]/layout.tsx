import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ cod: string }>;
}

const MODULOS = [
  { slug: "",            label: "Painel preventivo",  emoji: "🟢" },
  { slug: "planejamento",label: "Planejamento e LDO", emoji: "📋" },
  { slug: "educacao",    label: "Educação e Fundeb",   emoji: "🎓" },
  { slug: "saude",       label: "Saúde",                emoji: "🏥" },
  { slug: "lrf",         label: "Limites da LRF",       emoji: "⚖️" },
  { slug: "divida",      label: "Dívida e caixa",       emoji: "💰" },
  { slug: "contexto",    label: "Contexto externo",     emoji: "📊" },
  { slug: "riscos",      label: "Riscos fiscais",       emoji: "⚠️" },
  { slug: "alertas",     label: "Alertas e providências",emoji: "🔔" },
];

export default async function MunicipioLayout({ children, params }: LayoutProps) {
  const { cod } = await params;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  // Apenas o nome — o conteúdo principal de cada page faz suas próprias queries
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
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
      {/* Header do município */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end md:justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-500 font-medium">
            <Link href={`${basePath}/`} className="hover:text-cyan-700">Município</Link>
            <span className="mx-2">/</span>
            <span>{cod}</span>
          </div>
          <h1
            className="text-3xl md:text-4xl font-bold mt-1"
            style={{ color: "#0A2463", fontFamily: "var(--font-display)" }}
          >
            {nome || `Município ${cod}`}
          </h1>
          {populacao && (
            <div className="text-sm text-slate-600 mt-1">
              População: {populacao.toLocaleString("pt-BR")} hab.
            </div>
          )}
        </div>
      </div>

      {/* Layout: nav lateral à esquerda, conteúdo à direita */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <aside className="md:border-r md:border-slate-200 md:pr-4">
          <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {MODULOS.map((m) => {
              const href = m.slug
                ? `${basePath}/municipio/${cod}/${m.slug}`
                : `${basePath}/municipio/${cod}`;
              return (
                <Link
                  key={m.slug || "root"}
                  href={href}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-cyan-50 hover:text-cyan-900 whitespace-nowrap"
                >
                  <span aria-hidden>{m.emoji}</span>
                  <span>{m.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
        <section>{children}</section>
      </div>
    </div>
  );
}
