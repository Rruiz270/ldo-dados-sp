"use client";

import { useState } from "react";
import { lrfColor } from "@/lib/theme";

interface Municipio {
  cod_ibge: number;
  nome: string;
  populacao: number;
}

interface IndicadorLRF {
  indicador: string;
  exercicio: number;
  periodo: number;
  periodicidade: string;
  valor: number;
  limite_legal: number;
  pct_do_limite: number;
  fonte: string;
}

interface DespesaFuncao {
  funcao: string;
  exercicio: number;
  periodo: number;
  eh_area_fim: boolean;
  dotacao_inicial: number | null;
  dotacao_atualizada: number | null;
  empenhado: number | null;
  liquidado: number | null;
  pct_do_total: number | null;
}

type Tab = "secretario" | "prefeito" | "vereador";

const TABS: { id: Tab; label: string; emoji: string; subtitle: string }[] = [
  { id: "secretario", label: "Secretário", emoji: "🔵", subtitle: "Visão técnica e projeção" },
  { id: "prefeito", label: "Prefeito", emoji: "🟢", subtitle: "Narrativa executiva" },
  { id: "vereador", label: "Vereador", emoji: "🟠", subtitle: "Fiscalização e evidência" },
];

export function MunicipioTabs({
  municipio,
  indicadores,
  areasFim,
}: {
  municipio: Municipio;
  indicadores: IndicadorLRF[];
  areasFim: DespesaFuncao[];
}) {
  const [tab, setTab] = useState<Tab>("secretario");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === t.id ? "bg-white shadow text-slate-900" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <span className="mr-2">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <ExportButton format="xlsx" cod={municipio.cod_ibge} label="📥 Excel" />
          <ExportButton format="pdf" cod={municipio.cod_ibge} label="📥 PDF" />
        </div>
      </div>

      <div className="text-sm text-slate-500 mb-6 italic">
        {TABS.find((t) => t.id === tab)?.subtitle}
      </div>

      {tab === "secretario" && <SecretarioView indicadores={indicadores} areasFim={areasFim} />}
      {tab === "prefeito" && <PrefeitoView indicadores={indicadores} />}
      {tab === "vereador" && <VereadorView indicadores={indicadores} />}
    </div>
  );
}

function SecretarioView({ indicadores, areasFim }: { indicadores: IndicadorLRF[]; areasFim: DespesaFuncao[] }) {
  const latest = pickLatest(indicadores);
  const areasFimOnly = areasFim.filter((a) => a.eh_area_fim);
  const areasMeio = areasFim.filter((a) => !a.eh_area_fim);
  const refYear = areasFim[0]?.exercicio;
  const refPer = areasFim[0]?.periodo;

  return (
    <div className="space-y-10">
      {/* Indicadores LRF */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Indicadores LRF (cumprimento de limites legais)
        </h3>
        {latest.length === 0 ? (
          <EmptyState text="Indicadores LRF ainda não foram populados para este município." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {latest.map((i) => (
              <LrfCard key={i.indicador} indicador={i} />
            ))}
          </div>
        )}
      </section>

      {/* Áreas-fim */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">
          Despesas por área-fim
          {refYear && (
            <span className="ml-2 text-xs normal-case text-slate-400">
              · RREO {refYear}/B{refPer}
            </span>
          )}
        </h3>
        <p className="text-xs text-slate-500 mb-4 italic">
          Para cada secretaria/área que presta serviço direto à população: meta (dotação inicial da LOA), executado e % de execução.
        </p>
        {areasFimOnly.length === 0 ? (
          <EmptyState text="Despesas por função ainda não publicadas para este município." />
        ) : (
          <AreasFimTable areas={areasFimOnly} />
        )}
      </section>

      {/* Áreas-meio (recolhível) */}
      {areasMeio.length > 0 && (
        <section>
          <details>
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
              Áreas-meio (legislativa, administração, encargos) — {areasMeio.length} funções
            </summary>
            <div className="mt-4">
              <AreasFimTable areas={areasMeio} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

function AreasFimTable({ areas }: { areas: DespesaFuncao[] }) {
  const fmtBRL = (v: number | null) => {
    if (v == null) return "—";
    const n = Number(v);
    if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(2)} bi`;
    if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(2)} mi`;
    if (n >= 1e3) return `R$ ${(n / 1e3).toFixed(1)} mil`;
    return `R$ ${n.toFixed(0)}`;
  };
  const pctExec = (a: DespesaFuncao) => {
    if (!a.dotacao_inicial || !a.liquidado) return null;
    return (Number(a.liquidado) / Number(a.dotacao_inicial)) * 100;
  };
  return (
    <div className="overflow-hidden border border-slate-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-4 py-3 font-semibold">Área-fim</th>
            <th className="text-right px-4 py-3 font-semibold">Meta (Dotação)</th>
            <th className="text-right px-4 py-3 font-semibold">Empenhado</th>
            <th className="text-right px-4 py-3 font-semibold">Liquidado</th>
            <th className="text-right px-4 py-3 font-semibold">% Execução</th>
            <th className="text-right px-4 py-3 font-semibold">% Orçamento</th>
          </tr>
        </thead>
        <tbody>
          {areas.map((a) => {
            const exec = pctExec(a);
            const cor = exec == null ? "#94A3B8"
              : exec >= 95 ? "#00C48A"
              : exec >= 80 ? "#00B4D8"
              : exec >= 60 ? "#f59e0b"
              : "#dc2626";
            return (
              <tr key={a.funcao} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{a.funcao}</td>
                <td className="px-4 py-3 text-right text-slate-700">{fmtBRL(a.dotacao_inicial)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{fmtBRL(a.empenhado)}</td>
                <td className="px-4 py-3 text-right text-slate-700">{fmtBRL(a.liquidado)}</td>
                <td className="px-4 py-3 text-right">
                  {exec == null ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="font-semibold" style={{ color: cor }}>
                      {exec.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-slate-500">
                  {a.pct_do_total != null ? `${Number(a.pct_do_total).toFixed(1)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PrefeitoView({ indicadores }: { indicadores: IndicadorLRF[] }) {
  return (
    <EmptyState
      text="Modo Prefeito — em construção (V1). Vai trazer: ranking estadual, comparação histórica com gestões anteriores, lista de 'vitórias' do exercício."
    />
  );
}

function VereadorView({ indicadores }: { indicadores: IndicadorLRF[] }) {
  return (
    <EmptyState
      text="Modo Vereador — em construção (V1). Vai trazer: tabela meta vs realizado, histórico de alterações orçamentárias, fonte de cada número com timestamp, export pronto pra ofício."
    />
  );
}

const LABELS: Record<string, string> = {
  pessoal: "Despesa com Pessoal",
  educacao: "Educação",
  saude: "Saúde",
  fundeb: "FUNDEB",
  fundeb_profissionais: "FUNDEB Profissionais",
  resultado_execucao: "Resultado Execução",
};

// Indicadores onde alto = ruim (limite máximo)
const MAX_SEMANTIC = new Set(["pessoal", "divida"]);

function LrfCard({ indicador }: { indicador: IndicadorLRF }) {
  const valor = Number(indicador.valor ?? 0);
  const limite = indicador.limite_legal != null ? Number(indicador.limite_legal) : null;
  const pctLim = indicador.pct_do_limite != null ? Number(indicador.pct_do_limite) : null;

  const isMaxLimit = MAX_SEMANTIC.has(indicador.indicador);
  // Para indicadores "min", >=100% do mínimo é bom (verde); para "max", <80% é bom
  const color = pctLim == null
    ? "#94A3B8"
    : isMaxLimit
      ? lrfColor(pctLim)
      : pctLim >= 100 ? "#00E5A0" : pctLim >= 80 ? "#00B4D8" : "#f59e0b";

  const periodoLabel = indicador.periodicidade === "A"
    ? `${indicador.exercicio}`
    : `${indicador.exercicio}/${indicador.periodicidade}${indicador.periodo}`;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1 font-medium">
        {LABELS[indicador.indicador] ?? indicador.indicador}
      </div>
      <div className="text-3xl font-bold" style={{ color: "#0A2463" }}>
        {valor.toFixed(1)}%
      </div>
      <div className="text-xs text-slate-500 mb-3">
        {limite != null ? (
          <>
            {isMaxLimit ? "limite máximo" : "mínimo legal"}: <strong>{limite.toFixed(1)}%</strong>
          </>
        ) : (
          <>sem limite legal</>
        )}
      </div>
      {pctLim != null && (
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{ width: `${Math.min(100, pctLim)}%`, background: color }}
          />
        </div>
      )}
      <div className="mt-2 text-[10px] text-slate-400 uppercase tracking-wide">
        {indicador.fonte} · {periodoLabel}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-600 text-sm">
      {text}
    </div>
  );
}

function ExportButton({ format, cod, label }: { format: "pdf" | "xlsx"; cod: number; label: string }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return (
    <a
      href={`${basePath}/api/export/${cod}/${format}`}
      className="px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 hover:bg-slate-50 text-slate-700"
    >
      {label}
    </a>
  );
}

function pickLatest(indicadores: IndicadorLRF[]): IndicadorLRF[] {
  const map = new Map<string, IndicadorLRF>();
  for (const i of indicadores) {
    const existing = map.get(i.indicador);
    if (!existing || i.exercicio > existing.exercicio ||
        (i.exercicio === existing.exercicio && i.periodo > existing.periodo)) {
      map.set(i.indicador, i);
    }
  }
  return Array.from(map.values());
}
