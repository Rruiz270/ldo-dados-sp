// PainelExecutivo — VISÃO "Prefeito" (tipoVisao = 'executiva').
// Consolida o quadro estratégico: RCL e resultado primário (indicadores_fiscais),
// pessoal/dívida (vw_lrf_indicadores) e os pisos saúde/educação/FUNDEB. Onde
// faltar dado, exibe "—". Server component. Sem comparativo trienal/restos a
// pagar (fora de escopo).
import { sql } from "@/lib/db";
import { Section, Eyebrow, SemaforoMax, SemaforoMin, fmtBRL, fmtPct } from "@/components/ModuloUI";

interface LrfRow {
  indicador: string;
  rotulo: string | null;
  natureza: "teto" | "piso";
  valor: string | null;
  limite_efetivo: string | null;
  limite_prudencial: string | null;
  limite_alerta: string | null;
  exercicio: number;
  periodo: number;
  periodicidade: string;
}

interface FiscalRow {
  indicador: string;
  valor: string;
  meta: string | null;
  exercicio: number;
  periodo: number;
}

export async function PainelExecutivo({ codIbge }: { codIbge: number }) {
  let lrf: LrfRow[] = [];
  let fiscais: FiscalRow[] = [];
  try {
    lrf = (await sql`
      SELECT indicador, rotulo, natureza, valor, limite_efetivo,
             limite_prudencial, limite_alerta, exercicio, periodo, periodicidade
      FROM vw_lrf_indicadores
      WHERE cod_ibge = ${codIbge}
      ORDER BY exercicio DESC, periodo DESC
    `) as LrfRow[];
    fiscais = (await sql`
      SELECT indicador, valor, meta, exercicio, periodo
      FROM indicadores_fiscais
      WHERE cod_ibge = ${codIbge}
      ORDER BY exercicio DESC, periodo DESC
    `) as FiscalRow[];
  } catch (e) {
    console.error("[PainelExecutivo]", e);
  }

  // FUNDEB às vezes vem com % absurdo por divergência de base — filtra ruído.
  lrf = lrf.filter((r) => !(r.indicador.startsWith("fundeb") && Number(r.valor) > 500));

  // Pega a leitura mais recente de cada indicador (rows já ordenadas DESC).
  const lrfAtual = new Map<string, LrfRow>();
  for (const r of lrf) if (!lrfAtual.has(r.indicador)) lrfAtual.set(r.indicador, r);
  const fiscalAtual = new Map<string, FiscalRow>();
  for (const r of fiscais) if (!fiscalAtual.has(r.indicador)) fiscalAtual.set(r.indicador, r);

  const rcl = fiscalAtual.get("rcl") ?? null;
  const primario = fiscalAtual.get("resultado_primario") ?? null;

  const tetos = (["pessoal", "divida"] as const).map((id) => lrfAtual.get(id)).filter(Boolean) as LrfRow[];
  const pisos = (["educacao", "saude", "fundeb", "fundeb_profissionais"] as const)
    .map((id) => lrfAtual.get(id))
    .filter(Boolean) as LrfRow[];

  return (
    <Section
      title="Painel executivo"
      subtitle="Quadro estratégico consolidado para a gestão: receita corrente líquida, resultado primário, principais limites fiscais (pessoal e dívida) e pisos constitucionais. Onde não há dado publicado, exibe '—'."
    >
      <div className="p-5 space-y-6">
        {/* Linha de KPIs financeiros */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Kpi
            titulo="Receita Corrente Líquida (RCL)"
            valor={rcl ? fmtBRL(rcl.valor) : "—"}
            ref={rcl ? `${rcl.exercicio}/${rcl.periodo}` : null}
            tom="azul"
          />
          <Kpi
            titulo="Resultado primário"
            valor={primario ? fmtBRL(primario.valor) : "—"}
            ref={primario ? `${primario.exercicio}/${primario.periodo}` : null}
            sub={primario?.meta != null ? `Meta LDO: ${fmtBRL(primario.meta)}` : undefined}
            tom={primario ? (Number(primario.valor) >= 0 ? "verde" : "vermelho") : "cinza"}
          />
        </div>

        {/* Limites fiscais resumidos */}
        <div>
          <Eyebrow small>Limites fiscais (LRF)</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {tetos.length === 0 && <Vazio msg="Sem indicadores de pessoal/dívida publicados." />}
            {tetos.map((r) => (
              <Indicador
                key={r.indicador}
                rotulo={r.rotulo ?? r.indicador}
                valor={fmtPct(r.valor)}
                limite={`teto ${fmtPct(r.limite_efetivo)}`}
                refTxt={`${r.exercicio}/${r.periodicidade}${r.periodo}`}
                status={
                  <SemaforoMax
                    valor={r.valor}
                    limite={r.limite_efetivo}
                    limitePrudencial={r.limite_prudencial}
                    limiteAlerta={r.limite_alerta}
                  />
                }
              />
            ))}
          </div>
        </div>

        {/* Pisos constitucionais */}
        <div>
          <Eyebrow small>Pisos constitucionais</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            {pisos.length === 0 && <Vazio msg="Sem pisos de educação/saúde/FUNDEB publicados." />}
            {pisos.map((r) => (
              <Indicador
                key={r.indicador}
                rotulo={r.rotulo ?? r.indicador}
                valor={fmtPct(r.valor)}
                limite={`mínimo ${fmtPct(r.limite_efetivo)}`}
                refTxt={`${r.exercicio}/${r.periodicidade}${r.periodo}`}
                status={<SemaforoMin valor={r.valor} limite={r.limite_efetivo} />}
              />
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

function Kpi({
  titulo,
  valor,
  ref,
  sub,
  tom,
}: {
  titulo: string;
  valor: string;
  ref: string | null;
  sub?: string;
  tom: "azul" | "verde" | "vermelho" | "cinza";
}) {
  const cor =
    tom === "verde" ? "var(--verde-2)" : tom === "vermelho" ? "#dc2626" : tom === "azul" ? "var(--azul)" : "var(--cinza)";
  return (
    <div className="p-5 rounded-2xl" style={{ background: "white", border: "1px solid rgba(11,47,99,0.09)", boxShadow: "0 8px 22px rgba(11,47,99,0.06)" }}>
      <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--cinza)" }}>
        {titulo}
      </div>
      <div className="text-2xl md:text-3xl font-bold my-1" style={{ color: cor, letterSpacing: "-0.03em" }}>
        {valor}
      </div>
      <div className="text-xs" style={{ color: "var(--cinza)" }}>
        {sub ? `${sub} · ` : ""}{ref ? `ref. ${ref}` : "sem dado publicado"}
      </div>
    </div>
  );
}

function Indicador({
  rotulo,
  valor,
  limite,
  refTxt,
  status,
}: {
  rotulo: string;
  valor: string;
  limite: string;
  refTxt: string;
  status: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-2xl flex items-center justify-between gap-3" style={{ background: "white", border: "1px solid rgba(11,47,99,0.09)" }}>
      <div className="min-w-0">
        <div className="font-semibold text-sm truncate" style={{ color: "var(--azul)" }}>{rotulo}</div>
        <div className="text-xs" style={{ color: "var(--cinza)" }}>{limite} · ref. {refTxt}</div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <span className="text-lg font-bold" style={{ color: "var(--grafite)" }}>{valor}</span>
        {status}
      </div>
    </div>
  );
}

function Vazio({ msg }: { msg: string }) {
  return (
    <div className="px-4 py-6 text-sm italic md:col-span-2" style={{ color: "var(--cinza)" }}>
      {msg}
    </div>
  );
}
