"use server";

import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getPerfilAtivo } from "@/lib/perfil";

async function exigirEdicao() {
  const perfil = await getPerfilAtivo();
  if (!perfil.podeEditarCadastro) {
    throw new Error(
      `Perfil "${perfil.nome}" não pode editar parâmetros. Mude para Prefeito ou Secretário.`,
    );
  }
}

interface AtualizarInput {
  codIbge: number;
  indicador: string;
  limiteAtencao: number;
  limiteCritico: number;
  observacao?: string;
}

const INDICADORES_VALIDOS = [
  "pessoal", "educacao", "saude", "fundeb_remuneracao", "dcl",
  "resultado_primario", "rcl_queda",
];

export async function atualizarParametro(input: AtualizarInput) {
  await exigirEdicao();

  if (!Number.isFinite(input.codIbge) || input.codIbge <= 0) throw new Error("Município inválido");
  if (!INDICADORES_VALIDOS.includes(input.indicador)) throw new Error("Indicador inválido");
  if (!Number.isFinite(input.limiteAtencao) || !Number.isFinite(input.limiteCritico)) {
    throw new Error("Limites inválidos");
  }
  if (input.limiteAtencao < 0 || input.limiteAtencao > 200) throw new Error("Limite de atenção fora do range 0-200");
  if (input.limiteCritico < 0 || input.limiteCritico > 200) throw new Error("Limite crítico fora do range 0-200");

  await sql`
    INSERT INTO parametros_alerta (cod_ibge, indicador, limite_atencao, limite_critico, observacao, customizado, atualizado_em)
    VALUES (${input.codIbge}, ${input.indicador}, ${input.limiteAtencao}, ${input.limiteCritico},
            ${input.observacao?.trim() || null}, TRUE, NOW())
    ON CONFLICT (cod_ibge, indicador) DO UPDATE SET
      limite_atencao = EXCLUDED.limite_atencao,
      limite_critico = EXCLUDED.limite_critico,
      observacao = EXCLUDED.observacao,
      customizado = TRUE,
      atualizado_em = NOW()
  `;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${input.codIbge}/parametros`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/alertas`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}`);
}

export async function resetarParaDefault(codIbge: number, indicador: string) {
  await exigirEdicao();
  if (!INDICADORES_VALIDOS.includes(indicador)) throw new Error("Indicador inválido");

  // Defaults da migration 0005
  const defaults: Record<string, { atencao: number; critico: number }> = {
    pessoal:              { atencao: 90, critico: 95 },
    educacao:             { atencao: 95, critico: 100 },
    saude:                { atencao: 95, critico: 100 },
    fundeb_remuneracao:   { atencao: 95, critico: 100 },
    dcl:                  { atencao: 85, critico: 95 },
    resultado_primario:   { atencao: 95, critico: 100 },
    rcl_queda:            { atencao: 5,  critico: 10 },
  };
  const d = defaults[indicador];
  if (!d) throw new Error("Sem default cadastrado");

  await sql`
    UPDATE parametros_alerta
    SET limite_atencao = ${d.atencao},
        limite_critico = ${d.critico},
        customizado = FALSE,
        observacao = NULL,
        atualizado_em = NOW()
    WHERE cod_ibge = ${codIbge} AND indicador = ${indicador}
  `;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}/parametros`);
  revalidatePath(`${basePath}/municipio/${codIbge}/alertas`);
  revalidatePath(`${basePath}/municipio/${codIbge}`);
}
