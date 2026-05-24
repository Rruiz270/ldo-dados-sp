import { sql } from "@/lib/db";
import { MunicipioSearch } from "@/components/MunicipioSearch";

interface Row {
  cod_ibge: number;
  nome: string;
  populacao: number;
}

async function loadMunicipios(): Promise<Row[]> {
  try {
    const rows = (await sql`
      SELECT cod_ibge, nome, populacao
      FROM municipios
      ORDER BY nome ASC
    `) as Row[];
    return rows;
  } catch {
    // Sem banco ainda — render fallback
    return [];
  }
}

export default async function Home() {
  const municipios = await loadMunicipios();

  return (
    <div>
      {/* Hero */}
      <section
        className="text-white py-16"
        style={{ background: "linear-gradient(135deg, #061840 0%, #0A2463 100%)" }}
      >
        <div className="max-w-7xl mx-auto px-6">
          <h1
            className="text-5xl font-bold mb-3 leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Acompanhe as metas fiscais
            <br />
            dos <span style={{ color: "#00E5A0" }}>645 municípios</span> de SP
          </h1>
          <p className="text-lg text-cyan-100 max-w-2xl mb-8">
            Indicadores LRF, evolução temporal, comparação entre prefeituras e
            exportação para PDF/Excel — tudo derivado direto das fontes oficiais.
          </p>
          <MunicipioSearch municipios={municipios} />
        </div>
      </section>

      {/* Métricas globais */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <h2
          className="text-2xl font-semibold mb-6"
          style={{ color: "#0A2463", fontFamily: "var(--font-display)" }}
        >
          Panorama de SP
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card title="Municípios monitorados" value={municipios.length.toString()} sub="todos os 645 de SP" />
          <Card title="Cobertura RREO 2025" value="82%" sub="531 publicam regularmente" />
          <Card title="Em atraso (DCA 2025)" value="35" sub="prazo era 30/abr" />
          <Card title="Atualização" value="diária" sub="4h da manhã" />
        </div>
      </section>
    </div>
  );
}

function Card({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="text-xs uppercase text-slate-500 font-medium tracking-wide">{title}</div>
      <div
        className="text-3xl font-bold my-1"
        style={{ color: "#0A2463" }}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}
