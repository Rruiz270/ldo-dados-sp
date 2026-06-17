import { sql } from "@/lib/db";
import { MunicipioSearch } from "@/components/MunicipioSearch";
import {
  Scale,
  ClipboardList,
  BarChart3,
  AlertTriangle,
  FileText,
  Crown,
  UserCog,
  ShieldCheck,
  BookOpen,
  Landmark,
  Search,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Row {
  cod_ibge: number;
  nome: string;
  populacao: number;
}

const PILARES: Array<{ titulo: string; Icon: LucideIcon; desc: string }> = [
  { titulo: "Gestão fiscal",         Icon: Scale,          desc: "Limites da LRF, RCL, despesa com pessoal." },
  { titulo: "Planejamento e LDO",    Icon: ClipboardList,  desc: "Metas fiscais, programas, ações, execução." },
  { titulo: "Indicadores externos",  Icon: BarChart3,      desc: "IDEB, IEGM, IGM, ambientais e socio." },
  { titulo: "Riscos e soluções",     Icon: AlertTriangle,  desc: "Diagnóstico preventivo e providências." },
  { titulo: "Relatórios gerenciais", Icon: FileText,       desc: "PDF, XLSX, exportação por perfil." },
];

const MENSAGENS = [
  {
    eyebrow: "Monitoramento preventivo",
    titulo: "Identifique tendências antes do fechamento do exercício",
    desc: "Acompanhe receita, despesa, metas LDO, RCL, pessoal, educação e saúde em tempo real — não no fim do ano.",
  },
  {
    eyebrow: "Riscos fiscais",
    titulo: "Classifique automaticamente situações regulares, atenção e crítico",
    desc: "Semáforo fiscal cruza indicadores LRF, LDO, SIOPS, SIOPE e INEP com a matriz legal aplicável.",
  },
  {
    eyebrow: "Decisão antecipada",
    titulo: "Converta dados em providências, planos de ação e relatórios",
    desc: "Cada alerta vem acompanhado de soluções possíveis com fundamentação legal e responsável designável.",
  },
];

async function loadMunicipios(): Promise<Row[]> {
  try {
    const rows = (await sql`
      SELECT cod_ibge, nome, populacao FROM municipios ORDER BY nome ASC
    `) as Row[];
    return rows;
  } catch (e) {
    console.error("[loadMunicipios] failed:", e);
    return [];
  }
}

const PILAR_GRAD = ["var(--grad-1)", "var(--grad-2)", "var(--grad-3)"];

export default async function Home() {
  const municipios = await loadMunicipios();

  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12">
      {/* ===== HERO ===== */}
      <section className="glass rounded-[24px] overflow-hidden relative" style={{ animation: "rise .5s cubic-bezier(.2,.8,.25,1)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-marca)" }} />
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-8 p-7 md:p-11 items-center">
          <div>
            <span
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase"
              style={{ background: "rgba(34,211,238,0.13)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.35)", letterSpacing: "0.08em" }}
            >
              Centro de comando · gestão pública municipal
            </span>
            <h1 className="font-extrabold leading-[1.04] mt-4 mb-3" style={{ fontSize: "clamp(34px, 5vw, 56px)", letterSpacing: "-0.04em" }}>
              <span style={{ background: "linear-gradient(90deg,#fff,#9bd8ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
                Radar Fiscal Municipal
              </span>{" "}
              <span style={{ background: "var(--grad-2)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>360</span>
            </h1>
            <p className="font-bold mb-4" style={{ color: "var(--verde)", fontSize: "clamp(17px, 2vw, 21px)" }}>
              Monitoramento inteligente para decisões seguras
            </p>
            <p className="text-base leading-relaxed" style={{ color: "var(--txt2)", maxWidth: 620 }}>
              Consolidação de dados fiscais, orçamentários, financeiros, legais e operacionais
              em um ambiente único de acompanhamento preventivo dos 645 municípios paulistas —
              <b style={{ color: "var(--txt)" }}> atualizado diariamente</b> a partir de 5 fontes oficiais.
            </p>

            <div className="flex flex-wrap gap-2 mt-6">
              {PILARES.map(({ titulo, Icon }) => (
                <span
                  key={titulo}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold"
                  style={{ background: "var(--card2)", border: "1px solid var(--linha)", color: "var(--txt2)" }}
                >
                  <Icon size={14} strokeWidth={2} aria-hidden style={{ color: "var(--cyan)" }} />
                  {titulo}
                </span>
              ))}
            </div>

            <div className="mt-7">
              <MunicipioSearch municipios={municipios} />
            </div>
          </div>

          {/* Índice síntese — donuts no estilo conecta */}
          <div className="grid grid-cols-3 gap-3 lg:gap-4">
            <ScoreDonut valor={645} sufixo="" cor="var(--cyan)" titulo="Municípios" sub="monitorados em SP" full />
            <ScoreDonut valor={5} sufixo="" cor="var(--verde)" titulo="Fontes" sub="oficiais integradas" />
            <ScoreDonut valor={11} sufixo="" cor="var(--ambar)" titulo="Módulos" sub="por município" />
          </div>
        </div>
      </section>

      {/* ===== MENSAGENS — cards com glowline ===== */}
      <section>
        <SubTitle>O que a plataforma faz</SubTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {MENSAGENS.map((m, i) => (
            <article key={m.eyebrow} className="glass rounded-2xl p-6 relative overflow-hidden">
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: PILAR_GRAD[i] }} />
              <span className="text-[11px] font-extrabold uppercase" style={{ color: "var(--cyan)", letterSpacing: "0.08em" }}>
                {m.eyebrow}
              </span>
              <h3 className="text-lg font-extrabold mt-2 mb-2" style={{ color: "var(--txt)", lineHeight: 1.25, letterSpacing: "-0.02em" }}>
                {m.titulo}
              </h3>
              <p className="text-sm" style={{ color: "var(--txt2)" }}>{m.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ===== PANORAMA — KPIs glass ===== */}
      <section>
        <SubTitle nota="cobertura atual · 645 municípios monitorados">Panorama de São Paulo</SubTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <Stat valor={municipios.length.toString()} label="Municípios monitorados" sub="todos os 645 de SP" cor="var(--cyan)" />
          <Stat valor="5" label="Fontes oficiais" sub="SICONFI · Audesp · SIOPE · SIOPS · INEP" cor="var(--verde)" />
          <Stat valor="11" label="Módulos" sub="LRF · LDO · Educação · Saúde · Riscos..." cor="var(--ambar)" />
          <Stat valor="diária" label="Atualização" sub="4h da manhã, automatizada" cor="var(--roxo)" />
        </div>
      </section>

      {/* ===== PERFIS ===== */}
      <section>
        <SubTitle nota="cada perfil acessa visões e relatórios adequados">Para quem é</SubTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
          {PERFIS.map(({ Icon, role, desc }) => (
            <div key={role} className="glass rounded-2xl p-5 transition-colors hover:border-white/20">
              <div
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
                style={{ background: "rgba(34,211,238,0.12)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.25)" }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="font-extrabold text-base" style={{ color: "var(--txt)" }}>{role}</div>
              <p className="text-xs mt-1" style={{ color: "var(--txt2)" }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const PERFIS: Array<{ Icon: LucideIcon; role: string; desc: string }> = [
  { Icon: Crown,        role: "Prefeito",               desc: "Visão estratégica da situação fiscal, administrativa e dos riscos do Município." },
  { Icon: UserCog,      role: "Secretário de Finanças", desc: "Controle da execução orçamentária, receita, despesa, caixa, metas fiscais e limites legais." },
  { Icon: ShieldCheck,  role: "Vereador / Controle",    desc: "Fiscalização preventiva, conformidade legal e acompanhamento de providências." },
  { Icon: BookOpen,     role: "Secretarias setoriais",  desc: "Acompanhamento de programas, ações, metas físicas e orçamento da pasta." },
  { Icon: Landmark,     role: "Câmara Municipal",       desc: "Acompanhamento legislativo, emendas, metas e execução orçamentária." },
  { Icon: Search,       role: "Tribunal de Contas",     desc: "Evidências de acompanhamento preventivo e histórico de providências." },
];

function SubTitle({ children, nota }: { children: React.ReactNode; nota?: string }) {
  return (
    <h2
      className="text-[11px] uppercase font-extrabold flex items-center gap-3"
      style={{ letterSpacing: "0.16em", color: "var(--cyan)" }}
    >
      {children}
      {nota && (
        <span className="font-semibold normal-case" style={{ fontSize: 10, color: "var(--txt3)", letterSpacing: "0.02em" }}>
          {nota}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg,var(--linha2),transparent)" }} />
    </h2>
  );
}

function Stat({ valor, label, sub, cor }: { valor: string; label: string; sub: string; cor: string }) {
  return (
    <div className="glass rounded-2xl p-5 relative overflow-hidden">
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: cor }} />
      <div className="text-3xl font-extrabold mb-1" style={{ color: cor, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>
        {valor}
      </div>
      <div className="text-xs font-semibold" style={{ color: "var(--txt)" }}>{label}</div>
      <div className="text-[11px] mt-1" style={{ color: "var(--txt3)" }}>{sub}</div>
    </div>
  );
}

/** Donut estilo conecta — anel conic-gradient com o valor central.
 *  Estático (server): a animação countup vem no rollout, aqui é a prova visual. */
function ScoreDonut({
  valor,
  sufixo,
  cor,
  titulo,
  sub,
  full,
}: {
  valor: number;
  sufixo: string;
  cor: string;
  titulo: string;
  sub: string;
  full?: boolean;
}) {
  const pct = full ? 100 : Math.min(100, valor * 8);
  return (
    <div className="glass rounded-2xl p-3 flex flex-col items-center text-center gap-2">
      <div
        className="relative grid place-items-center"
        style={{
          width: 84,
          height: 84,
          borderRadius: "50%",
          background: `conic-gradient(${cor} 0 ${pct}%, rgba(255,255,255,.08) 0)`,
        }}
      >
        <div style={{ position: "absolute", inset: 8, borderRadius: "50%", background: "var(--bg1)" }} />
        <span className="relative font-extrabold" style={{ fontSize: 22, color: "var(--txt)", fontVariantNumeric: "tabular-nums" }}>
          {valor.toLocaleString("pt-BR")}
          {sufixo}
        </span>
      </div>
      <div>
        <div className="text-xs font-bold" style={{ color: "var(--txt)" }}>{titulo}</div>
        <div className="text-[10px]" style={{ color: "var(--txt3)" }}>{sub}</div>
      </div>
    </div>
  );
}
