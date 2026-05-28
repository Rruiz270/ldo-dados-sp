import { sql } from "@/lib/db";
import { Section, Eyebrow, Placeholder } from "@/components/ModuloUI";
import { getPerfilAtivo } from "@/lib/perfil";
import { Gavel, FileSignature, HandshakeIcon, AlertTriangle, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PageProps { params: Promise<{ cod: string }>; }

interface Snapshot {
  precatorios: number;
  contratos: number;
  convenios: number;
  riscos: number;
  valor_precatorios: string | null;
  valor_contratos: string | null;
  valor_convenios: string | null;
}

export default async function ImportarOverview({ params }: PageProps) {
  const { cod } = await params;
  const codNum = parseInt(cod, 10);
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const perfil = await getPerfilAtivo();

  let snap: Snapshot = {
    precatorios: 0,
    contratos: 0,
    convenios: 0,
    riscos: 0,
    valor_precatorios: null,
    valor_contratos: null,
    valor_convenios: null,
  };

  try {
    const rows = (await sql`
      SELECT
        (SELECT COUNT(*)::int FROM precatorios WHERE cod_ibge = ${codNum}) AS precatorios,
        (SELECT COUNT(*)::int FROM contratos_continuados WHERE cod_ibge = ${codNum}) AS contratos,
        (SELECT COUNT(*)::int FROM convenios WHERE cod_ibge = ${codNum}) AS convenios,
        (SELECT COUNT(*)::int FROM riscos WHERE cod_ibge = ${codNum} AND status='aberto') AS riscos,
        (SELECT SUM(valor_total)::text FROM precatorios WHERE cod_ibge = ${codNum}) AS valor_precatorios,
        (SELECT SUM(valor_anual)::text FROM contratos_continuados WHERE cod_ibge = ${codNum}) AS valor_contratos,
        (SELECT SUM(valor_total)::text FROM convenios WHERE cod_ibge = ${codNum} AND status='em_execucao') AS valor_convenios
    `) as Snapshot[];
    snap = rows[0] ?? snap;
  } catch (e) {
    console.error("[importar overview]", e);
  }

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Módulo 7 + 8 · Importação manual</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{ color: "var(--azul)", fontSize: "clamp(24px, 3vw, 36px)", letterSpacing: "-0.03em", lineHeight: 1.1 }}
        >
          Importar dados internos
        </h1>
        <p className="text-sm mt-2 max-w-3xl" style={{ color: "var(--cinza)" }}>
          Dados que não vêm de fontes públicas devem ser cadastrados pelo município: precatórios,
          contratos continuados, convênios, riscos identificados localmente. Esses dados entram nos
          relatórios gerenciais e podem disparar alertas.
        </p>
      </header>

      {!perfil.podeImportarDados && (
        <Placeholder
          titulo="Visualização somente leitura"
          descricao={`Perfil "${perfil.nome}" não pode importar dados. Mude para Secretário de Finanças no switcher do topo para cadastrar/editar.`}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CardImport
          href={`${basePath}/municipio/${codNum}/importar/precatorios`}
          Icon={Gavel}
          titulo="Precatórios"
          descricao="Passivos judiciais transitados em julgado — CF Art. 100. Distinção alimentar/comum."
          quantidade={snap.precatorios}
          valor={snap.valor_precatorios}
          valorLabel="total"
        />
        <CardImport
          href={`${basePath}/municipio/${codNum}/importar/contratos`}
          Icon={FileSignature}
          titulo="Contratos continuados"
          descricao="Despesas obrigatórias de caráter continuado — LRF Art. 16. Risco de paralisação."
          quantidade={snap.contratos}
          valor={snap.valor_contratos}
          valorLabel="anual"
        />
        <CardImport
          href={`${basePath}/municipio/${codNum}/importar/convenios`}
          Icon={HandshakeIcon}
          titulo="Convênios"
          descricao="Transferências voluntárias com concedente federal/estadual. Valor + contrapartida."
          quantidade={snap.convenios}
          valor={snap.valor_convenios}
          valorLabel="em execução"
        />
        <CardImport
          href={`${basePath}/municipio/${codNum}/importar/riscos`}
          Icon={AlertTriangle}
          titulo="Riscos identificados"
          descricao="Riscos fiscais, judiciais, contratuais, previdenciários cadastrados manualmente."
          quantidade={snap.riscos}
          valor={null}
          valorLabel=""
        />
      </div>
    </div>
  );
}

function CardImport({
  href,
  Icon,
  titulo,
  descricao,
  quantidade,
  valor,
  valorLabel,
}: {
  href: string;
  Icon: React.ElementType;
  titulo: string;
  descricao: string;
  quantidade: number;
  valor: string | null;
  valorLabel: string;
}) {
  const valorFmt = valor && Number(valor) > 0
    ? Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
    : null;

  return (
    <a
      href={href}
      className="block hover:scale-[1.01] transition-transform"
    >
      <div
        className="p-5 rounded-2xl h-full"
        style={{
          background: "white",
          border: "1px solid rgba(11,47,99,0.09)",
          boxShadow: "0 8px 22px rgba(11,47,99,0.06)",
        }}
      >
        <div className="flex items-start justify-between mb-3">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl"
            style={{ background: "rgba(11,47,99,0.08)", color: "var(--azul-2)" }}
          >
            <Icon size={20} strokeWidth={1.75} />
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: quantidade > 0 ? "var(--azul)" : "var(--cinza)" }}>
              {quantidade}
            </div>
            {valorFmt && (
              <div className="text-[10px] uppercase font-bold tracking-widest mt-1" style={{ color: "var(--cinza)", letterSpacing: "0.08em" }}>
                {valorFmt} {valorLabel}
              </div>
            )}
          </div>
        </div>
        <div className="font-bold text-base mb-1" style={{ color: "var(--azul)" }}>{titulo}</div>
        <p className="text-xs" style={{ color: "var(--cinza)" }}>{descricao}</p>
        <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold" style={{ color: "var(--verde-2)" }}>
          Abrir <ArrowRight size={12} aria-hidden />
        </div>
      </div>
    </a>
  );
}
