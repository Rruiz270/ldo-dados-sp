import { sql } from "@/lib/db";
import { Section, Eyebrow, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { Building2, BookOpen, Target, Coins, ListTree, Users, ArrowRight, Check } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface Snapshot {
  orgaos: number;
  orgaos_com_responsavel: number;
  unidades: number;
  programas: number;
  acoes: number;
  metas_fiscais: number;
  metas_fisicas: number;
  fontes: number;
}

export default async function CadastroOverview({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let snap: Snapshot = {
    orgaos: 0,
    orgaos_com_responsavel: 0,
    unidades: 0,
    programas: 0,
    acoes: 0,
    metas_fiscais: 0,
    metas_fisicas: 0,
    fontes: 0,
  };

  try {
    const rows = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM orgaos WHERE cod_ibge = ${codNum} AND ativo = TRUE) AS orgaos,
        (SELECT COUNT(*)::int FROM orgaos WHERE cod_ibge = ${codNum} AND ativo = TRUE AND responsavel IS NOT NULL) AS orgaos_com_responsavel,
        (SELECT COUNT(*)::int FROM unidades_orcamentarias WHERE cod_ibge = ${codNum}) AS unidades,
        (SELECT COUNT(*)::int FROM programas WHERE cod_ibge = ${codNum}) AS programas,
        (SELECT COUNT(*)::int FROM acoes a JOIN programas p ON p.id = a.programa_id WHERE p.cod_ibge = ${codNum}) AS acoes,
        (SELECT COUNT(*)::int FROM ldo_metas_fiscais WHERE cod_ibge = ${codNum}) AS metas_fiscais,
        (SELECT COUNT(*)::int FROM metas_fisicas mf JOIN acoes a ON a.id = mf.acao_id JOIN programas p ON p.id = a.programa_id WHERE p.cod_ibge = ${codNum}) AS metas_fisicas,
        (SELECT COUNT(*)::int FROM fontes_recursos WHERE cod_ibge = ${codNum}) AS fontes
    `) as Snapshot[];
    snap = rows[0] ?? snap;
  } catch (e) {
    console.error("[cadastro overview]", e);
  }

  const completo = snap.orgaos > 0 && snap.orgaos_com_responsavel > 0 && snap.metas_fiscais > 0;
  const podeEditar = perfil.podeEditarCadastro;

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Módulo 1 — Cadastro institucional</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Cadastro institucional
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Registre a realidade institucional do município — órgãos, unidades orçamentárias, programas, ações,
          metas e responsáveis técnicos. Esses dados permitem calcular indicadores personalizados, gerar alertas
          com responsável designado e produzir relatórios por órgão e por programa.
        </p>
      </header>

      {!podeEditar && (
        <Placeholder
          titulo="Visualização somente leitura"
          descricao={`Perfil "${perfil.nome}" pode ver os cadastros, mas não editá-los. Para incluir/alterar dados, troque o perfil no topo para Prefeito ou Secretário.`}
        />
      )}

      {/* Status geral */}
      <Section
        title="Status do cadastro"
        subtitle={completo
          ? "Cadastro mínimo institucional preenchido."
          : "Complete o cadastro mínimo (órgãos + responsáveis + metas LDO) para liberar parametrização e relatórios setoriais."}
      >
        <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusItem label="Órgãos cadastrados" valor={snap.orgaos} esperado={snap.orgaos > 0} />
          <StatusItem label="Com responsável" valor={snap.orgaos_com_responsavel} esperado={snap.orgaos_com_responsavel > 0} />
          <StatusItem label="Programas" valor={snap.programas} esperado={snap.programas > 0} />
          <StatusItem label="Metas fiscais LDO" valor={snap.metas_fiscais} esperado={snap.metas_fiscais > 0} />
          <StatusItem label="Ações" valor={snap.acoes} esperado={snap.acoes > 0} />
          <StatusItem label="Metas físicas" valor={snap.metas_fisicas} esperado={snap.metas_fisicas > 0} />
          <StatusItem label="Unidades orçamentárias" valor={snap.unidades} esperado={snap.unidades > 0} />
          <StatusItem label="Fontes de recursos" valor={snap.fontes} esperado={snap.fontes > 0} />
        </div>
      </Section>

      {/* Cards de cada entidade */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <CadastroCard
          href={`${basePath}/municipio/${codNum}/cadastro/orgaos`}
          Icon={Building2}
          titulo="Órgãos"
          descricao="Executivo, Legislativo, autarquias, fundações, fundos e consórcios."
          quantidade={snap.orgaos}
          podeEditar={podeEditar}
        />
        <CadastroCard
          href={`${basePath}/municipio/${codNum}/cadastro/programas`}
          Icon={BookOpen}
          titulo="Programas"
          descricao="Programas do PPA com objetivo, área e público-alvo."
          quantidade={snap.programas}
          podeEditar={podeEditar}
        />
        <CadastroCard
          href={`${basePath}/municipio/${codNum}/cadastro/metas`}
          Icon={Target}
          titulo="Metas fiscais LDO"
          descricao="Resultado primário/nominal, receita/despesa total, dívida."
          quantidade={snap.metas_fiscais}
          podeEditar={podeEditar}
        />
        <CadastroCard
          href={`${basePath}/municipio/${codNum}/cadastro/fontes-recursos`}
          Icon={Coins}
          titulo="Fontes de recursos"
          descricao="Códigos de fonte com vinculação (livre, educação, saúde, etc.)"
          quantidade={snap.fontes}
          podeEditar={podeEditar}
        />
        <CadastroCard
          href={`${basePath}/municipio/${codNum}/cadastro/unidades`}
          Icon={ListTree}
          titulo="Unidades orçamentárias"
          descricao="Unidades por órgão e exercício. (Em construção)"
          quantidade={snap.unidades}
          podeEditar={podeEditar}
          comingSoon
        />
        <CadastroCard
          href={`${basePath}/municipio/${codNum}/cadastro/responsaveis`}
          Icon={Users}
          titulo="Responsáveis técnicos"
          descricao="Visão consolidada dos responsáveis nomeados nos órgãos."
          quantidade={snap.orgaos_com_responsavel}
          podeEditar={podeEditar}
        />
      </div>
    </div>
  );
}

function StatusItem({ label, valor, esperado }: { label: string; valor: number; esperado: boolean }) {
  return (
    <div
      className="p-3 rounded-xl"
      style={{
        background: esperado ? "rgba(29,138,67,0.06)" : "rgba(102,112,133,0.05)",
        border: `1px solid ${esperado ? "rgba(29,138,67,0.15)" : "rgba(102,112,133,0.12)"}`,
      }}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-2xl font-bold" style={{ color: esperado ? "var(--verde-2)" : "var(--cinza)", letterSpacing: "-0.03em" }}>
          {valor}
        </span>
        {esperado && <Check size={16} strokeWidth={2.5} style={{ color: "var(--verde-2)" }} aria-hidden />}
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--cinza)" }}>
        {label}
      </div>
    </div>
  );
}

function CadastroCard({
  href,
  Icon,
  titulo,
  descricao,
  quantidade,
  podeEditar,
  comingSoon,
}: {
  href: string;
  Icon: React.ElementType;
  titulo: string;
  descricao: string;
  quantidade: number;
  podeEditar: boolean;
  comingSoon?: boolean;
}) {
  const conteudo = (
    <div
      className="p-5 rounded-2xl h-full flex flex-col"
      style={{
        background: "white",
        border: "1px solid rgba(11,47,99,0.09)",
        boxShadow: "0 8px 22px rgba(11,47,99,0.06)",
        opacity: comingSoon ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="inline-flex items-center justify-center w-10 h-10 rounded-xl"
          style={{ background: "rgba(11,47,99,0.08)", color: "var(--azul-2)" }}
        >
          <Icon size={20} strokeWidth={1.75} />
        </div>
        <span className="text-2xl font-bold" style={{ color: quantidade > 0 ? "var(--azul)" : "var(--cinza)" }}>
          {quantidade}
        </span>
      </div>
      <div className="font-bold text-base mb-1" style={{ color: "var(--azul)" }}>
        {titulo} {comingSoon && <span className="text-[10px] uppercase font-bold" style={{ color: "var(--cinza)" }}>· em breve</span>}
      </div>
      <p className="text-xs flex-1" style={{ color: "var(--cinza)" }}>{descricao}</p>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--verde-2)" }}>
        {podeEditar && !comingSoon ? "Editar" : "Ver"} <ArrowRight size={12} aria-hidden />
      </div>
    </div>
  );
  if (comingSoon) return conteudo;
  return <a href={href} className="block hover:scale-[1.01] transition-transform">{conteudo}</a>;
}
