import { sql } from "@/lib/db";
import { Section, Eyebrow } from "@/components/ModuloUI";
import {
  AlertTriangle,
  AlertCircle,
  Info,
  Check,
  Bell,
  ClipboardList,
  Building2,
  ArrowRight,
} from "lucide-react";

interface Props {
  codIbge: number;
  basePath: string;
  podeCriarProvidencia: boolean;
}

interface AlertaRow {
  id: number;
  categoria: string | null;
  nivel: "informativo" | "atencao" | "critico" | string;
  indicador: string;
  mensagem: string;
  base_legal: string | null;
  valor_observado: string | null;
  limite_referencia: string | null;
}

interface PainelStats {
  criticos: number;
  atencao: number;
  informativos: number;
  total_abertos: number;
  categorias_afetadas: number;
}

interface ProvidenciaRow {
  id: number;
  descricao: string;
  status: string;
  prazo: Date | string | null;
}

interface CadastroSnapshot {
  orgaos: number;
  programas: number;
  acoes: number;
  metas_fiscais: number;
  responsaveis: number;
}

export async function PainelPreventivo({ codIbge, basePath, podeCriarProvidencia }: Props) {
  let stats: PainelStats = {
    criticos: 0,
    atencao: 0,
    informativos: 0,
    total_abertos: 0,
    categorias_afetadas: 0,
  };
  let alertasTop: AlertaRow[] = [];
  let alertasPorCat: Array<{ categoria: string; n: number; criticos: number }> = [];
  let providencias: ProvidenciaRow[] = [];
  let cadastro: CadastroSnapshot = { orgaos: 0, programas: 0, acoes: 0, metas_fiscais: 0, responsaveis: 0 };

  try {
    const rows = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE nivel = 'critico' AND status = 'aberto')::int AS criticos,
        COUNT(*) FILTER (WHERE nivel = 'atencao' AND status = 'aberto')::int AS atencao,
        COUNT(*) FILTER (WHERE nivel = 'informativo' AND status = 'aberto')::int AS informativos,
        COUNT(*) FILTER (WHERE status = 'aberto')::int AS total_abertos,
        COUNT(DISTINCT categoria) FILTER (WHERE status = 'aberto')::int AS categorias_afetadas
      FROM alertas WHERE cod_ibge = ${codIbge}
    `) as PainelStats[];
    stats = rows[0] ?? stats;

    alertasTop = (await sql`
      SELECT id, categoria, nivel, indicador, mensagem, base_legal, valor_observado, limite_referencia
      FROM alertas
      WHERE cod_ibge = ${codIbge} AND status = 'aberto'
      ORDER BY CASE nivel WHEN 'critico' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END,
               criado_em DESC
      LIMIT 5
    `) as AlertaRow[];

    alertasPorCat = (await sql`
      SELECT categoria, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE nivel = 'critico')::int AS criticos
      FROM alertas
      WHERE cod_ibge = ${codIbge} AND status = 'aberto' AND categoria IS NOT NULL
      GROUP BY categoria ORDER BY criticos DESC, n DESC
    `) as Array<{ categoria: string; n: number; criticos: number }>;

    providencias = (await sql`
      SELECT id, descricao, status, prazo
      FROM providencias
      WHERE cod_ibge = ${codIbge} AND status IN ('pendente', 'em_andamento')
      ORDER BY prazo NULLS LAST, criado_em DESC LIMIT 5
    `) as ProvidenciaRow[];

    const cadRow = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM orgaos WHERE cod_ibge = ${codIbge}) AS orgaos,
        (SELECT COUNT(*)::int FROM programas WHERE cod_ibge = ${codIbge}) AS programas,
        (SELECT COUNT(*)::int FROM acoes a JOIN programas p ON p.id = a.programa_id WHERE p.cod_ibge = ${codIbge}) AS acoes,
        (SELECT COUNT(*)::int FROM ldo_metas_fiscais WHERE cod_ibge = ${codIbge}) AS metas_fiscais,
        (SELECT COUNT(*)::int FROM orgaos WHERE cod_ibge = ${codIbge} AND responsavel IS NOT NULL) AS responsaveis
    `) as CadastroSnapshot[];
    cadastro = cadRow[0] ?? cadastro;
  } catch (e) {
    console.error("[PainelPreventivo]", e);
  }

  const cadastroCompleto = cadastro.orgaos > 0 && cadastro.responsaveis > 0;

  return (
    <div className="space-y-6">
      {/* 4 cards principais — semáforo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <SemaforoCard
          tipo="critico"
          quantidade={stats.criticos}
          titulo="Indicadores críticos"
          subtitulo="Exigem providência imediata"
        />
        <SemaforoCard
          tipo="atencao"
          quantidade={stats.atencao}
          titulo="Em atenção"
          subtitulo="Tendência negativa, análise preventiva"
        />
        <SemaforoCard
          tipo="informativo"
          quantidade={stats.informativos}
          titulo="Informativos"
          subtitulo="Dados de contexto e tendências"
        />
        <SemaforoCard
          tipo="regular"
          quantidade={stats.total_abertos === 0 ? 1 : 0}
          titulo="Cumprindo limites"
          subtitulo={stats.total_abertos === 0 ? "Sem alertas abertos" : `${stats.categorias_afetadas} áreas afetadas`}
        />
      </div>

      {/* Top alertas + mapa de risco lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        <Section
          title="Alertas pendentes"
          subtitle={stats.total_abertos > 0
            ? `Os ${alertasTop.length} mais críticos. Total aberto: ${stats.total_abertos}.`
            : "Sem alertas — indicadores dentro dos limites legais."}
        >
          {alertasTop.length === 0 ? (
            <EmptyOk msg="Tudo conforme. Município sem alertas abertos no momento." />
          ) : (
            <ul>
              {alertasTop.map((a) => (
                <li key={a.id} className="px-4 py-3 border-b border-slate-100 last:border-0 flex items-start gap-3">
                  <NivelBadge nivel={a.nivel} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: "var(--azul)" }}>
                      {a.mensagem}
                    </div>
                    <div className="text-xs mt-1 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "var(--cinza)" }}>
                      {a.categoria && <CategoriaChip categoria={a.categoria} />}
                      {a.base_legal && <span>{a.base_legal}</span>}
                    </div>
                  </div>
                  {podeCriarProvidencia && (
                    <a
                      href={`${basePath}/municipio/${codIbge}/providencias/novo?alerta=${a.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap"
                      style={{ background: "var(--verde-2)", color: "white" }}
                    >
                      Providência <ArrowRight size={12} aria-hidden />
                    </a>
                  )}
                </li>
              ))}
              <li className="px-4 py-2 text-right">
                <a
                  href={`${basePath}/municipio/${codIbge}/alertas`}
                  className="text-xs font-bold inline-flex items-center gap-1 hover:underline"
                  style={{ color: "var(--azul-2)" }}
                >
                  Ver todos os {stats.total_abertos} alertas <ArrowRight size={12} aria-hidden />
                </a>
              </li>
            </ul>
          )}
        </Section>

        <Section title="Mapa de risco por área" subtitle="Distribuição dos alertas abertos por categoria.">
          {alertasPorCat.length === 0 ? (
            <EmptyOk msg="Sem alertas distribuídos por área." />
          ) : (
            <div className="p-4 space-y-3">
              {alertasPorCat.map((c) => {
                const max = Math.max(...alertasPorCat.map((x) => x.n));
                const pct = (c.n / max) * 100;
                return (
                  <div key={c.categoria}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold" style={{ color: "var(--azul)" }}>
                        {CATEGORIA_LABELS[c.categoria] ?? c.categoria}
                      </span>
                      <span style={{ color: "var(--cinza)" }}>
                        {c.n} {c.criticos > 0 && <strong style={{ color: "#dc2626" }}>· {c.criticos} crítico(s)</strong>}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(11,47,99,0.08)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: c.criticos > 0 ? "#dc2626" : "var(--azul-2)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Providências + Status do cadastro */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section
          title="Providências em aberto"
          subtitle={providencias.length > 0
            ? `${providencias.length} providência(s) em andamento.`
            : "Nenhuma providência cadastrada."}
        >
          {providencias.length === 0 ? (
            <CtaModulo
              icone={<ClipboardList size={24} strokeWidth={1.75} />}
              titulo="Nenhuma providência registrada"
              descricao="Quando um alerta é identificado, o gestor pode designar responsável, prazo e evidências. Permite acompanhar o andamento até a resolução."
              cta={podeCriarProvidencia ? { href: `${basePath}/municipio/${codIbge}/providencias`, label: "Abrir módulo de providências" } : undefined}
            />
          ) : (
            <ul>
              {providencias.map((p) => (
                <li key={p.id} className="px-4 py-3 border-b border-slate-100 last:border-0">
                  <div className="text-sm font-semibold" style={{ color: "var(--azul)" }}>{p.descricao}</div>
                  <div className="text-xs mt-1 flex items-center gap-3" style={{ color: "var(--cinza)" }}>
                    <span className="capitalize font-semibold">{p.status.replace(/_/g, " ")}</span>
                    {p.prazo && <span>· Prazo: {fmtData(p.prazo)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Cadastro institucional"
          subtitle="Estado do Módulo 1 — base para cálculos personalizados e parametrização de alertas."
        >
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3 mb-4">
              <ItemCadastro label="Órgãos" valor={cadastro.orgaos} />
              <ItemCadastro label="Responsáveis" valor={cadastro.responsaveis} />
              <ItemCadastro label="Programas" valor={cadastro.programas} />
              <ItemCadastro label="Ações" valor={cadastro.acoes} />
              <ItemCadastro label="Metas LDO" valor={cadastro.metas_fiscais} />
            </div>
            {!cadastroCompleto && (
              <CtaModulo
                icone={<Building2 size={24} strokeWidth={1.75} />}
                titulo="Complete o cadastro institucional"
                descricao="Sem cadastrar órgãos, programas e responsáveis, o sistema usa apenas dados externos. Cadastros próprios permitem alertas personalizados, providências com responsável e relatórios por órgão."
                cta={{ href: `${basePath}/municipio/${codIbge}/cadastro`, label: "Iniciar cadastro" }}
              />
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Sub-componentes
// -----------------------------------------------------------------

const NIVEL_CONFIG: Record<string, { cor: string; bg: string; Icon: React.ElementType; label: string }> = {
  critico: { cor: "#dc2626", bg: "rgba(220,38,38,0.13)", Icon: AlertCircle, label: "Crítico" },
  atencao: { cor: "#d97706", bg: "rgba(217,119,6,0.13)", Icon: AlertTriangle, label: "Atenção" },
  informativo: { cor: "#0f4f8f", bg: "rgba(15,79,143,0.13)", Icon: Info, label: "Informativo" },
  regular: { cor: "#1d8a43", bg: "rgba(29,138,67,0.13)", Icon: Check, label: "Regular" },
};

function SemaforoCard({
  tipo,
  quantidade,
  titulo,
  subtitulo,
}: {
  tipo: "critico" | "atencao" | "informativo" | "regular";
  quantidade: number;
  titulo: string;
  subtitulo: string;
}) {
  const cfg = NIVEL_CONFIG[tipo];
  const { Icon } = cfg;
  return (
    <div
      className="p-4 rounded-2xl"
      style={{
        background: "white",
        border: "1px solid rgba(11,47,99,0.09)",
        boxShadow: "0 8px 22px rgba(11,47,99,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl"
          style={{ background: cfg.bg, color: cfg.cor }}
        >
          <Icon size={20} strokeWidth={2} aria-hidden />
        </span>
        <span
          className="text-3xl md:text-4xl font-bold"
          style={{ color: cfg.cor, letterSpacing: "-0.04em" }}
        >
          {quantidade}
        </span>
      </div>
      <div className="text-sm font-bold" style={{ color: "var(--azul)" }}>
        {titulo}
      </div>
      <div className="text-xs mt-0.5" style={{ color: "var(--cinza)" }}>
        {subtitulo}
      </div>
    </div>
  );
}

function NivelBadge({ nivel }: { nivel: string }) {
  const cfg = NIVEL_CONFIG[nivel] ?? NIVEL_CONFIG.informativo;
  const { Icon } = cfg;
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
      style={{ background: cfg.bg, color: cfg.cor }}
      title={cfg.label}
    >
      <Icon size={14} strokeWidth={2.2} aria-hidden />
    </span>
  );
}

const CATEGORIA_LABELS: Record<string, string> = {
  lrf: "Limites LRF",
  educacao: "Educação",
  saude: "Saúde",
  fundeb: "FUNDEB",
  divida: "Dívida e caixa",
  planejamento: "Planejamento e LDO",
  externo: "Indicadores externos",
};

function CategoriaChip({ categoria }: { categoria: string }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
      style={{
        background: "rgba(11,47,99,0.08)",
        color: "var(--azul)",
        letterSpacing: "0.05em",
      }}
    >
      {CATEGORIA_LABELS[categoria] ?? categoria}
    </span>
  );
}

function ItemCadastro({ label, valor }: { label: string; valor: number }) {
  return (
    <div
      className="p-3 rounded-xl text-center"
      style={{ background: "rgba(11,47,99,0.04)", border: "1px solid rgba(11,47,99,0.06)" }}
    >
      <div className="text-2xl font-bold" style={{ color: valor > 0 ? "var(--verde-2)" : "var(--cinza)" }}>
        {valor}
      </div>
      <div className="text-xs" style={{ color: "var(--cinza)" }}>
        {label}
      </div>
    </div>
  );
}

function EmptyOk({ msg }: { msg: string }) {
  return (
    <div className="px-4 py-6 text-center" style={{ color: "var(--cinza)" }}>
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-full mb-2"
        style={{ background: "rgba(29,138,67,0.13)", color: "var(--verde-2)" }}
      >
        <Check size={20} strokeWidth={2.5} aria-hidden />
      </div>
      <div className="text-sm">{msg}</div>
    </div>
  );
}

function CtaModulo({
  icone,
  titulo,
  descricao,
  cta,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(135deg, rgba(11,47,99,0.04), rgba(78,181,31,0.05))",
        border: "1px dashed rgba(11,47,99,0.18)",
      }}
    >
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3"
        style={{ background: "rgba(11,47,99,0.08)", color: "var(--azul-2)" }}
      >
        {icone}
      </div>
      <div className="font-bold text-sm" style={{ color: "var(--azul)" }}>
        {titulo}
      </div>
      <div className="text-xs mt-1 mb-3" style={{ color: "var(--cinza)" }}>
        {descricao}
      </div>
      {cta && (
        <a
          href={cta.href}
          className="inline-flex items-center gap-1 text-xs font-bold"
          style={{ color: "var(--verde-2)" }}
        >
          {cta.label} <ArrowRight size={12} aria-hidden />
        </a>
      )}
    </div>
  );
}

function fmtData(d: Date | string): string {
  if (d instanceof Date) return d.toLocaleDateString("pt-BR");
  return String(d).slice(0, 10).split("-").reverse().join("/");
}
