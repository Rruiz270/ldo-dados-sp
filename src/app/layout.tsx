import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { PerfilSwitcher } from "@/components/PerfilSwitcher";
import { PERFIL_DEFAULT, type PerfilId } from "@/lib/perfil";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Radar Fiscal 360 — Gestão Municipal · Instituto i10",
  description:
    "Monitoramento inteligente para decisões seguras. Plataforma do Instituto i10 para acompanhamento fiscal, orçamentário e gerencial dos 645 municípios de São Paulo.",
  openGraph: {
    title: "Radar Fiscal 360 — Gestão Municipal",
    description: "Uma plataforma do Instituto i10 · Monitoramento inteligente para decisões seguras",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await cookies();
  const perfilAtivo = (c.get("radar_perfil")?.value ?? PERFIL_DEFAULT) as PerfilId;
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Source+Serif+4:wght@400;600;700&display=swap"
        />
        <link rel="icon" href={`${basePath}/brand/radar-360-full.png`} />
        <style>{`
          :root {
            --azul: #0b2f63;
            --azul-2: #0f4f8f;
            --verde: #4eb51f;
            --verde-2: #1d8a43;
            --grafite: #1f2933;
            --cinza: #667085;
            --cinza-claro: #eef2f6;
            --sombra: 0 18px 45px rgba(11, 47, 99, 0.12);
          }
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: var(--grafite);
            background:
              radial-gradient(circle at top left, rgba(78,181,31,0.09), transparent 30%),
              radial-gradient(circle at top right, rgba(11,47,99,0.10), transparent 35%),
              #f7f9fc;
          }
        `}</style>
      </head>
      <body className="min-h-screen flex flex-col">
        <header
          className="sticky top-0 z-50"
          style={{
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(12px)",
            borderBottom: "1px solid rgba(11,47,99,0.08)",
          }}
        >
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between gap-3">
            <a href={`${basePath}/`} className="flex items-center gap-3 md:gap-4 group" style={{ color: "var(--azul)" }}>
              <img
                src={`${basePath}/brand/radar-360-full.png`}
                alt="Radar Fiscal 360 — Gestão Municipal"
                className="h-12 md:h-14 transition-transform group-hover:scale-[1.02]"
                style={{ width: "auto" }}
              />
              <span
                className="hidden md:flex items-center gap-3 pl-3 md:pl-4 border-l"
                style={{ borderColor: "rgba(11,47,99,0.15)" }}
              >
                <span
                  className="text-[10px] uppercase font-bold tracking-widest"
                  style={{ color: "var(--cinza)", letterSpacing: "0.12em" }}
                >
                  uma solução
                </span>
                <img
                  src={`${basePath}/brand/i10/i10-primary.svg`}
                  alt="Instituto i10"
                  className="h-9 md:h-10 w-auto"
                />
              </span>
            </a>
            <nav className="flex items-center gap-1 md:gap-2 text-sm font-semibold">
              <NavLink href={`${basePath}/`} label="Município" />
              <NavLink href={`${basePath}/matriz-legal`} label="Matriz" />
              <NavLink href={`${basePath}/sobre`} label="Sobre" />
              <span className="ml-2"><PerfilSwitcher perfilInicial={perfilAtivo} /></span>
            </nav>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer
          style={{
            background: "linear-gradient(135deg, #0b2f63 0%, #0f4f8f 100%)",
            color: "rgba(255,255,255,0.85)",
          }}
          className="py-10 mt-16"
        >
          <div className="max-w-7xl mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-8 text-sm">
            {/* Brand block */}
            <div>
              <div className="font-bold text-white text-lg mb-1.5" style={{ letterSpacing: "-0.02em" }}>
                Radar Fiscal Municipal 360
              </div>
              <div className="text-sm mb-4" style={{ color: "#00E5A0" }}>
                Monitoramento inteligente para decisões seguras
              </div>
              <a
                href="https://institutoi10.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mb-3 group"
                aria-label="Instituto i10 — site institucional"
              >
                <span className="text-[10px] uppercase font-bold tracking-widest" style={{ color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em" }}>
                  uma solução
                </span>
                <img
                  src={`${basePath}/brand/i10/i10-inverted.svg`}
                  alt="Instituto i10"
                  className="h-10 w-auto opacity-95 group-hover:opacity-100 transition-opacity"
                />
              </a>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.65)" }}>
                Plataforma de inteligência fiscal e gerencial do Instituto i10 —
                transformando dados técnicos em decisões públicas seguras.
              </p>
            </div>

            {/* Fontes */}
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em" }}>
                Fontes oficiais
              </div>
              <ul className="space-y-1 text-xs" style={{ color: "rgba(255,255,255,0.85)" }}>
                <li><strong>SICONFI</strong> — Tesouro Nacional</li>
                <li><strong>AUDESP</strong> — TCE-SP</li>
                <li><strong>SIOPE</strong> — FNDE/MEC</li>
                <li><strong>SIOPS</strong> — DataSUS/MS</li>
                <li><strong>INEP</strong> — IDEB e indicadores educacionais</li>
              </ul>
            </div>

            {/* Links */}
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.55)", letterSpacing: "0.12em" }}>
                Plataforma
              </div>
              <ul className="space-y-1 text-xs">
                <li><a className="hover:text-white" style={{ color: "rgba(255,255,255,0.85)" }} href={`${basePath}/matriz-legal`}>Matriz legal</a></li>
                <li><a className="hover:text-white" style={{ color: "rgba(255,255,255,0.85)" }} href={`${basePath}/sobre`}>Sobre o sistema</a></li>
                <li><a className="hover:text-white" style={{ color: "rgba(255,255,255,0.85)" }} href="https://institutoi10.com.br" target="_blank" rel="noopener noreferrer">Instituto i10</a></li>
              </ul>
              <div className="text-[10px] mt-4" style={{ color: "rgba(255,255,255,0.4)" }}>
                Atualizado diariamente às 4h
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="px-3 py-2 rounded-full hover:bg-slate-100 transition-colors"
      style={{ color: "var(--azul)" }}
    >
      {label}
    </a>
  );
}
