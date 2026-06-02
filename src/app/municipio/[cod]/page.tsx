import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { MunicipioTabs } from "@/components/MunicipioTabs";
import { PainelPreventivo } from "@/components/PainelPreventivo";
import { getPerfilAtivo } from "@/lib/perfil";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ cod: string }>;
}

interface Municipio {
  cod_ibge: number;
  nome: string;
  populacao: number;
  faixa_pop: string | null;
  regiao: string | null;
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
  rotulo?: string;
  tipo?: "fiscal_lrf" | "constitucional";
  natureza?: "teto" | "piso";
  limite_efetivo?: number | null;
  limite_prudencial?: number | null;
  limite_alerta?: number | null;
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

interface IndicadorFiscal {
  indicador: string;       // rcl | resultado_primario | resultado_nominal
  exercicio: number;
  periodo: number;
  valor: string;           // R$
  meta: string | null;     // só pra resultado_primario
  fonte: string;
}

interface RankingPos {
  indicador: string;
  posicao: number;
  total: number;
  valor: number;
  exercicio: number;
}

export default async function MunicipioPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  if (Number.isNaN(codNum)) notFound();

  const perfil = await getPerfilAtivo();

  let municipio: Municipio | null = null;
  let indicadores: IndicadorLRF[] = [];
  let areasFim: DespesaFuncao[] = [];
  let publicacoes: PublicacaoStatus[] = [];
  let ranking: RankingPos[] = [];
  let fiscais: IndicadorFiscal[] = [];

  try {
    // Gate nacional (0008): vw_municipios_publicados expõe só UFs ready (SP hoje).
    // Evita vazamento de municípios em staging (RS/AC) na busca e no ranking.
    const rows = (await sql`
      SELECT cod_ibge, nome, populacao, faixa_pop, regiao
      FROM vw_municipios_publicados WHERE cod_ibge = ${codNum} LIMIT 1
    `) as Municipio[];
    municipio = rows[0] ?? null;
    if (municipio) {
      // v2: lê da view canônica (indicadores_lrf + catálogo), já SP-only.
      indicadores = (await sql`
        SELECT indicador, exercicio, periodo, periodicidade, valor,
               limite_legal, pct_do_limite, fonte, rotulo, tipo, natureza,
               limite_efetivo, limite_prudencial, limite_alerta
        FROM vw_lrf_indicadores
        WHERE cod_ibge = ${codNum}
        ORDER BY exercicio DESC, periodo DESC
      `) as IndicadorLRF[];

      // Pega o ano mais recente que tem despesas por função (preferencialmente
      // bimestre mais alto), pra ter dados mais frescos.
      areasFim = (await sql`
        SELECT funcao, exercicio, periodo, eh_area_fim, eh_subfuncao, funcao_pai,
               dotacao_inicial, dotacao_atualizada, empenhado, liquidado, pct_do_total
        FROM despesa_por_funcao
        WHERE cod_ibge = ${codNum}
          AND (exercicio, periodo) = (
            SELECT exercicio, MAX(periodo)
            FROM despesa_por_funcao
            WHERE cod_ibge = ${codNum}
            GROUP BY exercicio
            ORDER BY exercicio DESC
            LIMIT 1
          )
        ORDER BY eh_area_fim DESC, eh_subfuncao ASC, empenhado DESC NULLS LAST
      `) as DespesaFuncao[];

      indicadores = indicadores.filter(
        (i) => !(i.indicador.startsWith("fundeb") && Number(i.valor) > 500),
      );

      fiscais = (await sql`
        SELECT indicador, exercicio, periodo, valor, meta, fonte
        FROM indicadores_fiscais
        WHERE cod_ibge = ${codNum}
        ORDER BY exercicio DESC, periodo DESC, indicador
      `) as IndicadorFiscal[];

      publicacoes = (await sql`
        SELECT dataset, status, atualizado_em
        FROM publicacao_status
        WHERE cod_ibge = ${codNum}
        ORDER BY dataset DESC
      `) as PublicacaoStatus[];

      // Ranking estadual por indicador — posição do município no exercício mais
      // recente. Usa vw_lrf_indicadores (gate SP via vw_municipios_publicados):
      // só compara municípios paulistas publicados, sem vazamento de RS/AC.
      // Tetos (natureza='teto') ordenam ASC (menor=melhor); pisos DESC (maior=melhor).
      ranking = (await sql`
        WITH latest AS (
          SELECT indicador, MAX(exercicio) AS exercicio
          FROM vw_lrf_indicadores
          WHERE valor IS NOT NULL
          GROUP BY indicador
        ),
        ranked AS (
          SELECT i.indicador, i.cod_ibge, i.valor, i.exercicio,
                 RANK() OVER (
                   PARTITION BY i.indicador
                   ORDER BY CASE WHEN i.natureza = 'teto'
                                 THEN i.valor ELSE -i.valor END ASC
                 ) AS posicao,
                 COUNT(*) OVER (PARTITION BY i.indicador) AS total
          FROM vw_lrf_indicadores i
          JOIN latest l USING (indicador, exercicio)
          WHERE i.valor IS NOT NULL
        )
        SELECT indicador, posicao::int, total::int, valor, exercicio
        FROM ranked
        WHERE cod_ibge = ${codNum}
        ORDER BY indicador
      `) as RankingPos[];
    }
  } catch {
    // banco ainda não populado
  }

  if (!municipio) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-red-900 mb-2">
            Código IBGE inválido
          </h2>
          <p className="text-red-800 text-sm">
            <code className="bg-red-100 px-1 rounded">{cod}</code> não corresponde a nenhum dos 645
            municípios paulistas. <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/`} className="underline">Voltar para a busca</a>.
          </p>
        </div>
      </div>
    );
  }

  // Calcular stats de cobertura pra mostrar no header
  const pubCount = publicacoes.filter((p) => p.status === "PUBLICADO").length;
  const ndpCount = publicacoes.filter((p) => p.status === "NAO_PUBLICADO").length;
  const totalPub = publicacoes.length;
  const pctPubli = totalPub > 0 ? Math.round((pubCount / totalPub) * 100) : 0;

  // Período mais recente que esse município tem em despesa_por_funcao
  // (e quanto a "rede" tem — pra disclaimer "outros já têm mais recente")
  let periodoInfo: {
    ano: number | null;
    bim: number | null;
    munisComEsteAno: number;
    munisComAnoMaisRecente: number;
    proxAno: number | null;
  } = { ano: null, bim: null, munisComEsteAno: 0, munisComAnoMaisRecente: 0, proxAno: null };

  if (areasFim.length > 0) {
    const ano = areasFim[0].exercicio;
    const bim = areasFim[0].periodo;
    try {
      const rows = (await sql`
        SELECT exercicio,
               COUNT(DISTINCT cod_ibge)::int AS munis
        FROM despesa_por_funcao
        WHERE exercicio >= ${ano}
        GROUP BY exercicio
        ORDER BY exercicio DESC
      ` ) as Array<{ exercicio: number; munis: number }>;
      const meu = rows.find((r) => r.exercicio === ano);
      const maisRecente = rows.find((r) => r.exercicio > ano);
      periodoInfo = {
        ano,
        bim,
        munisComEsteAno: meu?.munis ?? 0,
        munisComAnoMaisRecente: maisRecente?.munis ?? 0,
        proxAno: maisRecente?.exercicio ?? null,
      };
    } catch {}
  }

  return (
    <div className="space-y-5">
      {/* Chips de status — header de identidade já vem do layout */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {municipio.regiao && (
          <span className="px-2.5 py-1 rounded-full font-semibold" style={{ background: "#fff", border: "1px solid rgba(11,47,99,0.10)", color: "var(--cinza)" }}>
            {municipio.regiao}
          </span>
        )}
        {municipio.faixa_pop && (
          <span className="px-2.5 py-1 rounded-full font-semibold" style={{ background: "#fff", border: "1px solid rgba(11,47,99,0.10)", color: "var(--cinza)" }}>
            Faixa: {municipio.faixa_pop}
          </span>
        )}
        {totalPub > 0 && (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-bold"
            style={{
              background: pctPubli >= 80 ? "rgba(78,181,31,0.13)" : pctPubli >= 50 ? "rgba(217,119,6,0.13)" : "rgba(220,38,38,0.13)",
              color: pctPubli >= 80 ? "var(--verde-2)" : pctPubli >= 50 ? "#d97706" : "#dc2626",
            }}
            title={`${pubCount} de ${totalPub} relatórios fiscais obrigatórios publicados`}
          >
            Transparência {pctPubli}%
          </span>
        )}
        {ndpCount > 0 && (
          <span className="text-xs" style={{ color: "#dc2626" }}>
            {ndpCount} relatório(s) não publicados
          </span>
        )}
      </div>

      {/* Disclaimer de período defasado */}
      {periodoInfo.proxAno && periodoInfo.munisComAnoMaisRecente > 50 && (
        <div
          className="p-4 rounded-2xl text-sm flex items-start gap-3"
          style={{ background: "linear-gradient(135deg, rgba(11,47,99,0.04), rgba(78,181,31,0.05))", border: "1px solid rgba(11,47,99,0.10)" }}
        >
          <div style={{ color: "var(--azul-2)" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div className="flex-1" style={{ color: "var(--azul)" }}>
            <strong>{municipio.nome}</strong> ainda não publicou RREO de <strong>{periodoInfo.proxAno}</strong>.
            Dados exibidos são do exercício <strong>{periodoInfo.ano}/B{periodoInfo.bim}</strong>{" "}
            (último publicado). Outros <strong>{periodoInfo.munisComAnoMaisRecente}</strong> municípios paulistas já publicaram dados de {periodoInfo.proxAno}.
          </div>
        </div>
      )}

      {/* Painel preventivo dinâmico — Módulo 3 */}
      <PainelPreventivo
        codIbge={codNum}
        basePath={process.env.NEXT_PUBLIC_BASE_PATH || ""}
        podeCriarProvidencia={perfil.podeCriarProvidencia}
      />

      {/* Visão técnica detalhada (mantida) */}
      <MunicipioTabs
        municipio={municipio}
        indicadores={indicadores}
        areasFim={areasFim}
        publicacoes={publicacoes}
        ranking={ranking}
        fiscais={fiscais}
      />
    </div>
  );
}
