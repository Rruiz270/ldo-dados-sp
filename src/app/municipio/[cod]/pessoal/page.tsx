import { sql } from "@/lib/db";
import { Users, Scale, TrendingUp, Building2, GraduationCap } from "lucide-react";
import { SEMAFORO, faixaLimiteMaximo } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PessoalRow {
  exercicio: number;
  periodo: number;
  periodicidade: string;
  valor: number; // % da RCL
  limite_legal: number; // 60
  pct_do_limite: number; // valor/limite*100
  fonte: string;
}

const FAIXA_LABEL: Record<string, { txt: string; cor: string }> = {
  verde: { txt: "Situação confortável", cor: SEMAFORO.verde },
  azul: { txt: "Acompanhamento preventivo", cor: SEMAFORO.azul },
  amarelo: { txt: "Limite de alerta (art. 59, LRF)", cor: SEMAFORO.amarelo },
  vermelho: { txt: "Limite prudencial (art. 22, LRF)", cor: SEMAFORO.vermelho },
};

export default async function PessoalPage({ params }: { params: Promise<{ cod: string }> }) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);

  let serie: PessoalRow[] = [];
  try {
    serie = (await sql`
      SELECT exercicio, periodo, periodicidade, valor, limite_legal, pct_do_limite, fonte
      FROM indicadores_lrf
      WHERE cod_ibge = ${codNum} AND indicador = 'pessoal' AND valor IS NOT NULL
      ORDER BY exercicio DESC, periodo DESC
    `) as PessoalRow[];
  } catch {
    // banco indisponível
  }

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-[11px] uppercase font-extrabold flex items-center gap-2" style={{ letterSpacing: "0.16em", color: "var(--cyan)" }}>
          <Users size={14} strokeWidth={2.2} /> Demonstrativo de Gasto com Pessoal
          <span className="font-semibold normal-case" style={{ fontSize: 10, color: "var(--txt3)" }}>módulo 4.3 · RGF · LRF arts. 18-23</span>
        </h2>
        <p className="text-sm mt-2" style={{ color: "var(--txt2)", maxWidth: 760 }}>
          Despesa total com pessoal confrontada com os limites da LRF, evidenciando o percentual da
          Receita Corrente Líquida (RCL) comprometido e a posição frente aos limites legal, prudencial e de alerta.
        </p>
      </header>

      {serie.length === 0 ? (
        <SemDados />
      ) : (
        <PessoalConteudo serie={serie} />
      )}

      {/* 4.3.2 / 4.3.3 — dependem de dado por órgão / magistério */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProximoCard
          Icon={Building2}
          titulo="Comparativo por órgão (4.3.2)"
          desc="Participação de cada órgão na folha e evolução. Requer despesa de pessoal desagregada por órgão — ainda não disponível na base atual (Audesp traz o consolidado municipal)."
        />
        <ProximoCard
          Icon={GraduationCap}
          titulo="Peso do magistério na folha (4.3.3)"
          desc="Participação do magistério na folha e aplicação do FUNDEB (mín. 70%, EC 108/2020). Requer separar a despesa de pessoal da educação — pendente de fonte desagregada."
        />
      </div>
    </div>
  );
}

function PessoalConteudo({ serie }: { serie: PessoalRow[] }) {
  const atual = serie[0];
  const valor = Number(atual.valor); // % da RCL
  const limite = Number(atual.limite_legal); // 60
  const prudencial = limite * 0.95; // 57
  const alerta = limite * 0.9; // 54
  const pctLim = Number(atual.pct_do_limite);
  const faixa = faixaLimiteMaximo(pctLim);
  const info = FAIXA_LABEL[faixa];
  const periodoLabel = atual.periodicidade === "A" ? `${atual.exercicio}` : `${atual.exercicio}/${atual.periodicidade}${atual.periodo}`;

  // escala da barra: 0 → limite*1.1 (dá folga visual acima do teto)
  const escalaMax = limite * 1.1;
  const pos = (v: number) => `${Math.min(100, (v / escalaMax) * 100)}%`;

  // série histórica (mais antigo → recente) p/ barras
  const hist = [...serie].reverse();
  const maxHist = Math.max(...hist.map((h) => Number(h.valor)), limite);

  return (
    <>
      {/* Card principal — % atual + faixa + barra com marcadores */}
      <section className="glass rounded-2xl p-6 relative overflow-hidden">
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: info.cor }} />
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-6">
          <div>
            <div className="text-[11px] uppercase font-bold tracking-wide" style={{ color: "var(--txt3)" }}>
              Despesa com pessoal / RCL
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-extrabold" style={{ color: info.cor, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
                {valor.toFixed(2)}%
              </span>
              <span className="text-sm font-bold px-2.5 py-1 rounded-lg" style={{ color: info.cor, background: "rgba(255,255,255,0.05)", border: `1px solid ${info.cor}55` }}>
                {info.txt}
              </span>
            </div>
            <div className="text-xs mt-1" style={{ color: "var(--txt3)" }}>
              {atual.fonte} · {periodoLabel} · {pctLim.toFixed(1)}% do limite legal consumido
            </div>
          </div>
        </div>

        {/* barra com marcadores de alerta/prudencial/legal */}
        <div className="relative" style={{ marginTop: 38, marginBottom: 28 }}>
          <div style={{ height: 14, borderRadius: 8, background: "rgba(255,255,255,0.07)", position: "relative", overflow: "visible" }}>
            <div style={{ height: "100%", width: pos(valor), borderRadius: 8, background: `linear-gradient(90deg, ${info.cor}99, ${info.cor})`, boxShadow: `0 0 14px ${info.cor}66`, transition: "width 1s" }} />
            <Marker left={pos(alerta)} cor={SEMAFORO.amarelo} label={`Alerta ${alerta.toFixed(0)}%`} />
            <Marker left={pos(prudencial)} cor={SEMAFORO.vermelho} label={`Prudencial ${prudencial.toFixed(0)}%`} />
            <Marker left={pos(limite)} cor="#fff" label={`Legal ${limite.toFixed(0)}%`} strong />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-8">
          <LimiteBox titulo="Limite de alerta" valor={`${alerta.toFixed(0)}%`} cor={SEMAFORO.amarelo} nota="90% do limite · art. 59" />
          <LimiteBox titulo="Limite prudencial" valor={`${prudencial.toFixed(0)}%`} cor={SEMAFORO.vermelho} nota="95% do limite · art. 22 (veda aumento)" />
          <LimiteBox titulo="Limite legal" valor={`${limite.toFixed(0)}%`} cor="var(--txt)" nota="art. 19, III · Município" />
        </div>
      </section>

      {/* Evolução histórica */}
      {hist.length > 1 && (
        <section className="glass rounded-2xl p-6">
          <h3 className="text-[11px] uppercase font-extrabold flex items-center gap-2 mb-5" style={{ letterSpacing: "0.12em", color: "var(--cyan)" }}>
            <TrendingUp size={14} strokeWidth={2.2} /> Evolução da despesa com pessoal
          </h3>
          <div className="flex items-end gap-2" style={{ height: 180 }}>
            {hist.map((h) => {
              const v = Number(h.valor);
              const altura = Math.max(4, (v / (maxHist * 1.05)) * 150);
              const f = faixaLimiteMaximo(Number(h.pct_do_limite));
              const cor = SEMAFORO[f];
              return (
                <div key={`${h.exercicio}-${h.periodo}`} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${h.exercicio}: ${v.toFixed(2)}%`}>
                  <span className="text-[10px] font-bold" style={{ color: "var(--txt2)", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(0)}</span>
                  <div style={{ width: "100%", maxWidth: 38, height: altura, borderRadius: "6px 6px 0 0", background: `linear-gradient(180deg, ${cor}, ${cor}66)` }} />
                  <span className="text-[10px]" style={{ color: "var(--txt3)" }}>{h.exercicio}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-4" style={{ color: "var(--txt3)" }}>
            % da despesa com pessoal sobre a RCL por exercício. Cor segue o semáforo fiscal (§8.1). Limite legal: {limite.toFixed(0)}% da RCL.
          </p>
        </section>
      )}
    </>
  );
}

function Marker({ left, cor, label, strong }: { left: string; cor: string; label: string; strong?: boolean }) {
  return (
    <div style={{ position: "absolute", left, top: -6, bottom: -6, width: strong ? 2.5 : 2, background: cor, opacity: strong ? 0.95 : 0.7, borderRadius: 2 }}>
      <span style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: 9.5, whiteSpace: "nowrap", color: cor, fontWeight: 700 }}>
        {label}
      </span>
    </div>
  );
}

function LimiteBox({ titulo, valor, cor, nota }: { titulo: string; valor: string; cor: string; nota: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--linha)" }}>
      <div className="text-[10px] uppercase font-bold tracking-wide" style={{ color: "var(--txt3)" }}>{titulo}</div>
      <div className="text-2xl font-extrabold my-0.5" style={{ color: cor, fontVariantNumeric: "tabular-nums" }}>{valor}</div>
      <div className="text-[10px]" style={{ color: "var(--txt3)" }}>{nota}</div>
    </div>
  );
}

function ProximoCard({ Icon, titulo, desc }: { Icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>; titulo: string; desc: string }) {
  return (
    <div className="glass rounded-2xl p-5" style={{ opacity: 0.85 }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={18} strokeWidth={1.9} style={{ color: "var(--txt3)" }} />
        <span className="font-bold text-sm" style={{ color: "var(--txt)" }}>{titulo}</span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded ml-auto" style={{ color: "var(--ambar)", background: "rgba(251,191,36,0.12)" }}>aguarda dado</span>
      </div>
      <p className="text-xs" style={{ color: "var(--txt2)" }}>{desc}</p>
    </div>
  );
}

function SemDados() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return (
    <div className="glass rounded-2xl p-6" style={{ borderLeft: "3px solid var(--ambar)" }}>
      <div className="flex items-start gap-3">
        <Scale size={22} strokeWidth={1.9} style={{ color: "var(--ambar)" }} />
        <div className="flex-1">
          <h4 className="font-bold text-sm mb-1" style={{ color: "var(--txt)" }}>Demonstrativo de pessoal indisponível</h4>
          <p className="text-xs mb-3" style={{ color: "var(--txt2)" }}>
            O indicador de despesa com pessoal é apurado pelo TCE-SP a partir do Audesp. A
            <b style={{ color: "var(--txt)" }}> capital paulista não está no Audesp</b> (é fiscalizada pelo TCM-SP),
            e cerca de 115 municípios não enviam os dados regularmente.
          </p>
          <a href={`${basePath}/municipio/3509502/pessoal`} className="text-xs font-semibold px-3 py-1.5 rounded-lg inline-block" style={{ color: "var(--cyan)", border: "1px solid var(--linha2)" }}>
            Ver exemplo: Campinas →
          </a>
        </div>
      </div>
    </div>
  );
}
