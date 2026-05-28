"use server";

import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getPerfilAtivo } from "@/lib/perfil";

async function exigirImport() {
  const perfil = await getPerfilAtivo();
  if (!perfil.podeImportarDados) {
    throw new Error(
      `Perfil "${perfil.nome}" não pode importar dados. Mude para Secretário de Finanças.`,
    );
  }
}

function assertCod(cod: number) {
  if (!Number.isFinite(cod) || cod <= 0) throw new Error("Município inválido");
}

function inv(codIbge: number) {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}/importar`);
  revalidatePath(`${basePath}/municipio/${codIbge}/divida`);
  revalidatePath(`${basePath}/municipio/${codIbge}/riscos`);
  revalidatePath(`${basePath}/municipio/${codIbge}`);
}

// =====================================================================
// PRECATÓRIOS
// =====================================================================

export async function criarPrecatorio(input: {
  codIbge: number;
  exercicio: number;
  valorTotal: number;
  qtdProcessos?: number;
  classificacao: string;
  observacoes?: string;
}) {
  await exigirImport();
  assertCod(input.codIbge);
  if (!Number.isFinite(input.exercicio)) throw new Error("Exercício inválido");
  if (!Number.isFinite(input.valorTotal) || input.valorTotal < 0) throw new Error("Valor inválido");
  const classif = input.classificacao;
  if (!["alimentar", "comum"].includes(classif)) throw new Error("Classificação inválida");

  await sql`
    INSERT INTO precatorios (cod_ibge, exercicio, valor_total, qtd_processos, classificacao, observacoes)
    VALUES (${input.codIbge}, ${input.exercicio}, ${input.valorTotal}, ${input.qtdProcessos ?? null}, ${classif}, ${input.observacoes?.trim() || null})
    ON CONFLICT (cod_ibge, exercicio, classificacao) DO UPDATE SET
      valor_total = EXCLUDED.valor_total,
      qtd_processos = EXCLUDED.qtd_processos,
      observacoes = EXCLUDED.observacoes,
      atualizado_em = NOW()
  `;
  inv(input.codIbge);
}

export async function removerPrecatorio(codIbge: number, exercicio: number, classificacao: string) {
  await exigirImport();
  assertCod(codIbge);
  await sql`
    DELETE FROM precatorios
    WHERE cod_ibge = ${codIbge} AND exercicio = ${exercicio} AND classificacao = ${classificacao}
  `;
  inv(codIbge);
}

// =====================================================================
// CONTRATOS CONTINUADOS
// =====================================================================

export async function criarContrato(input: {
  codIbge: number;
  numeroContrato?: string;
  objeto: string;
  contratado?: string;
  cnpjContratado?: string;
  valorAnual?: number;
  dataInicio?: string;
  dataFim?: string;
  modalidade?: string;
  area?: string;
  riscoParalisacao?: string;
  observacoes?: string;
}) {
  await exigirImport();
  assertCod(input.codIbge);
  if (!input.objeto?.trim()) throw new Error("Objeto obrigatório");

  await sql`
    INSERT INTO contratos_continuados (
      cod_ibge, numero_contrato, objeto, contratado, cnpj_contratado,
      valor_anual, data_inicio, data_fim, modalidade, area,
      risco_paralisacao, observacoes
    ) VALUES (
      ${input.codIbge},
      ${input.numeroContrato?.trim() || null},
      ${input.objeto.trim()},
      ${input.contratado?.trim() || null},
      ${input.cnpjContratado?.trim() || null},
      ${input.valorAnual ?? null},
      ${input.dataInicio || null},
      ${input.dataFim || null},
      ${input.modalidade?.trim() || null},
      ${input.area?.trim() || null},
      ${input.riscoParalisacao?.trim() || null},
      ${input.observacoes?.trim() || null}
    )
  `;
  inv(input.codIbge);
}

export async function removerContrato(id: number, codIbge: number) {
  await exigirImport();
  assertCod(codIbge);
  await sql`DELETE FROM contratos_continuados WHERE id = ${id} AND cod_ibge = ${codIbge}`;
  inv(codIbge);
}

// =====================================================================
// CONVÊNIOS
// =====================================================================

export async function criarConvenio(input: {
  codIbge: number;
  numeroConvenio?: string;
  objeto: string;
  concedente?: string;
  esferaConcedente?: string;
  valorTotal?: number;
  valorContrapartida?: number;
  dataInicio?: string;
  dataFim?: string;
  status?: string;
  area?: string;
  observacoes?: string;
}) {
  await exigirImport();
  assertCod(input.codIbge);
  if (!input.objeto?.trim()) throw new Error("Objeto obrigatório");

  await sql`
    INSERT INTO convenios (
      cod_ibge, numero_convenio, objeto, concedente, esfera_concedente,
      valor_total, valor_contrapartida, data_inicio, data_fim, status, area, observacoes
    ) VALUES (
      ${input.codIbge},
      ${input.numeroConvenio?.trim() || null},
      ${input.objeto.trim()},
      ${input.concedente?.trim() || null},
      ${input.esferaConcedente?.trim() || null},
      ${input.valorTotal ?? null},
      ${input.valorContrapartida ?? null},
      ${input.dataInicio || null},
      ${input.dataFim || null},
      ${input.status?.trim() || "em_execucao"},
      ${input.area?.trim() || null},
      ${input.observacoes?.trim() || null}
    )
  `;
  inv(input.codIbge);
}

export async function removerConvenio(id: number, codIbge: number) {
  await exigirImport();
  assertCod(codIbge);
  await sql`DELETE FROM convenios WHERE id = ${id} AND cod_ibge = ${codIbge}`;
  inv(codIbge);
}

// =====================================================================
// RISCOS MANUAIS
// =====================================================================

export async function criarRiscoManual(input: {
  codIbge: number;
  tipo: string;
  titulo: string;
  descricao?: string;
  nivel: string;
  valorReferencia?: number;
}) {
  await exigirImport();
  assertCod(input.codIbge);
  if (!input.titulo?.trim()) throw new Error("Título obrigatório");
  const tiposValidos = ["receita", "despesa", "divida", "judicial", "previdenciario", "contratual", "orcamentario", "externo"];
  if (!tiposValidos.includes(input.tipo)) throw new Error("Tipo de risco inválido");
  if (!["baixo", "medio", "alto", "critico"].includes(input.nivel)) throw new Error("Nível inválido");

  await sql`
    INSERT INTO riscos (cod_ibge, tipo, titulo, descricao, nivel, valor_referencia, status)
    VALUES (
      ${input.codIbge},
      ${input.tipo},
      ${input.titulo.trim()},
      ${input.descricao?.trim() || null},
      ${input.nivel},
      ${input.valorReferencia ?? null},
      'aberto'
    )
  `;
  inv(input.codIbge);
}

export async function removerRisco(id: number, codIbge: number) {
  await exigirImport();
  assertCod(codIbge);
  await sql`DELETE FROM riscos WHERE id = ${id} AND cod_ibge = ${codIbge}`;
  inv(codIbge);
}
