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

interface PublicacaoStatus {
  dataset: string;
  status: string;
  atualizado_em: string;
}

interface RankingPos {
  indicador: string;
  posicao: number;
  total: number;
  valor: number;
  exercicio: number;
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
  publicacoes,
  ranking,
}: {
  municipio: Municipio;
  indicadores: IndicadorLRF[];
  areasFim: DespesaFuncao[];
  publicacoes: PublicacaoStatus[];
  ranking: RankingPos[];
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
      {tab === "prefeito" && <PrefeitoView indicadores={indicadores} areasFim={areasFim} ranking={ranking} municipio={municipio} />}
      {tab === "vereador" && <VereadorView indicadores={indicadores} areasFim={areasFim} publicacoes={publicacoes} />}
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
          <SemAreasFimAviso />
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

// ============================================================
// MODO PREFEITO — narrativa executiva
// ============================================================
function PrefeitoView({
  indicadores,
  areasFim,
  ranking,
  municipio,
}: {
  indicadores: IndicadorLRF[];
  areasFim: DespesaFuncao[];
  ranking: RankingPos[];
  municipio: Municipio;
}) {
  const latest = pickLatest(indicadores);

  // Vitórias = indicadores onde o município está bem
  const vitorias = latest.filter((i) => {
    if (!i.pct_do_limite) return false;
    const pct = Number(i.pct_do_limite);
    if (MAX_SEMANTIC.has(i.indicador)) return pct < 80;   // pessoal/dívida confortáveis
    return pct >= 100;  // educ/saúde/fundeb acima do mínimo
  });
  const alertas = latest.filter((i) => {
    if (!i.pct_do_limite) return false;
    const pct = Number(i.pct_do_limite);
    if (MAX_SEMANTIC.has(i.indicador)) return pct >= 90;
    return pct < 90;
  });

  // Top 5 áreas em investimento
  const topAreas = areasFim
    .filter((a) => a.eh_area_fim && a.empenhado)
    .slice(0, 5);
  const totalEmpenhado = areasFim.reduce((sum, a) => sum + (Number(a.empenhado) || 0), 0);

  return (
    <div className="space-y-8">
      {/* Hero executivo */}
      <section
        className="rounded-2xl p-8 text-white"
        style={{ background: "linear-gradient(135deg, #0A2463 0%, #00B4D8 100%)" }}
      >
        <div className="text-xs uppercase tracking-wider text-cyan-100 mb-2">
          Saúde fiscal · {latest[0]?.exercicio ?? "—"}
        </div>
        <div className="text-4xl font-bold mb-2" style={{ fontFamily: "var(--font-display)" }}>
          {vitorias.length} de {latest.length} indicadores LRF{" "}
          <span style={{ color: "#00E5A0" }}>em ordem</span>
        </div>
        <div className="text-cyan-100 text-sm">
          {alertas.length === 0
            ? "Nenhum indicador em alerta. Gestão fiscal saudável."
            : `${alertas.length} indicador(es) merecem atenção próxima.`}
        </div>
      </section>

      {/* Vitórias */}
      {vitorias.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            ✅ Vitórias do exercício
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {vitorias.map((v) => (
              <div key={v.indicador} className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="text-xs uppercase text-green-700 font-medium">
                  {LABELS[v.indicador] ?? v.indicador}
                </div>
                <div className="text-2xl font-bold text-green-900 mt-1">
                  {Number(v.valor).toFixed(1)}%
                </div>
                <div className="text-xs text-green-700 mt-1">
                  {MAX_SEMANTIC.has(v.indicador)
                    ? `bem abaixo do teto (${Number(v.limite_legal).toFixed(0)}%)`
                    : `acima do mínimo (${Number(v.limite_legal).toFixed(0)}%)`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Alertas */}
      {alertas.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            ⚠️ Pontos de atenção
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {alertas.map((a) => (
              <div key={a.indicador} className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs uppercase text-amber-700 font-medium">
                  {LABELS[a.indicador] ?? a.indicador}
                </div>
                <div className="text-2xl font-bold text-amber-900 mt-1">
                  {Number(a.valor).toFixed(1)}%
                </div>
                <div className="text-xs text-amber-700 mt-1">
                  {MAX_SEMANTIC.has(a.indicador)
                    ? `próximo ao teto de ${Number(a.limite_legal).toFixed(0)}%`
                    : `abaixo do mínimo de ${Number(a.limite_legal).toFixed(0)}%`}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ranking estadual */}
      {ranking.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            🏆 Como {municipio.nome} se compara aos 645 municípios de SP
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ranking.map((r) => {
              const top10pct = r.posicao <= r.total * 0.1;
              const bottom10pct = r.posicao > r.total * 0.9;
              const bg = top10pct ? "bg-green-50 border-green-200"
                : bottom10pct ? "bg-red-50 border-red-200"
                : "bg-slate-50 border-slate-200";
              return (
                <div key={r.indicador} className={`rounded-xl p-4 border ${bg}`}>
                  <div className="text-xs uppercase font-medium text-slate-600">
                    {LABELS[r.indicador] ?? r.indicador}
                  </div>
                  <div className="text-3xl font-bold my-1" style={{ color: "#0A2463" }}>
                    {r.posicao}º
                    <span className="text-base text-slate-400 font-normal"> de {r.total}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {top10pct && "🥇 entre os 10% melhores"}
                    {bottom10pct && "🚨 entre os 10% piores"}
                    {!top10pct && !bottom10pct && `valor: ${Number(r.valor).toFixed(1)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Top investimentos */}
      {topAreas.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            💰 Top 5 áreas em investimento ({topAreas[0]?.exercicio})
          </h3>
          <div className="space-y-2">
            {topAreas.map((a) => {
              const pct = totalEmpenhado > 0
                ? (Number(a.empenhado) / totalEmpenhado) * 100
                : 0;
              return (
                <div key={a.funcao} className="bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="font-semibold text-slate-900">{a.funcao}</div>
                    <div className="text-sm text-slate-500">
                      <strong className="text-slate-900">{fmtBRL(a.empenhado)}</strong> · {pct.toFixed(1)}% do orçamento
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${Math.min(100, pct)}%`, background: "#00B4D8" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================
// MODO VEREADOR — fiscalização e evidência
// ============================================================
function VereadorView({
  indicadores,
  areasFim,
  publicacoes,
}: {
  indicadores: IndicadorLRF[];
  areasFim: DespesaFuncao[];
  publicacoes: PublicacaoStatus[];
}) {
  const latest = pickLatest(indicadores);
  const problemas = latest.filter((i) => {
    if (!i.pct_do_limite) return false;
    const pct = Number(i.pct_do_limite);
    if (MAX_SEMANTIC.has(i.indicador)) return pct >= 90;     // perto/acima do teto
    return pct < 100;  // abaixo do mínimo
  });
  const fora_da_lei = problemas.filter((i) => {
    const pct = Number(i.pct_do_limite);
    if (MAX_SEMANTIC.has(i.indicador)) return pct >= 100;
    return pct < 100;
  });

  const areasFimOnly = areasFim.filter((a) => a.eh_area_fim);

  // Stats de cobertura
  const pub = publicacoes.filter((p) => p.status === "PUBLICADO").length;
  const ndp = publicacoes.filter((p) => p.status === "NAO_PUBLICADO").length;
  const totalDatasets = publicacoes.length;
  const pctPublicado = totalDatasets > 0 ? Math.round((pub / totalDatasets) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Status legal */}
      <section
        className={`rounded-2xl p-6 border-2 ${
          fora_da_lei.length > 0
            ? "bg-red-50 border-red-300"
            : "bg-green-50 border-green-300"
        }`}
      >
        <div className="text-xs uppercase tracking-wider text-slate-600 mb-2">
          Cumprimento de Lei (LRF · CF Art. 198 · CF Art. 212)
        </div>
        <div className="text-3xl font-bold mb-1" style={{ color: fora_da_lei.length > 0 ? "#991B1B" : "#065F46" }}>
          {fora_da_lei.length === 0
            ? "✓ Cumprindo todos os limites legais"
            : `⚠️ ${fora_da_lei.length} indicador(es) fora do limite legal`}
        </div>
        {fora_da_lei.length > 0 && (
          <ul className="mt-3 text-sm text-red-900 space-y-1">
            {fora_da_lei.map((i) => (
              <li key={i.indicador}>
                <strong>{LABELS[i.indicador] ?? i.indicador}:</strong> {Number(i.valor).toFixed(1)}%
                {" "}({MAX_SEMANTIC.has(i.indicador) ? "limite máx" : "mínimo legal"}:{" "}
                {Number(i.limite_legal).toFixed(0)}%)
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tabela meta vs realizado */}
      {areasFimOnly.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">
            📊 Promessa (LOA) vs Entregue por área-fim
          </h3>
          <p className="text-xs text-slate-500 mb-4 italic">
            Esta é a tabela de accountability: o município se comprometeu (Dotação Inicial), e entregou (Liquidado).
            Dados extraídos diretamente do RREO Anexo 02 publicado pelo município no SICONFI.
          </p>
          <AreasFimTable areas={areasFimOnly} />
        </section>
      )}

      {/* Histórico de publicação */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">
          📅 Histórico de publicação ({pctPublicado}% dos {totalDatasets} relatórios obrigatórios)
        </h3>
        <p className="text-xs text-slate-500 mb-4 italic">
          Pra cobrar transparência: verifique se o prefeito publicou os relatórios fiscais nos prazos legais.
          Datasets com status "NÃO PUBLICADO" são da responsabilidade da prefeitura.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <StatCard label="Publicados" value={pub} color="#065F46" bg="bg-green-50 border-green-200" />
          <StatCard label="Não publicados" value={ndp} color="#991B1B" bg="bg-red-50 border-red-200" />
          <StatCard label="Cobertura" value={`${pctPublicado}%`} color="#0A2463" bg="bg-slate-50 border-slate-200" />
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-600 hover:text-slate-900">
            Ver lista completa de {totalDatasets} relatórios
          </summary>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {publicacoes.map((p) => (
              <div
                key={p.dataset}
                className={`text-xs px-3 py-2 rounded-lg border flex justify-between ${
                  p.status === "PUBLICADO"
                    ? "bg-green-50 border-green-200 text-green-900"
                    : "bg-red-50 border-red-200 text-red-900"
                }`}
              >
                <span className="font-mono">{p.dataset}</span>
                <span>{p.status === "PUBLICADO" ? "✓" : "✗"}</span>
              </div>
            ))}
          </div>
        </details>
      </section>

      <section>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-sm text-blue-900">
          <strong>💡 Como usar pra fiscalizar:</strong>
          <ol className="list-decimal ml-5 mt-2 space-y-1">
            <li>Compare a coluna <strong>Meta</strong> (o que aprovamos na câmara) com <strong>Liquidado</strong> (o que foi gasto)</li>
            <li>% Execução muito baixo (vermelho) = município não cumpriu o orçamento aprovado</li>
            <li>Indicadores fora do limite legal são fundamento pra requerimento de informação</li>
            <li>Use o botão <strong>Excel</strong> acima pra anexar dados em ofício/parecer</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

function SemAreasFimAviso() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const exemplos = [
    { cod: 3504503, nome: "Avaré" },
    { cod: 3518305, nome: "Guararema" },
    { cod: 3502101, nome: "Andradina" },
    { cod: 3509502, nome: "Campinas" },
  ];
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
      <div className="flex items-start gap-3">
        <div className="text-3xl">⚠️</div>
        <div className="flex-1">
          <h4 className="font-semibold text-amber-900 mb-1">
            Este município ainda não publicou o RREO Anexo 02
          </h4>
          <p className="text-sm text-amber-800 mb-3">
            O município é obrigado por lei (LRF Art. 52) a publicar bimestralmente as
            despesas por função/subfunção no SICONFI. Como não publicou, não conseguimos
            mostrar as áreas-fim aqui. Cerca de <strong>115 dos 645</strong> municípios
            paulistas estão nessa situação.
          </p>
          <div className="text-xs text-amber-700 mb-2 font-semibold">
            Veja como fica em municípios que publicam regularmente:
          </div>
          <div className="flex flex-wrap gap-2">
            {exemplos.map((m) => (
              <a
                key={m.cod}
                href={`${basePath}/municipio/${m.cod}`}
                className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {m.nome} →
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bg }: { label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className={`rounded-xl p-4 border ${bg}`}>
      <div className="text-xs uppercase tracking-wide font-medium text-slate-600">{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color }}>{value}</div>
    </div>
  );
}

function fmtBRL(v: number | null) {
  if (v == null) return "—";
  const n = Number(v);
  if (n >= 1e9) return `R$ ${(n / 1e9).toFixed(2)} bi`;
  if (n >= 1e6) return `R$ ${(n / 1e6).toFixed(2)} mi`;
  if (n >= 1e3) return `R$ ${(n / 1e3).toFixed(1)} mil`;
  return `R$ ${n.toFixed(0)}`;
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
