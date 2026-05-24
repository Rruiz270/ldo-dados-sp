"use client";

import { useMemo, useState } from "react";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

interface Row {
  cod_ibge: number;
  nome: string;
  populacao: number;
}

export function MunicipioSearch({ municipios }: { municipios: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    if (!q.trim()) return municipios.slice(0, 8);
    const norm = q.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    return municipios
      .filter((m) =>
        m.nome.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().includes(norm),
      )
      .slice(0, 12);
  }, [q, municipios]);

  return (
    <div className="relative max-w-2xl">
      <input
        type="text"
        placeholder="Digite o nome do município (ex: Campinas, Adamantina, São José...)"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full px-5 py-4 rounded-xl text-slate-900 text-base border-0 shadow-lg focus:outline-none focus:ring-4 focus:ring-cyan-300"
      />
      {(q.trim() || filtered.length > 0) && (
        <ul className="absolute z-10 mt-2 w-full bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          {filtered.length === 0 ? (
            <li className="px-5 py-3 text-slate-400 text-sm">
              Nenhum município encontrado.
            </li>
          ) : (
            filtered.map((m) => (
              <li key={m.cod_ibge}>
                <a
                  href={`${basePath}/municipio/${m.cod_ibge}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition"
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
  );
}
