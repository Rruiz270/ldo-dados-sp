import { sql } from "@/lib/db";
import {
  Gauge,
  ClipboardList,
  Scale,
  GraduationCap,
  Stethoscope,
  Wallet,
  BarChart3,
  AlertTriangle,
  Bell,
  CheckSquare,
  Building2,
  Settings2,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

export const dynamic = "force-dynamic";

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ cod: string }>;
}

interface ModuloItem { slug: string; label: string; Icon: LucideIcon; secao?: string }
const MODULOS: ModuloItem[] = [
  { slug: "",              label: "Painel preventivo",       Icon: Gauge,         secao: "Análise" },
  { slug: "alertas",       label: "Alertas",                  Icon: Bell,          secao: "Análise" },
  { slug: "providencias",  label: "Providências",             Icon: CheckSquare,   secao: "Análise" },
  { slug: "riscos",        label: "Riscos fiscais",           Icon: AlertTriangle, secao: "Análise" },

  { slug: "lrf",           label: "Limites da LRF",            Icon: Scale,          secao: "Indicadores" },
  { slug: "pessoal",       label: "Demonstrativo de Pessoal",  Icon: Users,          secao: "Indicadores" },
  { slug: "educacao",      label: "Educação e Fundeb",         Icon: GraduationCap,  secao: "Indicadores" },
  { slug: "saude",         label: "Saúde",                     Icon: Stethoscope,    secao: "Indicadores" },
  { slug: "divida",        label: "Dívida e caixa",            Icon: Wallet,         secao: "Indicadores" },
  { slug: "planejamento",  label: "Planejamento e LDO",        Icon: ClipboardList,  secao: "Indicadores" },
  { slug: "contexto",      label: "Contexto externo",          Icon: BarChart3,      secao: "Indicadores" },

  { slug: "cadastro",      label: "Cadastro institucional",    Icon: Building2,      secao: "Gestão" },
  { slug: "parametros",    label: "Parâmetros de alerta",      Icon: Settings2,      secao: "Gestão" },
  { slug: "importar",      label: "Importar dados",            Icon: Upload,         secao: "Gestão" },
];

const SECAO_COR: Record<string, string> = {
  Análise: "var(--grad-2)",
  Indicadores: "var(--grad-1)",
  Gestão: "linear-gradient(135deg,#a78bfa,#f472b6)",
};

export default async function MunicipioLayout({ children, params }: LayoutProps) {
  const { cod } = await params;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  let nome = "";
  let populacao: number | null = null;
  try {
    const rows = (await sql`
      SELECT nome, populacao FROM municipios WHERE cod_ibge = ${parseInt(cod, 10)} LIMIT 1
    `) as Array<{ nome: string; populacao: number | null }>;
    if (rows[0]) {
      nome = rows[0].nome;
      populacao = rows[0].populacao;
    }
  } catch {}

  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-9">
      <div className="mb-6 flex flex-col gap-3">
        <div className="text-xs uppercase font-semibold tracking-widest" style={{ color: "var(--txt3)" }}>
          <a href={`${basePath}/`} className="hover:underline" style={{ color: "var(--cyan)" }}>
            Município
          </a>
          <span className="mx-2">/</span>
          <span>{cod}</span>
        </div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <h1
            className="font-extrabold"
            style={{
              fontSize: "clamp(28px, 4vw, 44px)",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              background: "linear-gradient(90deg,#fff,#9bd8ff)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {nome || `Município ${cod}`}
          </h1>
          {populacao && (
            <span
              className="px-3 py-1.5 rounded-full text-xs font-bold inline-block w-fit"
              style={{
                background: "rgba(52,211,153,0.13)",
                color: "var(--verde)",
                border: "1px solid rgba(52,211,153,0.3)",
                letterSpacing: "0.06em",
              }}
            >
              {populacao.toLocaleString("pt-BR")} habitantes
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-5 md:gap-7">
        <aside className="md:sticky md:top-20 md:self-start md:max-h-[calc(100vh-100px)] md:overflow-auto rounded-[22px] p-3 md:p-4 glass">
          <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-visible">
            {(["Análise", "Indicadores", "Gestão"] as const).map((secao) => (
              <div key={secao} className="md:mb-3">
                <h3
                  className="hidden md:flex items-center gap-2 font-bold uppercase text-[10px] tracking-widest mt-3 mb-2 px-2"
                  style={{ color: "var(--txt3)", letterSpacing: "0.1em" }}
                >
                  <span style={{ width: 16, height: 3, borderRadius: 2, background: SECAO_COR[secao] }} />
                  {secao}
                </h3>
                {MODULOS.filter((m) => m.secao === secao).map(({ slug, label, Icon }) => {
                  const href = slug
                    ? `${basePath}/municipio/${cod}/${slug}`
                    : `${basePath}/municipio/${cod}`;
                  return (
                    <a
                      key={slug || "root"}
                      href={href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors"
                      style={{ color: "var(--txt2)" }}
                    >
                      <Icon size={17} strokeWidth={1.75} style={{ color: "var(--cyan)" }} aria-hidden />
                      <span>{label}</span>
                    </a>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <section className="min-w-0">{children}</section>
      </div>
    </div>
  );
}
