import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { MunicipioTabs } from "@/components/MunicipioTabs";

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
  valor: number;
  limite_legal: number;
  pct_do_limite: number;
  fonte: string;
}

export default async function MunicipioPage({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  if (Number.isNaN(codNum)) notFound();

  let municipio: Municipio | null = null;
  let indicadores: IndicadorLRF[] = [];

  try {
    const rows = (await sql`
      SELECT cod_ibge, nome, populacao, faixa_pop, regiao
      FROM municipios WHERE cod_ibge = ${codNum} LIMIT 1
    `) as Municipio[];
    municipio = rows[0] ?? null;
    if (municipio) {
      indicadores = (await sql`
        SELECT indicador, exercicio, periodo, valor, limite_legal, pct_do_limite, fonte
        FROM indicadores_lrf
        WHERE cod_ibge = ${codNum}
        ORDER BY exercicio DESC, periodo DESC
      `) as IndicadorLRF[];
    }
  } catch {
    // banco ainda não populado
  }

  if (!municipio) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-amber-900 mb-2">
            Município não encontrado no banco
          </h2>
          <p className="text-amber-800 text-sm">
            Código IBGE <code className="bg-amber-100 px-1 rounded">{cod}</code> não existe na base
            ou o seed ainda não foi rodado. Execute{" "}
            <code className="bg-amber-100 px-1 rounded">npm run db:migrate &amp;&amp; npm run db:seed</code>.
          </p>
        </div>
      </div>
    );
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
        <div className="text-sm text-slate-600">
          População: <strong>{municipio.populacao?.toLocaleString("pt-BR")}</strong> habitantes
          {municipio.faixa_pop && <span className="ml-3">Faixa: {municipio.faixa_pop}</span>}
        </div>
      </header>

      <MunicipioTabs municipio={municipio} indicadores={indicadores} />
    </div>
  );
}
