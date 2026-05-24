import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { MunicipioTabs } from "@/components/MunicipioTabs";

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

  let municipio: Municipio | null = null;
  let indicadores: IndicadorLRF[] = [];
  let areasFim: DespesaFuncao[] = [];
  let publicacoes: PublicacaoStatus[] = [];
  let ranking: RankingPos[] = [];

  try {
    const rows = (await sql`
      SELECT cod_ibge, nome, populacao, faixa_pop, regiao
      FROM municipios WHERE cod_ibge = ${codNum} LIMIT 1
    `) as Municipio[];
    municipio = rows[0] ?? null;
    if (municipio) {
      indicadores = (await sql`
        SELECT indicador, exercicio, periodo, periodicidade, valor, limite_legal, pct_do_limite, fonte
        FROM indicadores_lrf
        WHERE cod_ibge = ${codNum}
        ORDER BY exercicio DESC, periodo DESC
      `) as IndicadorLRF[];

      // Pega o ano mais recente que tem despesas por função (preferencialmente
      // bimestre mais alto), pra ter dados mais frescos.
      areasFim = (await sql`
        SELECT funcao, exercicio, periodo, eh_area_fim,
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
        ORDER BY eh_area_fim DESC, empenhado DESC NULLS LAST
      `) as DespesaFuncao[];

      // Filtro outliers conhecidos: FUNDEB com valores > 500% só aparece em 2016
      // (schema antigo do TCE-SP onde campo era valor absoluto, não %)
      indicadores = indicadores.filter(
        (i) => !(i.indicador.startsWith("fundeb") && Number(i.valor) > 500),
      );

      publicacoes = (await sql`
        SELECT dataset, status, atualizado_em
        FROM publicacao_status
        WHERE cod_ibge = ${codNum}
        ORDER BY dataset DESC
      `) as PublicacaoStatus[];

      // Ranking estadual por indicador — posição do município no exercício mais recente
      ranking = (await sql`
        WITH latest AS (
          SELECT indicador, MAX(exercicio) AS exercicio
          FROM indicadores_lrf
          WHERE valor IS NOT NULL
          GROUP BY indicador
        ),
        ranked AS (
          SELECT i.indicador, i.cod_ibge, i.valor, i.exercicio,
                 RANK() OVER (
                   PARTITION BY i.indicador
                   ORDER BY CASE WHEN i.indicador IN ('pessoal','divida')
                                 THEN i.valor ELSE -i.valor END ASC
                 ) AS posicao,
                 COUNT(*) OVER (PARTITION BY i.indicador) AS total
          FROM indicadores_lrf i
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
    <div className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-8 pb-6 border-b border-slate-200">
        <div className="text-xs text-slate-500 mb-1">
          IBGE {municipio.cod_ibge}{municipio.regiao ? ` · ${municipio.regiao}` : ""}
        </div>
        <h1
          className="text-4xl font-bold mb-2"
          style={{ color: "#0A2463", fontFamily: "var(--font-display)" }}
        >
          {municipio.nome}
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
          <span>
            População: <strong>{municipio.populacao?.toLocaleString("pt-BR")}</strong> hab
          </span>
          {municipio.faixa_pop && <span>Faixa: {municipio.faixa_pop}</span>}
          {totalPub > 0 && (
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                pctPubli >= 80
                  ? "bg-green-100 text-green-900"
                  : pctPubli >= 50
                  ? "bg-amber-100 text-amber-900"
                  : "bg-red-100 text-red-900"
              }`}
              title={`${pubCount} de ${totalPub} relatórios fiscais obrigatórios publicados`}
            >
              {pctPubli >= 80 ? "✓" : pctPubli >= 50 ? "⚠" : "✗"} Transparência: {pctPubli}%
            </span>
          )}
          {ndpCount > 0 && (
            <span className="text-xs text-red-700">
              {ndpCount} relatório(s) não publicados pelo município
            </span>
          )}
        </div>
      </header>

      {/* Disclaimer de período se município está defasado */}
      {periodoInfo.proxAno && periodoInfo.munisComAnoMaisRecente > 50 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm flex items-start gap-3">
          <div className="text-2xl">⏰</div>
          <div className="flex-1 text-blue-900">
            <strong>{municipio.nome}</strong> ainda não publicou RREO de <strong>{periodoInfo.proxAno}</strong>.
            Dados exibidos são do exercício <strong>{periodoInfo.ano}/B{periodoInfo.bim}</strong>{" "}
            (último publicado). Outros <strong>{periodoInfo.munisComAnoMaisRecente}</strong> municípios
            paulistas já publicaram dados de {periodoInfo.proxAno}.
          </div>
        </div>
      )}

      <MunicipioTabs
        municipio={municipio}
        indicadores={indicadores}
        areasFim={areasFim}
        publicacoes={publicacoes}
        ranking={ranking}
      />
    </div>
  );
}
