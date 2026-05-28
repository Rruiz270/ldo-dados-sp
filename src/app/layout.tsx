import type { Metadata } from "next";
import "./globals.css";
import { cookies } from "next/headers";
import { PerfilSwitcher } from "@/components/PerfilSwitcher";
import { PERFIL_DEFAULT, type PerfilId } from "@/lib/perfil";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Radar Fiscal 360 — Gestão Municipal · Instituto i10",
  description:
    "Monitoramento inteligente para decisões seguras. Acompanhamento fiscal, orçamentário e gerencial dos 645 municípios de São Paulo.",
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
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
            <a href={`${basePath}/`} className="flex items-center gap-3" style={{ color: "var(--azul)" }}>
              <img
                src={`${basePath}/brand/radar-360-full.png`}
                alt="Radar Fiscal 360 — Gestão Municipal"
                className="h-9 md:h-10"
                style={{ width: "auto" }}
              />
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
            background: "rgba(11,47,99,0.97)",
            color: "rgba(255,255,255,0.85)",
          }}
          className="py-8 mt-12"
        >
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row gap-6 md:items-center md:justify-between text-sm">
            <div>
              <div className="font-bold text-white text-base mb-1">Radar Fiscal Municipal 360</div>
              <div className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>
                Monitoramento inteligente para decisões seguras
              </div>
            </div>
            <div className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
              Fontes oficiais: <strong>SICONFI</strong> (STN) · <strong>Audesp</strong> (TCE-SP) ·{" "}
              <strong>SIOPE</strong> (FNDE) · <strong>SIOPS</strong> (DataSUS) · <strong>INEP</strong> (IDEB)<br />
              Atualizado diariamente às 4h · <a className="underline hover:text-white" href={`${basePath}/matriz-legal`}>matriz legal</a> ·{" "}
              <a className="underline hover:text-white" href="https://institutoi10.com.br" target="_blank">Instituto i10</a>
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
