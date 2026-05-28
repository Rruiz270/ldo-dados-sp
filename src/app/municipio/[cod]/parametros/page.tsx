import { sql } from "@/lib/db";
import { Section, Eyebrow, Empty, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { atualizarParametro, resetarParaDefault } from "./actions";
import { Settings2, RotateCcw, Save, Info } from "lucide-react";
import { regerarAlertas } from "../providencias/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface ParamRow {
  indicador: string;
  limite_atencao: string;
  limite_critico: string;
  customizado: boolean;
  observacao: string | null;
  atualizado_em: Date | string | null;
}

const INDICADORES_META: Record<string, {
  label: string;
  tipo: "max" | "min" | "delta";
  base: string;
  desc: string;
  default: { atencao: number; critico: number };
}> = {
  pessoal: {
    label: "Despesa com pessoal (Executivo)",
    tipo: "max",
    base: "LRF Art. 19 III · 60% RCL",
    desc: "Percentual do limite legal (60% RCL) que dispara cada nível. Default: 90% = atenção, 95% = crítico (prudencial LRF).",
    default: { atencao: 90, critico: 95 },
  },
  educacao: {
    label: "Aplicação em educação (MDE)",
    tipo: "min",
    base: "CF/88 Art. 212 · 25% receita impostos",
    desc: "Percentual do mínimo legal (25%). Default: 95% = atenção, 100% = crítico (ou seja, atenção quando aplicar entre 25-26.25%).",
    default: { atencao: 95, critico: 100 },
  },
  saude: {
    label: "Aplicação em saúde (ASPS)",
    tipo: "min",
    base: "LC 141/2012 Art. 7º · 15% receita impostos",
    desc: "Percentual do mínimo legal (15%). Default: 95% = atenção, 100% = crítico.",
    default: { atencao: 95, critico: 100 },
  },
  fundeb_remuneracao: {
    label: "FUNDEB — remuneração profissionais",
    tipo: "min",
    base: "Lei 14.113/2020 Art. 26 · mínimo 70%",
    desc: "Percentual do mínimo (70%). Default: 95% = atenção, 100% = crítico.",
    default: { atencao: 95, critico: 100 },
  },
  dcl: {
    label: "Dívida Consolidada Líquida",
    tipo: "max",
    base: "Res. SF 40/2001 · 120% RCL",
    desc: "Percentual do limite máximo (120% RCL). Default: 85% = atenção, 95% = crítico.",
    default: { atencao: 85, critico: 95 },
  },
  resultado_primario: {
    label: "Resultado primário vs meta LDO",
    tipo: "min",
    base: "LDO local · Anexo de Metas Fiscais",
    desc: "Percentual da meta da LDO. Default: 95% = atenção, 100% = crítico.",
    default: { atencao: 95, critico: 100 },
  },
  rcl_queda: {
    label: "Queda da RCL ano contra ano",
    tipo: "delta",
    base: "Acompanhamento gerencial",
    desc: "Percentual de queda yoy que dispara. Default: 5pp = atenção, 10pp = crítico.",
    default: { atencao: 5, critico: 10 },
  },
};

export default async function ParametrosPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let parametros: ParamRow[] = [];
  try {
    parametros = (await sql`
      SELECT indicador, limite_atencao, limite_critico, customizado, observacao, atualizado_em
      FROM parametros_alerta
      WHERE cod_ibge = ${codNum} AND ativo = TRUE
      ORDER BY indicador
    `) as ParamRow[];
  } catch (e) {
    console.error("[parametros]", e);
  }

  const podeEditar = perfil.podeEditarCadastro;
  const customizados = parametros.filter((p) => p.customizado).length;

  async function regerarAction() {
    "use server";
    await regerarAlertas(codNum);
  }

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Módulo 9 · Parametrização de alertas</Eyebrow>
        <div className="flex flex-wrap items-end justify-between gap-3 mt-3">
          <div>
            <h1
              className="font-bold"
              style={{ color: "var(--azul)", fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              Parâmetros de alerta
            </h1>
            <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
              Cada indicador tem limites de <strong>atenção</strong> e <strong>crítico</strong> que disparam alertas
              automáticos. Você pode customizar esses limites para refletir a estratégia fiscal do município
              (mais conservador / menos sensível). O sistema sempre respeita o limite legal mínimo/máximo da norma —
              estes parâmetros apenas ajustam o ponto em que o semáforo amarela ou avermelha.
            </p>
          </div>
          {podeEditar && (
            <form action={regerarAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-colors hover:brightness-95"
                style={{ background: "var(--azul-2)", color: "white" }}
                title="Aplica imediatamente os parâmetros editados a todos os indicadores"
              >
                <RotateCcw size={16} strokeWidth={2.5} aria-hidden /> Regerar alertas agora
              </button>
            </form>
          )}
        </div>
      </header>

      {!podeEditar && (
        <Placeholder
          titulo="Visualização somente leitura"
          descricao={`Perfil "${perfil.nome}" pode ver os parâmetros mas não editar. Mude para Prefeito ou Secretário no switcher do topo.`}
        />
      )}

      <Section
        title={`${customizados} customizado(s) de ${parametros.length} indicadores`}
        subtitle="Editar abaixo. Após salvar, clique em 'Regerar alertas agora' para aplicar."
      >
        {parametros.length === 0 ? (
          <Empty msg="Parâmetros default ainda não foram seedados para este município." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {parametros.map((p) => {
              const meta = INDICADORES_META[p.indicador];
              if (!meta) return null;
              return (
                <li key={p.indicador} className="p-5">
                  <ParametroEditor
                    codIbge={codNum}
                    indicador={p.indicador}
                    label={meta.label}
                    tipo={meta.tipo}
                    base={meta.base}
                    desc={meta.desc}
                    atencao={Number(p.limite_atencao)}
                    critico={Number(p.limite_critico)}
                    customizado={p.customizado}
                    observacao={p.observacao}
                    podeEditar={podeEditar}
                    defaultValores={meta.default}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function ParametroEditor({
  codIbge,
  indicador,
  label,
  tipo,
  base,
  desc,
  atencao,
  critico,
  customizado,
  observacao,
  podeEditar,
  defaultValores,
}: {
  codIbge: number;
  indicador: string;
  label: string;
  tipo: "max" | "min" | "delta";
  base: string;
  desc: string;
  atencao: number;
  critico: number;
  customizado: boolean;
  observacao: string | null;
  podeEditar: boolean;
  defaultValores: { atencao: number; critico: number };
}) {
  async function salvar(formData: FormData) {
    "use server";
    await atualizarParametro({
      codIbge,
      indicador,
      limiteAtencao: parseFloat(String(formData.get("atencao") || "0")),
      limiteCritico: parseFloat(String(formData.get("critico") || "0")),
      observacao: String(formData.get("observacao") || ""),
    });
  }
  async function resetar() {
    "use server";
    await resetarParaDefault(codIbge, indicador);
  }

  const sufixo = tipo === "delta" ? "pp" : "%";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Settings2 size={15} strokeWidth={1.75} style={{ color: "var(--azul-2)" }} aria-hidden />
            <span className="font-bold text-sm" style={{ color: "var(--azul)" }}>
              {label}
            </span>
            {customizado && (
              <span
                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                style={{ background: "rgba(78,181,31,0.13)", color: "var(--verde-2)", letterSpacing: "0.05em" }}
              >
                Customizado
              </span>
            )}
          </div>
          <div className="text-xs mb-1" style={{ color: "var(--cinza)" }}>{base}</div>
          <div className="text-xs flex items-start gap-1" style={{ color: "var(--cinza)" }}>
            <Info size={12} className="mt-0.5 flex-shrink-0" aria-hidden />
            <span>{desc}</span>
          </div>
        </div>
      </div>

      {podeEditar ? (
        <form action={salvar} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr_auto_auto] gap-3 items-end">
          <NumField
            name="atencao"
            label={`Limite ATENÇÃO (${sufixo})`}
            defaultValue={atencao}
            cor="#d97706"
          />
          <NumField
            name="critico"
            label={`Limite CRÍTICO (${sufixo})`}
            defaultValue={critico}
            cor="#dc2626"
          />
          <label className="block">
            <span className="text-[10px] uppercase font-bold tracking-widest mb-1 block" style={{ color: "var(--cinza)", letterSpacing: "0.08em" }}>
              Observação (opcional)
            </span>
            <input
              type="text"
              name="observacao"
              defaultValue={observacao ?? ""}
              placeholder="Justificativa do ajuste"
              className="w-full p-2 rounded-lg text-sm"
              style={{ border: "1px solid rgba(11,47,99,0.15)" }}
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: "var(--verde-2)", color: "white" }}
          >
            <Save size={14} strokeWidth={2.5} aria-hidden /> Salvar
          </button>
          {customizado && (
            <form action={resetar}>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-semibold whitespace-nowrap"
                style={{ background: "white", border: "1px solid rgba(11,47,99,0.15)", color: "var(--cinza)" }}
                title={`Restaurar para o padrão: atenção ${defaultValores.atencao}${sufixo} · crítico ${defaultValores.critico}${sufixo}`}
              >
                <RotateCcw size={12} aria-hidden /> Default
              </button>
            </form>
          )}
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <DisplayField label={`Atenção (${sufixo})`} valor={atencao} cor="#d97706" />
          <DisplayField label={`Crítico (${sufixo})`} valor={critico} cor="#dc2626" />
        </div>
      )}
    </div>
  );
}

function NumField({ name, label, defaultValue, cor }: { name: string; label: string; defaultValue: number; cor: string }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase font-bold tracking-widest mb-1 block" style={{ color: cor, letterSpacing: "0.08em" }}>
        {label}
      </span>
      <input
        type="number"
        name={name}
        step="0.5"
        defaultValue={defaultValue}
        required
        className="w-full p-2 rounded-lg text-sm font-bold"
        style={{ border: `1px solid ${cor}40`, color: cor }}
      />
    </label>
  );
}

function DisplayField({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  return (
    <div className="p-3 rounded-xl" style={{ background: `${cor}0d`, border: `1px solid ${cor}22` }}>
      <div className="text-[10px] uppercase font-bold tracking-widest" style={{ color: cor }}>{label}</div>
      <div className="text-xl font-bold mt-1" style={{ color: cor, letterSpacing: "-0.03em" }}>{valor}</div>
    </div>
  );
}
