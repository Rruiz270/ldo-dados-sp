"use server";

import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPerfilAtivo } from "@/lib/perfil";

export type ProvidenciaStatus = "pendente" | "em_andamento" | "concluida" | "justificada" | "cancelada";

interface CriarInput {
  codIbge: number;
  alertaId?: number | null;
  riscoId?: number | null;
  descricao: string;
  responsavel?: string;
  prazo?: string;       // YYYY-MM-DD
  evidenciaUrl?: string;
}

// Aceita apenas http(s) — bloqueia javascript:, data:, file:, etc.
function validarUrlOuVazio(url: string | null | undefined): string | null {
  if (!url) return null;
  const trim = url.trim();
  if (!trim) return null;
  try {
    const u = new URL(trim);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("URL deve usar http:// ou https://");
    }
    return trim;
  } catch {
    throw new Error("URL de evidência inválida — use http:// ou https://");
  }
}

async function exigirPermissao(acao: "criar_providencia") {
  const perfil = await getPerfilAtivo();
  if (acao === "criar_providencia" && !perfil.podeCriarProvidencia) {
    throw new Error(
      `Perfil "${perfil.nome}" não tem permissão para esta ação. Mude para Prefeito, Secretário ou Controle Interno.`,
    );
  }
  return perfil;
}

export async function criarProvidencia(input: CriarInput) {
  await exigirPermissao("criar_providencia");

  const descricao = input.descricao?.trim();
  if (!descricao) throw new Error("Descrição obrigatória");
  if (!Number.isFinite(input.codIbge) || input.codIbge <= 0) throw new Error("Município inválido");
  const evidenciaUrl = validarUrlOuVazio(input.evidenciaUrl);

  // Valida que alerta/risco (se vinculados) pertencem ao mesmo município
  if (input.alertaId) {
    const ok = (await sql`
      SELECT id FROM alertas WHERE id = ${input.alertaId} AND cod_ibge = ${input.codIbge}
    `) as Array<{ id: number }>;
    if (ok.length === 0) throw new Error("Alerta de origem não pertence a este município");
  }
  if (input.riscoId) {
    const ok = (await sql`
      SELECT id FROM riscos WHERE id = ${input.riscoId} AND cod_ibge = ${input.codIbge}
    `) as Array<{ id: number }>;
    if (ok.length === 0) throw new Error("Risco de origem não pertence a este município");
  }

  const rows = (await sql`
    INSERT INTO providencias (
      cod_ibge, alerta_id, risco_id, descricao, responsavel, prazo, evidencia_url, status
    ) VALUES (
      ${input.codIbge},
      ${input.alertaId ?? null},
      ${input.riscoId ?? null},
      ${descricao},
      ${input.responsavel?.trim() || null},
      ${input.prazo || null},
      ${evidenciaUrl},
      'pendente'
    )
    RETURNING id
  `) as Array<{ id: number }>;

  if (input.alertaId) {
    await sql`
      UPDATE alertas SET status = 'em_andamento'
      WHERE id = ${input.alertaId} AND cod_ibge = ${input.codIbge}
    `;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${input.codIbge}`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/providencias`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/alertas`);
  redirect(`${basePath}/municipio/${input.codIbge}/providencias/${rows[0].id}`);
}

interface AtualizarInput {
  id: number;
  codIbge: number;
  status?: ProvidenciaStatus;
  responsavel?: string | null;
  prazo?: string | null;
  evidenciaUrl?: string | null;
}

const STATUS_VALIDOS: ProvidenciaStatus[] = ["pendente", "em_andamento", "concluida", "justificada", "cancelada"];

export async function atualizarProvidencia(input: AtualizarInput) {
  await exigirPermissao("criar_providencia");

  if (!Number.isFinite(input.id) || input.id <= 0) throw new Error("Providência inválida");
  if (!Number.isFinite(input.codIbge) || input.codIbge <= 0) throw new Error("Município inválido");
  if (input.status && !STATUS_VALIDOS.includes(input.status)) throw new Error("Status inválido");

  const evidenciaUrl = input.evidenciaUrl !== undefined
    ? validarUrlOuVazio(input.evidenciaUrl)
    : undefined;

  // Confirma que providência pertence ao município ANTES de updates
  const exists = (await sql`
    SELECT id FROM providencias WHERE id = ${input.id} AND cod_ibge = ${input.codIbge}
  `) as Array<{ id: number }>;
  if (exists.length === 0) throw new Error("Providência não encontrada neste município");

  // Todos os UPDATEs incluem cod_ibge no WHERE como defesa em profundidade
  if (input.status !== undefined) {
    await sql`
      UPDATE providencias SET status = ${input.status}, atualizado_em = NOW()
      WHERE id = ${input.id} AND cod_ibge = ${input.codIbge}
    `;
  }
  if (input.responsavel !== undefined) {
    await sql`
      UPDATE providencias SET responsavel = ${input.responsavel || null}, atualizado_em = NOW()
      WHERE id = ${input.id} AND cod_ibge = ${input.codIbge}
    `;
  }
  if (input.prazo !== undefined) {
    await sql`
      UPDATE providencias SET prazo = ${input.prazo || null}, atualizado_em = NOW()
      WHERE id = ${input.id} AND cod_ibge = ${input.codIbge}
    `;
  }
  if (evidenciaUrl !== undefined) {
    await sql`
      UPDATE providencias SET evidencia_url = ${evidenciaUrl}, atualizado_em = NOW()
      WHERE id = ${input.id} AND cod_ibge = ${input.codIbge}
    `;
  }

  // Fechar alerta vinculado se concluído/justificado, restrito ao mesmo município
  if (input.status === "concluida" || input.status === "justificada") {
    await sql`
      UPDATE alertas SET status = 'concluido', fechado_em = NOW()
      WHERE id = (
        SELECT alerta_id FROM providencias
        WHERE id = ${input.id} AND cod_ibge = ${input.codIbge}
      ) AND cod_ibge = ${input.codIbge}
    `;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${input.codIbge}/providencias`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/providencias/${input.id}`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/alertas`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}`);
}

export async function descartarAlerta(alertaId: number, codIbge: number) {
  await exigirPermissao("criar_providencia");
  if (!Number.isFinite(alertaId) || !Number.isFinite(codIbge)) throw new Error("IDs inválidos");
  await sql`
    UPDATE alertas SET status = 'descartado', fechado_em = NOW()
    WHERE id = ${alertaId} AND cod_ibge = ${codIbge}
  `;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}/alertas`);
  revalidatePath(`${basePath}/municipio/${codIbge}`);
}

export async function regerarAlertas(codIbge: number) {
  await exigirPermissao("criar_providencia");
  if (!Number.isFinite(codIbge) || codIbge <= 0) throw new Error("Município inválido");
  await sql`SELECT regerar_alertas_munic(${codIbge})`;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}`);
  revalidatePath(`${basePath}/municipio/${codIbge}/alertas`);
}

