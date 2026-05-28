"use server";

import { sql } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

export async function criarProvidencia(input: CriarInput) {
  const descricao = input.descricao?.trim();
  if (!descricao) throw new Error("Descrição obrigatória");

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
      ${input.evidenciaUrl?.trim() || null},
      'pendente'
    )
    RETURNING id
  `) as Array<{ id: number }>;

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  // Se veio de um alerta, marca o alerta como 'em_andamento'
  if (input.alertaId) {
    await sql`UPDATE alertas SET status = 'em_andamento' WHERE id = ${input.alertaId}`;
  }
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
  observacao?: string | null;
}

export async function atualizarProvidencia(input: AtualizarInput) {
  // Postgres lib não aceita SET dinâmico facilmente; faz UPDATEs separados quando informados.
  if (input.status !== undefined) {
    await sql`UPDATE providencias SET status = ${input.status}, atualizado_em = NOW() WHERE id = ${input.id}`;
  }
  if (input.responsavel !== undefined) {
    await sql`UPDATE providencias SET responsavel = ${input.responsavel || null}, atualizado_em = NOW() WHERE id = ${input.id}`;
  }
  if (input.prazo !== undefined) {
    await sql`UPDATE providencias SET prazo = ${input.prazo || null}, atualizado_em = NOW() WHERE id = ${input.id}`;
  }
  if (input.evidenciaUrl !== undefined) {
    await sql`UPDATE providencias SET evidencia_url = ${input.evidenciaUrl || null}, atualizado_em = NOW() WHERE id = ${input.id}`;
  }

  // Se concluiu/justificou, fecha o alerta vinculado (se houver)
  if (input.status === "concluida" || input.status === "justificada") {
    await sql`
      UPDATE alertas SET status = 'concluido', fechado_em = NOW()
      WHERE id = (SELECT alerta_id FROM providencias WHERE id = ${input.id})
        AND alerta_id IS NOT NULL
    `;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${input.codIbge}/providencias`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/providencias/${input.id}`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}/alertas`);
  revalidatePath(`${basePath}/municipio/${input.codIbge}`);
}

export async function descartarAlerta(alertaId: number, codIbge: number) {
  await sql`UPDATE alertas SET status = 'descartado', fechado_em = NOW() WHERE id = ${alertaId}`;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}/alertas`);
  revalidatePath(`${basePath}/municipio/${codIbge}`);
}

export async function regerarAlertas(codIbge: number) {
  await sql`SELECT regerar_alertas_munic(${codIbge})`;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  revalidatePath(`${basePath}/municipio/${codIbge}`);
  revalidatePath(`${basePath}/municipio/${codIbge}/alertas`);
}
