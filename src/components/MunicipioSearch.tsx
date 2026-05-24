"use client";

import { useMemo, useState, useRef, useEffect } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface Row {
  cod_ibge: number;
  nome: string;
  populacao: number;
}

// Municípios bem documentados pra demo (têm RREO Anexo 02 publicado)
const DESTAQUES: Array<{ cod: number; nome: string }> = [
  { cod: 3550308, nome: "São Paulo" },
  { cod: 3509502, nome: "Campinas" },
  { cod: 3548708, nome: "Santo André" },
  { cod: 3504503, nome: "Avaré" },
  { cod: 3518305, nome: "Guararema" },
  { cod: 3502101, nome: "Andradina" },
];

export function MunicipioSearch({ municipios }: { municipios: Row[] }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!q.trim()) return [];
    const norm = q.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return municipios
      .filter((m) =>
        m.nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(norm),
      )
      .slice(0, 8);
  }, [q, municipios]);

  const hasQuery = q.trim().length > 0;

  return (
    <div className="w-full max-w-2xl" ref={wrapRef}>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Buscar entre os 645 municípios de SP..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="w-full pl-12 pr-5 py-4 rounded-xl text-slate-900 text-base border border-white/20 shadow-2xl bg-white focus:outline-none focus:ring-4 focus:ring-cyan-300"
        />
        {open && hasQuery && (
          <ul className="absolute z-20 mt-2 w-full bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden max-h-96 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-5 py-4 text-slate-400 text-sm text-center">
                Nenhum município encontrado para “{q}”
              </li>
            ) : (
              filtered.map((m) => (
                <li key={m.cod_ibge}>
                  <a
                    href={`${basePath}/municipio/${m.cod_ibge}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-cyan-50 transition border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-900 font-medium">{m.nome}</span>
                    <span className="text-xs text-slate-500">
                      {m.populacao?.toLocaleString("pt-BR")} hab
                    </span>
                  </a>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {/* Destaques abaixo do search */}
      {!hasQuery && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-cyan-100/80 mr-1">
            Exemplos:
          </span>
          {DESTAQUES.map((m) => (
            <a
              key={m.cod}
              href={`${basePath}/municipio/${m.cod}`}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 transition"
            >
              {m.nome}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
