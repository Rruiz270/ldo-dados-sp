"use client";

import { useState } from "react";
import { lrfColor } from "@/lib/theme";
import { UserCog, Crown, ShieldCheck, AlertTriangle, Coins, BarChart3, Check, X, TrendingUp, Download, type LucideIcon } from "lucide-react";

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
  eh_subfuncao?: boolean;
  funcao_pai?: string | null;
  dotacao_inicial: number | null;
  dotacao_atualizada: number | null;
  empenhado: number | null;
  liquidado: number | null;
  pct_do_total: number | null;
}

interface IndicadorFiscal {
  indicador: string;
  exercicio: number;
  periodo: number;
  valor: string;
  meta: string | null;
  fonte: string;
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

const TABS: { id: Tab; label: string; Icon: LucideIcon; subtitle: string }[] = [
  { id: "secretario", label: "Secretário", Icon: UserCog,     subtitle: "Visão técnica e projeção" },
  { id: "prefeito",   label: "Prefeito",   Icon: Crown,       subtitle: "Narrativa executiva" },
  { id: "vereador",   label: "Vereador",   Icon: ShieldCheck, subtitle: "Fiscalização e evidência" },
];

export function MunicipioTabs({
  municipio,
  indicadores,
  areasFim,
  publicacoes,
  ranking,
  fiscais,
}: {
  municipio: Municipio;
  indicadores: IndicadorLRF[];
  areasFim: DespesaFuncao[];
  publicacoes: PublicacaoStatus[];
  ranking: RankingPos[];
  fiscais?: IndicadorFiscal[];
}) {
  const [tab, setTab] = useState<Tab>("secretario");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === id ? "bg-white shadow text-slate-900" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon size={16} strokeWidth={2} aria-hidden />
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <ExportButton format="xlsx" cod={municipio.cod_ibge} label="Excel" />
          <ExportButton format="pdf" cod={municipio.cod_ibge} label="PDF" />
        </div>
      </div>

      <div className="text-sm text-slate-500 mb-6 italic">
        {TABS.find((t) => t.id === tab)?.subtitle}
      </div>

      {tab === "secretario" && <SecretarioView indicadores={indicadores} areasFim={areasFim} fiscais={fiscais ?? []} />}
      {tab === "prefeito" && <PrefeitoView indicadores={indicadores} areasFim={areasFim} ranking={ranking} municipio={municipio} />}
      {tab === "vereador" && <VereadorView indicadores={indicadores} areasFim={areasFim} publicacoes={publicacoes} />}
    </div>
  );
}

function SecretarioView({ indicadores, areasFim, fiscais }: { indicadores: IndicadorLRF[]; areasFim: DespesaFuncao[]; fiscais: IndicadorFiscal[] }) {
  const latest = pickLatest(indicadores);
  // Funções principais (eh_area_fim=true e !eh_subfuncao)
  const areasFimPrinc = areasFim.filter((a) => a.eh_area_fim && !a.eh_subfuncao);
  const areasMeioPrinc = areasFim.filter((a) => !a.eh_area_fim && !a.eh_subfuncao);
  // Subfunções agrupadas por funcao_pai
  const subfByPai = new Map<string, DespesaFuncao[]>();
  for (const a of areasFim) {
    if (a.eh_subfuncao && a.funcao_pai) {
      const arr = subfByPai.get(a.funcao_pai) ?? [];
      arr.push(a);
      subfByPai.set(a.funcao_pai, arr);
    }
  }
  const refYear = areasFim[0]?.exercicio;
  const refPer = areasFim[0]?.periodo;

  // Indicadores fiscais mais recentes (RCL, Resultado Primário)
  const rcl = fiscais.find((f) => f.indicador === "rcl");
  const rp = fiscais.find((f) => f.indicador === "resultado_primario");

  return (
    <div className="space-y-10">
      {/* Indicadores fiscais R$ */}
      {(rcl || rp) && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Indicadores fiscais (R$)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rcl && <FiscalCard title="RCL — Receita Corrente Líquida" subtitle="últimos 12 meses" valor={rcl.valor} ref={`${rcl.exercicio}/B${rcl.periodo}`} fonte="RREO Anexo 03" />}
            {rp && (
              <FiscalCard
                title="Resultado Primário"
                subtitle={rp.meta ? "vs meta da LDO" : "valor realizado (sem rpps)"}
                valor={rp.valor}
                meta={rp.meta}
                ref={`${rp.exercicio}/B${rp.periodo}`}
                fonte="RREO Anexo 06"
                metaIndisponivel={!rp.meta}
              />
            )}
          </div>
        </section>
      )}

      {/* Indicadores LRF */}
      <section>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
          Indicadores LRF (cumprimento de limites legais)
        </h3>
        {latest.length === 0 ? (
          <SemDadosAviso
            fonte="Audesp Análises (TCE-SP)"
            descricao="Indicadores LRF — Despesa com Pessoal, Educação, Saúde, FUNDEB — são processados pelo TCE-SP a partir das peças do Audesp Fase IV enviadas pela prefeitura. Este município ainda não foi processado ou não enviou os dados."
          />
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
        {areasFimPrinc.length === 0 ? (
          <SemAreasFimAviso />
        ) : (
          <AreasFimTable areas={areasFimPrinc} subfByPai={subfByPai} />
        )}
      </section>

      {/* Áreas-meio (recolhível) */}
      {areasMeioPrinc.length > 0 && (
        <section>
          <details>
            <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-700">
              Áreas-meio (legislativa, administração, encargos) — {areasMeioPrinc.length} funções
            </summary>
            <div className="mt-4">
              <AreasFimTable areas={areasMeioPrinc} subfByPai={subfByPai} />
            </div>
          </details>
        </section>
      )}
    </div>
  );
}

// Calcula % execução com tratamento para crédito suplementar.
// Quando a dotação inicial era simbólica (programa criado/expandido durante o ano), o cálculo
// padrão liquidado/inicial gera números absurdos (>500%) que sujam a leitura. Nesses casos usa-se
// a dotação atualizada e sinaliza ("prometeu X, ampliou pra Y").
// Casos extremos (atualizada negativa por anulação, ou ausente) viram badge "dados anômalos" sem
// número — melhor honestidade que exibir 44.633%.
function computeExec(dotIni: number | null, dotAtu: number | null, liq: number | null): { exec: number | null; cor: string; viaSuplementar: boolean; anomalo: boolean } {
  if (!liq) return { exec: null, cor: "#94A3B8", viaSuplementar: false, anomalo: false };
  const ini = dotIni ? Number(dotIni) : 0;
  const atu = dotAtu ? Number(dotAtu) : 0;
  const l = Number(liq);
  const execIni = ini > 0 ? (l / ini) * 100 : null;

  // Caso normal — execução plausível sobre dotação inicial
  if (execIni == null || execIni <= 500) {
    const cor = execIni == null ? "#94A3B8"
      : execIni >= 95 ? "#00C48A" : execIni >= 80 ? "#00B4D8" : execIni >= 60 ? "#f59e0b" : "#dc2626";
    return { exec: execIni, cor, viaSuplementar: false, anomalo: false };
  }

  // Outlier — tentar dotação atualizada se for válida (positiva e bem maior que inicial)
  if (atu > 0 && atu > ini * 5) {
    const execAtu = (l / atu) * 100;
    const cor = execAtu >= 95 ? "#00C48A" : execAtu >= 80 ? "#00B4D8" : execAtu >= 60 ? "#f59e0b" : "#dc2626";
    return { exec: execAtu, cor, viaSuplementar: true, anomalo: false };
  }

  // Outlier sem atualizada confiável (negativa, zero, ou ainda pequena) — anomalia
  return { exec: null, cor: "#94A3B8", viaSuplementar: false, anomalo: true };
}

function AreasFimTable({ areas, subfByPai }: { areas: DespesaFuncao[]; subfByPai?: Map<string, DespesaFuncao[]> }) {
  const subfMap = subfByPai ?? new Map<string, DespesaFuncao[]>();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (f: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(f) ? next.delete(f) : next.add(f);
      return next;
    });
  };

  return (
    <div className="overflow-hidden border border-slate-200 rounded-xl bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="text-left px-4 py-3 font-semibold w-8"></th>
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
            const subs = subfMap.get(a.funcao) ?? [];
            const open = expanded.has(a.funcao);
            return (
              <FuncRow
                key={a.funcao}
                a={a}
                subs={subs}
                open={open}
                onToggle={() => toggle(a.funcao)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FuncRow({ a, subs, open, onToggle }: { a: DespesaFuncao; subs: DespesaFuncao[]; open: boolean; onToggle: () => void }) {
  const { exec, cor, viaSuplementar, anomalo } = computeExec(a.dotacao_inicial, a.dotacao_atualizada, a.liquidado);
  const canExpand = subs.length > 0;
  return (
    <>
      <tr className={`border-t border-slate-100 hover:bg-slate-50 ${canExpand ? "cursor-pointer" : ""}`} onClick={canExpand ? onToggle : undefined}>
        <td className="px-2 py-3 text-center text-slate-400">
          {canExpand ? (
            <span className="inline-block w-4 h-4 leading-4 text-xs">{open ? "▼" : "▶"}</span>
          ) : (
            ""
          )}
        </td>
        <td className="px-4 py-3 font-medium text-slate-900">
          {a.funcao}
          {canExpand && <span className="ml-2 text-xs text-slate-400 font-normal">({subs.length} subáreas)</span>}
          {viaSuplementar && (
            <span title="Programa ampliado via crédito suplementar (LRF Art. 43): dotação inicial era simbólica, prefeitura abriu a verba durante o exercício com autorização da Câmara. % execução exibido é sobre a dotação atualizada." className="ml-2 inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-normal align-middle cursor-help">
              <TrendingUp size={11} strokeWidth={2.2} aria-hidden /> ampliado p/ crédito suplementar
            </span>
          )}
          {anomalo && (
            <span title="Dados anômalos: dotação inicial simbólica e dotação atualizada negativa ou inconsistente. % execução não calculável de forma confiável — consulte os valores absolutos." className="ml-2 inline-flex items-center gap-1 text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-normal align-middle cursor-help">
              <AlertTriangle size={11} strokeWidth={2.2} aria-hidden /> dados anômalos
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right text-slate-700">{fmtBRL(a.dotacao_inicial)}</td>
        <td className="px-4 py-3 text-right text-slate-700">{fmtBRL(a.empenhado)}</td>
        <td className="px-4 py-3 text-right text-slate-700">{fmtBRL(a.liquidado)}</td>
        <td className="px-4 py-3 text-right">
          {exec == null ? <span className="text-slate-400">—</span> : <span className="font-semibold" style={{ color: cor }}>{exec.toFixed(1)}%</span>}
        </td>
        <td className="px-4 py-3 text-right text-slate-500">
          {a.pct_do_total != null ? `${Number(a.pct_do_total).toFixed(1)}%` : "—"}
        </td>
      </tr>
      {open && subs.map((s) => {
        const { exec: sExec, cor: sCor, viaSuplementar: sVia, anomalo: sAno } = computeExec(s.dotacao_inicial, s.dotacao_atualizada, s.liquidado);
        return (
          <tr key={`${a.funcao}-${s.funcao}`} className="bg-slate-50/50 border-t border-slate-100 text-xs">
            <td></td>
            <td className="px-4 py-2 text-slate-700 pl-12">
              ↳ {s.funcao}
              {sVia && <span title="Ampliado via crédito suplementar — % sobre dotação atualizada" className="ml-2 inline-flex items-center text-[9px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded"><TrendingUp size={10} strokeWidth={2.2} aria-hidden /></span>}
              {sAno && <span title="Dados anômalos" className="ml-2 inline-flex items-center text-[9px] bg-red-100 text-red-800 px-1 py-0.5 rounded"><AlertTriangle size={10} strokeWidth={2.2} aria-hidden /></span>}
            </td>
            <td className="px-4 py-2 text-right text-slate-600">{fmtBRL(s.dotacao_inicial)}</td>
            <td className="px-4 py-2 text-right text-slate-600">{fmtBRL(s.empenhado)}</td>
            <td className="px-4 py-2 text-right text-slate-600">{fmtBRL(s.liquidado)}</td>
            <td className="px-4 py-2 text-right">
              {sExec == null ? <span className="text-slate-400">—</span> : <span style={{ color: sCor }}>{sExec.toFixed(1)}%</span>}
            </td>
            <td className="px-4 py-2 text-right text-slate-400">
              {s.pct_do_total != null ? `${Number(s.pct_do_total).toFixed(1)}%` : "—"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function FiscalCard({ title, subtitle, valor, meta, ref, fonte, metaIndisponivel }: { title: string; subtitle: string; valor: string; meta?: string | null; ref: string; fonte: string; metaIndisponivel?: boolean }) {
  const v = Number(valor);
  const m = meta ? Number(meta) : null;
  const isPos = v >= 0;
  const pctMeta = m && m !== 0 ? (v / m) * 100 : null;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{title}</div>
      <div className="text-xs text-slate-400 mb-2">{subtitle}</div>
      <div className="text-2xl font-bold" style={{ color: isPos ? "#0A2463" : "#dc2626" }}>
        {fmtBRL(v)}
      </div>
      {m != null && (
        <div className="text-xs text-slate-600 mt-1">
          Meta LDO: <strong>{fmtBRL(m)}</strong>
          {pctMeta != null && (
            <span className="ml-2 text-slate-500">({pctMeta.toFixed(1)}% atingido)</span>
          )}
        </div>
      )}
      {metaIndisponivel && (
        <div className="text-[11px] text-slate-500 mt-2 italic leading-snug">
          ℹ️ Meta LDO não retornada pela API SICONFI. A coluna existe no template oficial do RREO Anexo 06, mas o Tesouro Nacional não disponibiliza no endpoint público. Apenas o valor realizado fica acessível.
        </div>
      )}
      <div className="mt-3 text-[10px] uppercase tracking-wide text-slate-400">
        {fonte} · {ref}
      </div>
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
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            <AlertTriangle size={16} strokeWidth={2} aria-hidden /> Pontos de atenção
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
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            <Coins size={16} strokeWidth={2} aria-hidden /> Top 5 áreas em investimento ({topAreas[0]?.exercicio})
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
        <div className="inline-flex items-center gap-2 text-2xl md:text-3xl font-bold mb-1" style={{ color: fora_da_lei.length > 0 ? "#991B1B" : "#065F46" }}>
          {fora_da_lei.length === 0 ? (
            <>
              <Check size={28} strokeWidth={2.5} aria-hidden /> Cumprindo todos os limites legais
            </>
          ) : (
            <>
              <AlertTriangle size={28} strokeWidth={2.5} aria-hidden /> {fora_da_lei.length} indicador(es) fora do limite legal
            </>
          )}
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
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 mb-1">
            <BarChart3 size={16} strokeWidth={2} aria-hidden /> Promessa (LOA) vs Entregue por área-fim
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
                <span className="inline-flex items-center">{p.status === "PUBLICADO" ? <Check size={13} strokeWidth={2.5} aria-hidden /> : <X size={13} strokeWidth={2.5} aria-hidden />}</span>
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
  return (
    <SemDadosAviso
      fonte="RREO Anexo 02 (SICONFI / Tesouro Nacional)"
      descricao="Despesas por área-fim são extraídas do RREO Anexo 02 (Despesas por Função/Subfunção), que a prefeitura é obrigada a publicar bimestralmente no SICONFI por força da LRF (Art. 52). Cerca de 115 dos 645 municípios paulistas não publicam regularmente."
    />
  );
}

function SemDadosAviso({ fonte, descricao }: { fonte: string; descricao: string }) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const exemplos = [
    { cod: 3504503, nome: "Avaré" },
    { cod: 3518305, nome: "Guararema" },
    { cod: 3502101, nome: "Andradina" },
    { cod: 3509502, nome: "Campinas" },
  ];
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
      <div className="flex items-start gap-3">
        <div className="text-2xl flex-shrink-0">📭</div>
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-amber-900 mb-1 text-sm">
            Informação não disponível
          </h4>
          <p className="text-xs text-amber-800 mb-3">{descricao}</p>
          <div className="text-[10px] uppercase tracking-wide text-amber-700 mb-2 font-semibold">
            Fonte esperada · {fonte}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-amber-200">
            <span className="text-[10px] text-amber-700 mr-1 uppercase tracking-wide font-semibold self-center">Veja outro município:</span>
            {exemplos.map((m) => (
              <a
                key={m.cod}
                href={`${basePath}/municipio/${m.cod}`}
                className="px-2 py-1 bg-white border border-amber-300 rounded text-[11px] font-medium text-amber-900 hover:bg-amber-100"
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
