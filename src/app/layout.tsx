import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { PerfilSwitcher } from "@/components/PerfilSwitcher";
import { AppBackground } from "@/components/AppBackground";
import { LiveClock } from "@/components/LiveClock";
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap"
        />
        <link rel="icon" href={`${basePath}/brand/radar-360-full.png`} />
      </head>
      <body className="min-h-screen flex flex-col">
        {/* fundo command-center: estrelas + aurora */}
        <AppBackground />

        {/* ===== topbar dark glass ===== */}
        <header
          className="sticky top-0 z-50 glass-strong"
          style={{ borderBottom: "1px solid var(--linha)" }}
        >
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 py-2.5 flex items-center gap-3 md:gap-5">
            <a href={`${basePath}/`} className="flex items-center gap-3 group" style={{ color: "var(--txt)" }}>
              <img
                src={`${basePath}/brand/radar-360-full.png`}
                alt="Radar Fiscal 360 — Gestão Municipal"
                className="h-10 md:h-11 transition-transform group-hover:scale-[1.02]"
                style={{ width: "auto", filter: "brightness(0) invert(1)", opacity: 0.96 }}
              />
            </a>

            <span
              className="hidden lg:flex items-center gap-2 text-[11px] font-bold tracking-widest px-3 py-1.5 rounded-full"
              style={{
                color: "var(--verde)",
                border: "1px solid rgba(52,211,153,0.35)",
                background: "rgba(52,211,153,0.08)",
                letterSpacing: "0.12em",
              }}
            >
              <span className="live-dot" />
              AO VIVO
            </span>

            <span className="hidden md:block text-xs ml-1" style={{ color: "var(--txt2)" }}>
              <LiveClock />
            </span>

            <nav className="flex items-center gap-1 md:gap-1.5 text-sm font-semibold ml-auto">
              <NavLink href={`${basePath}/`} label="Município" />
              <NavLink href={`${basePath}/biblioteca-legal`} label="Biblioteca Legal" />
              <NavLink href={`${basePath}/calendario-obrigacoes`} label="Calendário" />
              <NavLink href={`${basePath}/matriz-legal`} label="Matriz" />
              <NavLink href={`${basePath}/sobre`} label="Sobre" />
              <span className="ml-1.5">
                <PerfilSwitcher perfilInicial={perfilAtivo} />
              </span>
            </nav>
          </div>
        </header>

        <main className="flex-1 relative z-[1]">{children}</main>

        {/* ===== footer dark ===== */}
        <footer
          className="relative z-[1] py-10 mt-16 glass-strong"
          style={{ borderTop: "1px solid var(--linha)" }}
        >
          <div className="max-w-[1280px] mx-auto px-4 md:px-6 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-8 text-sm">
            {/* Brand block */}
            <div>
              <div className="font-extrabold text-lg mb-1.5" style={{ color: "var(--txt)", letterSpacing: "-0.02em" }}>
                Radar Fiscal Municipal 360
              </div>
              <div className="text-sm mb-4" style={{ color: "var(--verde)" }}>
                Monitoramento inteligente para decisões seguras
              </div>
              <a
                href="https://institutoi10.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mb-3 group"
                aria-label="Instituto i10 — site institucional"
              >
                <span
                  className="text-[10px] uppercase font-bold tracking-widest"
                  style={{ color: "var(--txt3)", letterSpacing: "0.12em" }}
                >
                  uma solução
                </span>
                <img
                  src={`${basePath}/brand/i10/i10-inverted.svg`}
                  alt="Instituto i10"
                  className="h-10 w-auto opacity-90 group-hover:opacity-100 transition-opacity"
                />
              </a>
              <p className="text-xs leading-relaxed" style={{ color: "var(--txt2)" }}>
                Plataforma de inteligência fiscal e gerencial do Instituto i10 —
                transformando dados técnicos em decisões públicas seguras.
              </p>
            </div>

            {/* Fontes */}
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest mb-2" style={{ color: "var(--txt3)", letterSpacing: "0.12em" }}>
                Fontes oficiais
              </div>
              <ul className="space-y-1 text-xs" style={{ color: "var(--txt2)" }}>
                <li><strong style={{ color: "var(--txt)" }}>SICONFI</strong> — Tesouro Nacional</li>
                <li><strong style={{ color: "var(--txt)" }}>AUDESP</strong> — TCE-SP</li>
                <li><strong style={{ color: "var(--txt)" }}>SIOPE</strong> — FNDE/MEC</li>
                <li><strong style={{ color: "var(--txt)" }}>SIOPS</strong> — DataSUS/MS</li>
                <li><strong style={{ color: "var(--txt)" }}>INEP</strong> — IDEB e indicadores educacionais</li>
              </ul>
            </div>

            {/* Links */}
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest mb-2" style={{ color: "var(--txt3)", letterSpacing: "0.12em" }}>
                Plataforma
              </div>
              <ul className="space-y-1 text-xs">
                <li><a className="hover:text-white" style={{ color: "var(--txt2)" }} href={`${basePath}/matriz-legal`}>Matriz legal</a></li>
                <li><a className="hover:text-white" style={{ color: "var(--txt2)" }} href={`${basePath}/sobre`}>Sobre o sistema</a></li>
                <li><a className="hover:text-white" style={{ color: "var(--txt2)" }} href="https://institutoi10.com.br" target="_blank" rel="noopener noreferrer">Instituto i10</a></li>
              </ul>
              <div className="text-[10px] mt-4 flex items-center gap-2" style={{ color: "var(--txt3)" }}>
                <span className="live-dot" style={{ width: 6, height: 6 }} />
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
      className="px-3 py-2 rounded-full transition-colors"
      style={{ color: "var(--txt2)" }}
    >
      {label}
    </a>
  );
}
