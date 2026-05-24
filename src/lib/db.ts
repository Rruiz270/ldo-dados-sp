import postgres from "postgres";

declare global {
  // Em dev, reusa a mesma conexão entre hot-reloads pra não esgotar pool.
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

function makeClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false → compatível com PgBouncer/pooler que o Neon usa.
  return postgres(url, { prepare: false, max: 5, idle_timeout: 20 });
}

export const sql = globalThis._pgClient ?? makeClient();
if (process.env.NODE_ENV !== "production") {
  globalThis._pgClient = sql;
}

// Tipos canônicos do domínio
export interface Municipio {
  cod_ibge: number;
  nome: string;
  populacao: number;
  faixa_pop: "ate_5k" | "5k_20k" | "20k_50k" | "50k_100k" | "100k_500k" | "acima_500k";
  regiao: string | null;
}

export interface IndicadorLRF {
  cod_ibge: number;
  exercicio: number;
  periodo: number;
  periodicidade: "A" | "B" | "Q";
  indicador: "pessoal" | "educacao" | "saude" | "fundeb" | "fundeb_profissionais" | "resultado_execucao";
  valor: number;
  base_calculo: number | null;
  limite_legal: number | null;
  pct_do_limite: number | null;
  fonte: "RREO" | "RGF" | "DCA" | "Audesp";
  atualizado_em: string;
}
