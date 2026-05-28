import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { regerarAlertas } from "../providencias/actions";
import { AlertCircle, AlertTriangle, Info, Check, RefreshCw, ArrowRight, Bell, Filter } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ cod: string }>;
  searchParams: Promise<{ nivel?: string; categoria?: string; status?: string }>;
}

interface AlertaRow {
  id: number;
  categoria: string | null;
  nivel: string;
  indicador: string;
  exercicio: number | null;
  periodo: number | null;
  mensagem: string;
  base_legal: string | null;
  status: string;
  valor_observado: string | null;
  limite_referencia: string | null;
  criado_em: Date | string;
}

const NIVEL_CONFIG: Record<string, { cor: string; bg: string; Icon: React.ElementType; label: string }> = {
  critico: { cor: "#dc2626", bg: "rgba(220,38,38,0.13)", Icon: AlertCircle, label: "Crítico" },
  atencao: { cor: "#d97706", bg: "rgba(217,119,6,0.13)", Icon: AlertTriangle, label: "Atenção" },
  informativo: { cor: "#0f4f8f", bg: "rgba(15,79,143,0.13)", Icon: Info, label: "Informativo" },
};

const CATEGORIA_LABEL: Record<string, string> = {
  lrf: "Limites LRF",
  educacao: "Educação",
  saude: "Saúde",
  fundeb: "FUNDEB",
  divida: "Dívida e caixa",
  planejamento: "Planejamento e LDO",
  externo: "Indicadores externos",
};

const STATUS_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  descartado: "Descartado",
};

export default async function AlertasPage({ params, searchParams }: PageProps) {
  const { cod } = await params;
  const sp = await searchParams;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  const filtroNivel = sp.nivel ?? "";
  const filtroCategoria = sp.categoria ?? "";
  const filtroStatus = sp.status ?? "aberto";

  let alertas: AlertaRow[] = [];
  let stats = { critico: 0, atencao: 0, informativo: 0, total: 0 };
  let categorias: Array<{ categoria: string; n: number }> = [];

  try {
    alertas = (await sql`
      SELECT id, categoria, nivel, indicador, exercicio, periodo, mensagem, base_legal,
             status, valor_observado, limite_referencia, criado_em
      FROM alertas
      WHERE cod_ibge = ${codNum}
        AND (${filtroNivel}::text = '' OR nivel = ${filtroNivel})
        AND (${filtroCategoria}::text = '' OR categoria = ${filtroCategoria})
        AND (${filtroStatus}::text = '' OR status = ${filtroStatus})
      ORDER BY
        CASE nivel WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END,
        criado_em DESC
      LIMIT 200
    `) as AlertaRow[];

    const s = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE nivel = 'critico' AND status = 'aberto')::int AS critico,
        COUNT(*) FILTER (WHERE nivel = 'atencao' AND status = 'aberto')::int AS atencao,
        COUNT(*) FILTER (WHERE nivel = 'informativo' AND status = 'aberto')::int AS informativo,
        COUNT(*) FILTER (WHERE status = 'aberto')::int AS total
      FROM alertas WHERE cod_ibge = ${codNum}
    `) as typeof stats[];
    if (s[0]) stats = s[0];

    categorias = (await sql`
      SELECT categoria, COUNT(*)::int AS n
      FROM alertas WHERE cod_ibge = ${codNum} AND status = 'aberto' AND categoria IS NOT NULL
      GROUP BY categoria ORDER BY n DESC
    `) as Array<{ categoria: string; n: number }>;
  } catch (e) {
    console.error("[alertas]", e);
  }

  async function regerarAction() {
    "use server";
    await regerarAlertas(codNum);
  }

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Módulo 9 · Alertas, providências e soluções</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
          <div>
            <h1
              className="font-bold"
              style={{ color: "var(--azul)", fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Alertas
            </h1>
            <p className="text-sm mt-1 max-w-3xl" style={{ color: "var(--cinza)" }}>
              Engine cruza indicadores fiscais, educacionais, de saúde e externos com a matriz legal e
              os parâmetros do município. Cada alerta pode virar uma providência rastreável.
            </p>
          </div>
          {perfil.podeCriarProvidencia && (
            <form action={regerarAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-colors hover:brightness-95"
                style={{ background: "var(--azul-2)", color: "white" }}
              >
                <RefreshCw size={16} strokeWidth={2.5} aria-hidden /> Regerar análise
              </button>
            </form>
          )}
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatChip label="Total abertos" valor={stats.total} cor="var(--azul)" />
        <StatChip label="Críticos" valor={stats.critico} cor={NIVEL_CONFIG.critico.cor} />
        <StatChip label="Em atenção" valor={stats.atencao} cor={NIVEL_CONFIG.atencao.cor} />
        <StatChip label="Informativos" valor={stats.informativo} cor={NIVEL_CONFIG.informativo.cor} />
      </div>

      {/* Filtros */}
      <Section title="Filtros" subtitle="Combine para focar em uma situação específica.">
        <div className="p-4 flex flex-wrap items-center gap-2 text-xs">
          <Filter size={14} strokeWidth={2} style={{ color: "var(--cinza)" }} aria-hidden />
          <FilterGroup label="Nível">
            <FilterLink href={pathOf(basePath, codNum, { ...sp, nivel: undefined })} active={!filtroNivel}>Todos</FilterLink>
            <FilterLink href={pathOf(basePath, codNum, { ...sp, nivel: "critico" })} active={filtroNivel === "critico"} cor={NIVEL_CONFIG.critico.cor}>Crítico</FilterLink>
            <FilterLink href={pathOf(basePath, codNum, { ...sp, nivel: "atencao" })} active={filtroNivel === "atencao"} cor={NIVEL_CONFIG.atencao.cor}>Atenção</FilterLink>
            <FilterLink href={pathOf(basePath, codNum, { ...sp, nivel: "informativo" })} active={filtroNivel === "informativo"} cor={NIVEL_CONFIG.informativo.cor}>Informativo</FilterLink>
          </FilterGroup>
          <span className="hidden md:inline" style={{ color: "var(--cinza)" }}>·</span>
          <FilterGroup label="Categoria">
            <FilterLink href={pathOf(basePath, codNum, { ...sp, categoria: undefined })} active={!filtroCategoria}>Todas</FilterLink>
            {categorias.map((c) => (
              <FilterLink
                key={c.categoria}
                href={pathOf(basePath, codNum, { ...sp, categoria: c.categoria })}
                active={filtroCategoria === c.categoria}
              >
                {CATEGORIA_LABEL[c.categoria] ?? c.categoria} <span style={{ opacity: 0.6 }}>· {c.n}</span>
              </FilterLink>
            ))}
          </FilterGroup>
          <span className="hidden md:inline" style={{ color: "var(--cinza)" }}>·</span>
          <FilterGroup label="Status">
            <FilterLink href={pathOf(basePath, codNum, { ...sp, status: "aberto" })} active={filtroStatus === "aberto"}>Abertos</FilterLink>
            <FilterLink href={pathOf(basePath, codNum, { ...sp, status: "em_andamento" })} active={filtroStatus === "em_andamento"}>Em andamento</FilterLink>
            <FilterLink href={pathOf(basePath, codNum, { ...sp, status: "concluido" })} active={filtroStatus === "concluido"}>Concluídos</FilterLink>
            <FilterLink href={pathOf(basePath, codNum, { ...sp, status: "" })} active={filtroStatus === ""}>Todos</FilterLink>
          </FilterGroup>
        </div>
      </Section>

      {/* Lista */}
      <Section
        title={`${alertas.length} alerta${alertas.length === 1 ? "" : "s"} ${alertas.length >= 200 ? "(mostrando primeiros 200)" : ""}`}
      >
        {alertas.length === 0 ? (
          stats.total === 0 ? (
            <EmptyOk />
          ) : (
            <Empty msg="Nenhum alerta corresponde aos filtros atuais." />
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {alertas.map((a) => {
              const cfg = NIVEL_CONFIG[a.nivel] ?? NIVEL_CONFIG.informativo;
              const { Icon } = cfg;
              return (
                <li key={a.id} className="p-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-3">
                    <span
                      className="inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0"
                      style={{ background: cfg.bg, color: cfg.cor }}
                      title={cfg.label}
                    >
                      <Icon size={18} strokeWidth={2} aria-hidden />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color: "var(--azul)" }}>
                        {a.mensagem}
                      </div>
                      <div className="text-xs mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "var(--cinza)" }}>
                        {a.categoria && (
                          <span
                            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                            style={{ background: "rgba(11,47,99,0.08)", color: "var(--azul)", letterSpacing: "0.05em" }}
                          >
                            {CATEGORIA_LABEL[a.categoria] ?? a.categoria}
                          </span>
                        )}
                        {a.base_legal && <span>{a.base_legal}</span>}
                        {a.exercicio && (
                          <span>{a.exercicio}{a.periodo ? `/B${a.periodo}` : ""}</span>
                        )}
                        <span className="capitalize">· {STATUS_LABEL[a.status] ?? a.status}</span>
                      </div>
                    </div>
                    {perfil.podeCriarProvidencia && a.status === "aberto" && (
                      <a
                        href={`${basePath}/municipio/${codNum}/providencias/novo?alerta=${a.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap flex-shrink-0"
                        style={{ background: "var(--verde-2)", color: "white" }}
                      >
                        Providência <ArrowRight size={12} aria-hidden />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {!perfil.podeCriarProvidencia && (
        <Placeholder
          titulo="Visualização somente leitura"
          descricao={`Perfil "${perfil.nome}" pode ver os alertas mas não criar providências nem regerar análise. Para isso, troque para Prefeito, Secretário ou Controle Interno no switcher no topo.`}
        />
      )}
    </div>
  );
}

function StatChip({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div
      className="p-4 rounded-2xl text-center"
      style={{ background: "white", border: "1px solid rgba(11,47,99,0.09)", boxShadow: "0 8px 22px rgba(11,47,99,0.06)" }}
    >
      <div className="text-3xl md:text-4xl font-bold" style={{ color: cor, letterSpacing: "-0.03em" }}>
        {valor}
      </div>
      <div className="text-xs uppercase font-semibold tracking-wider mt-1" style={{ color: "var(--cinza)" }}>
        {label}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      <span className="text-[10px] uppercase font-bold tracking-widest mr-1" style={{ color: "var(--cinza)", letterSpacing: "0.08em" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
  cor,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  cor?: string;
}) {
  return (
    <a
      href={href}
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
      style={{
        background: active ? (cor ?? "var(--azul)") : "rgba(11,47,99,0.06)",
        color: active ? "white" : (cor ?? "var(--azul)"),
        border: active ? "none" : "1px solid rgba(11,47,99,0.10)",
      }}
    >
      {children}
    </a>
  );
}

function EmptyOk() {
  return (
    <div className="px-6 py-10 text-center" style={{ color: "var(--cinza)" }}>
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-3"
        style={{ background: "rgba(29,138,67,0.13)", color: "var(--verde-2)" }}
      >
        <Check size={28} strokeWidth={2.5} aria-hidden />
      </div>
      <div className="text-base font-bold" style={{ color: "var(--azul)" }}>Município conforme</div>
      <div className="text-sm mt-1">Nenhum indicador disparou alerta. Cumprindo limites legais e tendências saudáveis.</div>
    </div>
  );
}

function pathOf(basePath: string, cod: number, sp: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  if (sp.nivel) params.set("nivel", sp.nivel);
  if (sp.categoria) params.set("categoria", sp.categoria);
  if (sp.status !== undefined) {
    if (sp.status === "") params.set("status", "");
    else params.set("status", sp.status);
  }
  const qs = params.toString();
  return `${basePath}/municipio/${cod}/alertas${qs ? "?" + qs : ""}`;
}
