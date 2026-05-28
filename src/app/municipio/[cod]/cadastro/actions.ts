"use server";

import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getPerfilAtivo } from "@/lib/perfil";

async function exigirEdicao() {
  const perfil = await getPerfilAtivo();
  if (!perfil.podeEditarCadastro) {
    throw new Error(
      `Perfil "${perfil.nome}" não pode editar cadastro institucional. Mude para Prefeito ou Secretário.`,
    );
  }
}

function assertCod(cod: number) {
  if (!Number.isFinite(cod) || cod <= 0) throw new Error("Município inválido");
}

// ============================================================
// ÓRGÃOS — Module 1
// ============================================================

const TIPOS_ORGAO = ["executivo", "legislativo", "autarquia", "fundacao", "fundo", "consorcio"] as const;
type TipoOrgao = typeof TIPOS_ORGAO[number];

export async function criarOrgao(data: {
  codIbge: number;
  nome: string;
  tipo: string;
  responsavel?: string;
  cargoResponsavel?: string;
  contato?: string;
  observacoes?: string;
}) {
  await exigirEdicao();
  assertCod(data.codIbge);

  const nome = data.nome?.trim();
  if (!nome) throw new Error("Nome obrigatório");
  if (!TIPOS_ORGAO.includes(data.tipo as TipoOrgao)) throw new Error("Tipo inválido");

  await sql`
    INSERT INTO orgaos (cod_ibge, nome, tipo, responsavel, cargo_responsavel, contato, observacoes)
    VALUES (
      ${data.codIbge},
      ${nome},
      ${data.tipo},
      ${data.responsavel?.trim() || null},
      ${data.cargoResponsavel?.trim() || null},
      ${data.contato?.trim() || null},
      ${data.observacoes?.trim() || null}
    )
    ON CONFLICT (cod_ibge, nome, tipo) DO UPDATE SET
      responsavel = EXCLUDED.responsavel,
      cargo_responsavel = EXCLUDED.cargo_responsavel,
      contato = EXCLUDED.contato,
      observacoes = EXCLUDED.observacoes,
      ativo = TRUE
  `;
  invalidate(data.codIbge);
}

export async function atualizarOrgao(data: {
  id: number;
  codIbge: number;
  responsavel?: string;
  cargoResponsavel?: string;
  contato?: string;
  observacoes?: string;
  ativo?: boolean;
}) {
  await exigirEdicao();
  assertCod(data.codIbge);

  const ok = (await sql`SELECT id FROM orgaos WHERE id = ${data.id} AND cod_ibge = ${data.codIbge}`) as Array<{ id: number }>;
  if (ok.length === 0) throw new Error("Órgão não encontrado neste município");

  if (data.responsavel !== undefined) {
    await sql`UPDATE orgaos SET responsavel = ${data.responsavel?.trim() || null} WHERE id = ${data.id} AND cod_ibge = ${data.codIbge}`;
  }
  if (data.cargoResponsavel !== undefined) {
    await sql`UPDATE orgaos SET cargo_responsavel = ${data.cargoResponsavel?.trim() || null} WHERE id = ${data.id} AND cod_ibge = ${data.codIbge}`;
  }
  if (data.contato !== undefined) {
    await sql`UPDATE orgaos SET contato = ${data.contato?.trim() || null} WHERE id = ${data.id} AND cod_ibge = ${data.codIbge}`;
  }
  if (data.observacoes !== undefined) {
    await sql`UPDATE orgaos SET observacoes = ${data.observacoes?.trim() || null} WHERE id = ${data.id} AND cod_ibge = ${data.codIbge}`;
  }
  if (data.ativo !== undefined) {
    await sql`UPDATE orgaos SET ativo = ${data.ativo} WHERE id = ${data.id} AND cod_ibge = ${data.codIbge}`;
  }
  invalidate(data.codIbge);
}

export async function removerOrgao(id: number, codIbge: number) {
  await exigirEdicao();
  assertCod(codIbge);
  await sql`DELETE FROM orgaos WHERE id = ${id} AND cod_ibge = ${codIbge}`;
  invalidate(codIbge);
}

// ============================================================
// PROGRAMAS — Module 1 (PPA)
// ============================================================

export async function criarPrograma(data: {
  codIbge: number;
  exercicio: number;
  codigo: string;
  nome: string;
  objetivo?: string;
  area?: string;
  publicoAlvo?: string;
}) {
  await exigirEdicao();
  assertCod(data.codIbge);

  const codigo = data.codigo?.trim();
  const nome = data.nome?.trim();
  if (!codigo || !nome) throw new Error("Código e nome obrigatórios");
  if (!Number.isFinite(data.exercicio) || data.exercicio < 2000 || data.exercicio > 2099) {
    throw new Error("Exercício inválido");
  }

  await sql`
    INSERT INTO programas (cod_ibge, exercicio, codigo, nome, objetivo, area, publico_alvo)
    VALUES (
      ${data.codIbge},
      ${data.exercicio},
      ${codigo},
      ${nome},
      ${data.objetivo?.trim() || null},
      ${data.area?.trim() || null},
      ${data.publicoAlvo?.trim() || null}
    )
    ON CONFLICT (cod_ibge, exercicio, codigo) DO UPDATE SET
      nome = EXCLUDED.nome,
      objetivo = EXCLUDED.objetivo,
      area = EXCLUDED.area,
      publico_alvo = EXCLUDED.publico_alvo
  `;
  invalidate(data.codIbge);
}

export async function removerPrograma(id: number, codIbge: number) {
  await exigirEdicao();
  assertCod(codIbge);
  await sql`DELETE FROM programas WHERE id = ${id} AND cod_ibge = ${codIbge}`;
  invalidate(codIbge);
}

// ============================================================
// METAS FISCAIS LDO — Module 4
// ============================================================

const INDICADORES_META_FISCAL = [
  "resultado_primario",
  "resultado_nominal",
  "divida_consolidada",
  "receita_total",
  "despesa_total",
] as const;

export async function criarMetaFiscal(data: {
  codIbge: number;
  exercicio: number;
  indicador: string;
  metaValor?: number;
  metaPct?: number;
  baseLegal?: string;
}) {
  await exigirEdicao();
  assertCod(data.codIbge);

  if (!INDICADORES_META_FISCAL.includes(data.indicador as typeof INDICADORES_META_FISCAL[number])) {
    throw new Error("Indicador inválido");
  }
  if (!Number.isFinite(data.exercicio)) throw new Error("Exercício inválido");

  await sql`
    INSERT INTO ldo_metas_fiscais (cod_ibge, exercicio, indicador, meta_valor, meta_pct, base_legal)
    VALUES (
      ${data.codIbge},
      ${data.exercicio},
      ${data.indicador},
      ${data.metaValor ?? null},
      ${data.metaPct ?? null},
      ${data.baseLegal?.trim() || null}
    )
    ON CONFLICT (cod_ibge, exercicio, indicador) DO UPDATE SET
      meta_valor = EXCLUDED.meta_valor,
      meta_pct = EXCLUDED.meta_pct,
      base_legal = EXCLUDED.base_legal
  `;
  invalidate(data.codIbge);
}

export async function removerMetaFiscal(codIbge: number, exercicio: number, indicador: string) {
  await exigirEdicao();
  assertCod(codIbge);
  await sql`
    DELETE FROM ldo_metas_fiscais
    WHERE cod_ibge = ${codIbge} AND exercicio = ${exercicio} AND indicador = ${indicador}
  `;
  invalidate(codIbge);
}

// ============================================================
// FONTES DE RECURSOS — Module 1
// ============================================================

export async function criarFonteRecurso(data: {
  codIbge: number;
  exercicio: number;
  codigo: string;
  nome: string;
  vinculacao?: string;
}) {
  await exigirEdicao();
  assertCod(data.codIbge);

  const codigo = data.codigo?.trim();
  const nome = data.nome?.trim();
  if (!codigo || !nome) throw new Error("Código e nome obrigatórios");

  await sql`
    INSERT INTO fontes_recursos (cod_ibge, exercicio, codigo, nome, vinculacao)
    VALUES (${data.codIbge}, ${data.exercicio}, ${codigo}, ${nome}, ${data.vinculacao?.trim() || null})
    ON CONFLICT (cod_ibge, exercicio, codigo) DO UPDATE SET
      nome = EXCLUDED.nome,
      vinculacao = EXCLUDED.vinculacao
  `;
  invalidate(data.codIbge);
}

export async function removerFonteRecurso(id: number, codIbge: number) {
  await exigirEdicao();
  assertCod(codIbge);
  await sql`DELETE FROM fontes_recursos WHERE id = ${id} AND cod_ibge = ${codIbge}`;
  invalidate(codIbge);
}

// ============================================================
// Helpers
// ============================================================

function invalidate(codIbge: number) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}`);
  revalidatePath(`${basePath}/municipio/${codIbge}/cadastro`, "layout");
}
