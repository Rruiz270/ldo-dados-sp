import { sql } from "@/lib/db";
import { Section, Eyebrow, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { notFound } from "next/navigation";
import { criarProvidencia } from "../actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps {
  params: Promise<{ cod: string }>;
  searchParams: Promise<{ alerta?: string; risco?: string }>;
}

interface AlertaCtx {
  id: number;
  mensagem: string;
  base_legal: string | null;
  categoria: string | null;
  nivel: string;
}

interface RiscoCtx {
  id: number;
  titulo: string;
  descricao: string | null;
  nivel: string;
  tipo: string;
}

export default async function NovaProvidenciaPage({ params, searchParams }: PageProps) {
  const { cod } = await params;
  const { alerta: alertaIdStr, risco: riscoIdStr } = await searchParams;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  if (!perfil.podeCriarProvidencia) {
    return (
      <div className="space-y-5">
        <Placeholder
          titulo="Sem permissão"
          descricao={`O perfil "${perfil.nome}" não pode criar providências. Mude para Prefeito, Secretário ou Controle Interno no switcher no topo.`}
        />
      </div>
    );
  }

  let alerta: AlertaCtx | null = null;
  let risco: RiscoCtx | null = null;

  if (alertaIdStr) {
    const rows = (await sql`
      SELECT id, mensagem, base_legal, categoria, nivel
      FROM alertas WHERE id = ${parseInt(alertaIdStr, 10)} AND cod_ibge = ${codNum}
    `) as AlertaCtx[];
    alerta = rows[0] ?? null;
    if (!alerta) notFound();
  } else if (riscoIdStr) {
    const rows = (await sql`
      SELECT id, titulo, descricao, nivel, tipo
      FROM riscos WHERE id = ${parseInt(riscoIdStr, 10)} AND cod_ibge = ${codNum}
    `) as RiscoCtx[];
    risco = rows[0] ?? null;
    if (!risco) notFound();
  }

  // Sugestão de descrição baseada no contexto
  const descricaoInicial = alerta
    ? `Providência para: ${alerta.mensagem}`
    : risco
    ? `Mitigação do risco: ${risco.titulo}`
    : "";

  // Server action wrapper (closure sobre cod_ibge / alerta_id)
  async function action(formData: FormData) {
    "use server";
    await criarProvidencia({
      codIbge: codNum,
      alertaId: alertaIdStr ? parseInt(alertaIdStr, 10) : null,
      riscoId: riscoIdStr ? parseInt(riscoIdStr, 10) : null,
      descricao: String(formData.get("descricao") || "").trim(),
      responsavel: String(formData.get("responsavel") || "").trim(),
      prazo: String(formData.get("prazo") || "").trim(),
      evidenciaUrl: String(formData.get("evidencia_url") || "").trim(),
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <Eyebrow>Nova providência</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          {alerta ? "Responder a alerta" : risco ? "Mitigar risco" : "Criar providência"}
        </h1>
        <p className="text-sm mt-2" style={{ color: "var(--cinza)" }}>
          Descreva a ação concreta, atribua responsável, defina prazo e (opcionalmente) anexe URL de evidência.
        </p>
      </header>

      {alerta && (
        <Section title="Alerta de origem" subtitle="Esta providência ficará vinculada a este alerta.">
          <div className="p-4">
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--azul)" }}>
              {alerta.mensagem}
            </div>
            <div className="text-xs flex flex-wrap gap-2" style={{ color: "var(--cinza)" }}>
              <span className="capitalize font-bold">{alerta.nivel}</span>
              {alerta.categoria && <span>· {alerta.categoria}</span>}
              {alerta.base_legal && <span>· {alerta.base_legal}</span>}
            </div>
          </div>
        </Section>
      )}

      {risco && (
        <Section title="Risco de origem" subtitle="Esta providência ficará vinculada a este risco.">
          <div className="p-4">
            <div className="text-sm font-semibold mb-1" style={{ color: "var(--azul)" }}>
              {risco.titulo}
            </div>
            {risco.descricao && (
              <div className="text-xs mb-2" style={{ color: "var(--grafite)" }}>{risco.descricao}</div>
            )}
            <div className="text-xs flex flex-wrap gap-2" style={{ color: "var(--cinza)" }}>
              <span className="capitalize font-bold">{risco.nivel}</span>
              <span className="capitalize">· {risco.tipo}</span>
            </div>
          </div>
        </Section>
      )}

      <form action={action} className="space-y-5">
        <Field label="Descrição da providência *" hint="Ex.: Limitar empenho em 5% até o próximo bimestre.">
          <textarea
            name="descricao"
            required
            defaultValue={descricaoInicial}
            rows={3}
            className="w-full p-3 rounded-xl text-sm"
            style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Responsável" hint="Nome ou setor encarregado da execução.">
            <input
              type="text"
              name="responsavel"
              className="w-full p-3 rounded-xl text-sm"
              placeholder="Ex.: Secretaria de Finanças"
              style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
            />
          </Field>
          <Field label="Prazo" hint="Data limite para conclusão.">
            <input
              type="date"
              name="prazo"
              className="w-full p-3 rounded-xl text-sm"
              style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
            />
          </Field>
        </div>

        <Field label="URL de evidência (opcional)" hint="Link para ato administrativo, ofício, planilha ou documento comprobatório.">
          <input
            type="url"
            name="evidencia_url"
            className="w-full p-3 rounded-xl text-sm"
            placeholder="https://"
            style={{ border: "1px solid rgba(11,47,99,0.15)", color: "var(--grafite)" }}
          />
        </Field>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold"
            style={{ background: "var(--verde-2)", color: "white" }}
          >
            Criar providência
          </button>
          <a
            href={`${basePath}/municipio/${codNum}/providencias`}
            className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold"
            style={{ background: "white", border: "1px solid rgba(11,47,99,0.15)", color: "var(--cinza)" }}
          >
            Cancelar
          </a>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold block mb-1.5" style={{ color: "var(--azul)" }}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs block mt-1" style={{ color: "var(--cinza)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
