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

export default async function Home() {
  const municipios = await loadMunicipios();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-8">
      {/* Hero */}
      <section
        className="rounded-[32px]"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.96), rgba(244,249,255,0.96))",
          border: "1px solid rgba(11,47,99,0.08)",
          boxShadow: "var(--sombra)",
        }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-8 p-7 md:p-10 items-center">
          <div>
            <Eyebrow>Solução tecnológica · gestão pública municipal</Eyebrow>
            <h1
              className="font-bold leading-[1.05] mb-3"
              style={{ color: "var(--azul)", fontSize: "clamp(34px, 5vw, 58px)", letterSpacing: "-0.04em" }}
            >
              Radar Fiscal Municipal{" "}
              <span style={{ color: "var(--verde-2)" }}>360</span>
            </h1>
            <p
              className="font-bold mb-4"
              style={{ color: "var(--verde-2)", fontSize: "clamp(18px, 2vw, 22px)" }}
            >
              Monitoramento inteligente para decisões seguras
            </p>
            <p className="text-base md:text-lg leading-relaxed" style={{ color: "var(--cinza)" }}>
              Consolidação de dados fiscais, orçamentários, financeiros, legais e operacionais
              em um ambiente único de acompanhamento preventivo dos 645 municípios paulistas.
            </p>

            <div className="flex flex-wrap gap-2 mt-6">
              {PILARES.map(({ titulo, Icon }) => (
                <span
                  key={titulo}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold"
                  style={{
                    background: "#fff",
                    border: "1px solid rgba(11,47,99,0.10)",
                    color: "var(--azul)",
                  }}
                >
                  <Icon size={14} strokeWidth={2} aria-hidden />
                  {titulo}
                </span>
              ))}
            </div>

            <div className="mt-7">
              <MunicipioSearch municipios={municipios} />
            </div>
          </div>

          <div
            className="rounded-3xl p-6 md:p-8"
            style={{
              background: "white",
              border: "1px solid rgba(11,47,99,0.07)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.7)",
            }}
          >
            <img
              src={`${basePath}/brand/radar-360-full.png`}
              alt="Radar Fiscal 360 — Gestão Municipal"
              className="w-full h-auto rounded-2xl"
            />
          </div>
        </div>
      </section>

      {/* Mensagens centrais */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {MENSAGENS.map((m) => (
          <article
            key={m.eyebrow}
            className="p-6 rounded-[22px]"
            style={{
              background: "white",
              border: "1px solid rgba(11,47,99,0.09)",
              boxShadow: "0 12px 32px rgba(11,47,99,0.08)",
            }}
          >
            <Eyebrow small>{m.eyebrow}</Eyebrow>
            <h3 className="text-lg font-bold mt-2 mb-2" style={{ color: "var(--azul)", lineHeight: 1.25, letterSpacing: "-0.02em" }}>
              {m.titulo}
            </h3>
            <p className="text-sm" style={{ color: "var(--cinza)" }}>{m.desc}</p>
          </article>
        ))}
      </section>

      {/* Panorama atual */}
      <section
        className="p-7 md:p-9 rounded-[22px]"
        style={{
          background: "rgba(255,255,255,0.94)",
          border: "1px solid rgba(11,47,99,0.08)",
          boxShadow: "0 12px 32px rgba(11,47,99,0.08)",
        }}
      >
        <h2
          className="font-bold mb-1"
          style={{
            color: "var(--azul)",
            fontSize: "28px",
            letterSpacing: "-0.03em",
            borderLeft: "6px solid var(--verde)",
            paddingLeft: "14px",
            lineHeight: 1.2,
          }}
        >
          Panorama de São Paulo
        </h2>
        <p className="text-sm mt-2 mb-5" style={{ color: "var(--cinza)" }}>
          Cobertura atual da plataforma · 645 municípios monitorados
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat valor={municipios.length.toString()} label="Municípios monitorados" sub="todos os 645 de SP" />
          <Stat valor="5" label="Fontes oficiais" sub="SICONFI · Audesp · SIOPE · SIOPS · INEP" />
          <Stat valor="11" label="Módulos" sub="LRF · LDO · Educação · Saúde · Riscos · Alertas..." />
          <Stat valor="diária" label="Atualização" sub="4h da manhã, automatizada" />
        </div>
      </section>

      {/* Como funciona */}
      <section
        className="p-7 md:p-9 rounded-[22px]"
        style={{
          background: "rgba(255,255,255,0.94)",
          border: "1px solid rgba(11,47,99,0.08)",
          boxShadow: "0 12px 32px rgba(11,47,99,0.08)",
        }}
      >
        <h2
          className="font-bold mb-1"
          style={{
            color: "var(--azul)",
            fontSize: "28px",
            letterSpacing: "-0.03em",
            borderLeft: "6px solid var(--verde)",
            paddingLeft: "14px",
            lineHeight: 1.2,
          }}
        >
          Para quem é
        </h2>
        <p className="text-sm mt-2 mb-5" style={{ color: "var(--cinza)" }}>
          Cada perfil acessa visões e relatórios adequados à sua responsabilidade.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PERFIS.map(({ Icon, role, desc }) => (
            <div
              key={role}
              className="p-5 rounded-2xl"
              style={{ background: "white", border: "1px solid rgba(11,47,99,0.09)", boxShadow: "0 8px 22px rgba(11,47,99,0.06)" }}
            >
              <div
                className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
                style={{ background: "rgba(11,47,99,0.07)", color: "var(--azul)" }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="font-bold text-base" style={{ color: "var(--azul)" }}>{role}</div>
              <p className="text-xs mt-1" style={{ color: "var(--cinza)" }}>{desc}</p>
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

function Eyebrow({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={`inline-block font-extrabold uppercase rounded-full ${small ? "text-[11px] px-2.5 py-1" : "text-xs px-3 py-1.5"}`}
      style={{
        background: "rgba(78,181,31,0.13)",
        color: "var(--verde-2)",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </span>
  );
}

function Stat({ valor, label, sub }: { valor: string; label: string; sub: string }) {
  return (
    <div
      className="p-5 rounded-2xl"
      style={{ background: "white", border: "1px solid rgba(11,47,99,0.09)", boxShadow: "0 8px 22px rgba(11,47,99,0.06)" }}
    >
      <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--cinza)" }}>{label}</div>
      <div className="text-3xl font-bold my-1" style={{ color: "var(--azul)", letterSpacing: "-0.03em" }}>
        {valor}
      </div>
      <div className="text-xs" style={{ color: "var(--cinza)" }}>{sub}</div>
    </div>
  );
}
