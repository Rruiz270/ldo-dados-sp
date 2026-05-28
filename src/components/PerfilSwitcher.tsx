"use client";

import { useEffect, useState, useRef } from "react";
import { PERFIS, PERFIL_DEFAULT, type Perfil, type PerfilId } from "@/lib/perfil";
import { ChevronDown, Check } from "lucide-react";

interface Props {
  perfilInicial: PerfilId;
}

export function PerfilSwitcher({ perfilInicial }: Props) {
  const [perfil, setPerfil] = useState<PerfilId>(perfilInicial);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function selecionar(p: Perfil) {
    setPerfil(p.id);
    setOpen(false);
    // Cookie disponível em SSR; SameSite=Lax pra navegação normal
    document.cookie = `radar_perfil=${p.id}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
    // Reload pra refletir nas server pages
    window.location.reload();
  }

  const atual = PERFIS.find((p) => p.id === perfil) ?? PERFIS[0];

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors hover:bg-slate-100"
        style={{
          background: "white",
          border: "1px solid rgba(11,47,99,0.10)",
          color: "var(--azul)",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className="w-2 h-2 rounded-full"
          style={{ background: atual.cor }}
          aria-hidden
        />
        <span className="hidden sm:inline text-[10px] uppercase tracking-widest" style={{ color: "var(--cinza)" }}>
          Vendo como
        </span>
        <span className="font-bold">{atual.nome}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-2xl overflow-hidden z-50"
          style={{
            background: "white",
            border: "1px solid rgba(11,47,99,0.12)",
            boxShadow: "0 18px 45px rgba(11,47,99,0.18)",
          }}
        >
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="text-[10px] uppercase tracking-widest font-bold" style={{ color: "var(--cinza)", letterSpacing: "0.08em" }}>
              Selecionar perfil de acesso
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--cinza)" }}>
              Cada perfil mostra recursos diferentes. Sem autenticação por enquanto — apenas demonstração.
            </p>
          </div>
          <ul role="listbox">
            {PERFIS.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => selecionar(p)}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                  role="option"
                  aria-selected={p.id === perfil}
                >
                  <span
                    className="mt-1 w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ background: p.cor }}
                    aria-hidden
                  />
                  <span className="flex-1 min-w-0">
                    <span className="font-semibold text-sm block" style={{ color: "var(--azul)" }}>
                      {p.nome}
                    </span>
                    <span className="text-xs block" style={{ color: "var(--cinza)" }}>
                      {p.descricao}
                    </span>
                  </span>
                  {p.id === perfil && (
                    <Check size={16} strokeWidth={2.5} style={{ color: "var(--verde-2)" }} aria-hidden />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
