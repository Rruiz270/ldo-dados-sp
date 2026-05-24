import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (_sql) return _sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  _sql = neon(url);
  return _sql;
}

// Proxy para `import { sql } from "@/lib/db"` funcionar como tagged template,
// mas só exige DATABASE_URL na primeira query (lazy).
export const sql: NeonQueryFunction<false, false> = new Proxy(
  (() => {}) as unknown as NeonQueryFunction<false, false>,
  {
    apply(_t, _ta, args) {
      return (getSql() as unknown as (...a: unknown[]) => unknown)(...args);
    },
    get(_t, prop) {
      return (getSql() as unknown as Record<string | symbol, unknown>)[prop];
    },
  },
);

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
  periodicidade: "B" | "Q";
  indicador: "pessoal" | "divida" | "educacao" | "saude" | "rcl";
  valor: number;
  limite_legal: number;
  pct_do_limite: number;
  fonte: "RREO" | "RGF" | "DCA" | "Audesp";
  atualizado_em: string;
}
