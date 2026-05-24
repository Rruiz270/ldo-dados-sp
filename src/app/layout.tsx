import type { Metadata } from "next";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "LDO Dados SP · Instituto i10",
  description:
    "Indicadores fiscais e metas de LDO dos 645 municípios de São Paulo, em tempo real.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Source+Serif+4:wght@400;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <header
          className="text-white"
          style={{
            background: "linear-gradient(135deg, #0A2463 0%, #00B4D8 100%)",
          }}
        >
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href={`${basePath}/`} className="flex items-center gap-3 text-white">
              <div className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
                i10 · LDO Dados
              </div>
            </a>
            <nav className="flex gap-6 text-sm font-medium">
              <a href={`${basePath}/`} className="hover:text-cyan-100">Município</a>
              <a href={`${basePath}/comparar`} className="hover:text-cyan-100">Comparar</a>
              <a href={`${basePath}/sobre`} className="hover:text-cyan-100">Sobre</a>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="bg-slate-900 text-slate-300 py-6">
          <div className="max-w-7xl mx-auto px-6 text-xs">
            Fontes: <strong>Tesouro Nacional (SICONFI)</strong> e <strong>TCE-SP (Audesp)</strong>.
            Atualizado diariamente às 4h. ·{" "}
            <a className="underline" href="https://institutoi10.com.br" target="_blank">Instituto i10</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
