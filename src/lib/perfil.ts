// Perfis simulados (sem auth ainda) — replicam estrutura da tabela perfis_usuario.
// Quando plugar Better-Auth, esse arquivo vira o source-of-truth do RBAC.

export type PerfilId =
  | "publico"
  | "prefeito"
  | "secretario"
  | "controle_interno"
  | "camara"
  | "vereador";

// Cada perfil mapeia para uma VISÃO (painel) — não há auth, são só visões.
//   executiva     → consolidado estratégico (Prefeito)
//   pasta         → metas físicas por área/órgão (Secretário de pasta)
//   financas      → execução/caixa/limites (Secretário de Finanças)
//   conformidade  → faixas amarela/vermelha + alertas (Controle/Câmara/Vereador)
//   transparencia → visão pública padrão
export type TipoVisao =
  | "executiva"
  | "pasta"
  | "financas"
  | "conformidade"
  | "transparencia";

export interface Perfil {
  id: PerfilId;
  nome: string;
  descricao: string;
  cor: string;
  tipoVisao: TipoVisao;
  podeVerAlertas: boolean;
  podeCriarProvidencia: boolean;
  podeEditarCadastro: boolean;
  podeImportarDados: boolean;
  podeVerAudit: boolean;
}

export const PERFIS: Perfil[] = [
  {
    id: "publico",
    nome: "Público",
    descricao: "Visualização de transparência",
    cor: "#667085",
    tipoVisao: "transparencia",
    podeVerAlertas: true,
    podeCriarProvidencia: false,
    podeEditarCadastro: false,
    podeImportarDados: false,
    podeVerAudit: false,
  },
  {
    id: "prefeito",
    nome: "Prefeito",
    descricao: "Visão estratégica e riscos",
    cor: "#4eb51f",
    tipoVisao: "executiva",
    podeVerAlertas: true,
    podeCriarProvidencia: true,
    podeEditarCadastro: true,
    podeImportarDados: false,
    podeVerAudit: true,
  },
  {
    id: "secretario",
    nome: "Secretário de pasta",
    descricao: "Programas, ações e metas físicas da sua área",
    cor: "#0f4f8f",
    tipoVisao: "pasta",
    podeVerAlertas: true,
    podeCriarProvidencia: true,
    podeEditarCadastro: true,
    podeImportarDados: true,
    podeVerAudit: true,
  },
  {
    id: "controle_interno",
    nome: "Controle Interno",
    descricao: "Conformidade legal e evidências",
    cor: "#d97706",
    tipoVisao: "conformidade",
    podeVerAlertas: true,
    podeCriarProvidencia: true,
    podeEditarCadastro: false,
    podeImportarDados: false,
    podeVerAudit: true,
  },
  {
    id: "camara",
    nome: "Câmara Municipal",
    descricao: "Acompanhamento legislativo",
    cor: "#0b2f63",
    tipoVisao: "conformidade",
    podeVerAlertas: true,
    podeCriarProvidencia: false,
    podeEditarCadastro: false,
    podeImportarDados: false,
    podeVerAudit: false,
  },
  {
    id: "vereador",
    nome: "Vereador",
    descricao: "Fiscalização individual",
    cor: "#1d8a43",
    tipoVisao: "conformidade",
    podeVerAlertas: true,
    podeCriarProvidencia: false,
    podeEditarCadastro: false,
    podeImportarDados: false,
    podeVerAudit: false,
  },
];

export const PERFIL_MAP: Record<PerfilId, Perfil> = PERFIS.reduce(
  (acc, p) => {
    acc[p.id] = p;
    return acc;
  },
  {} as Record<PerfilId, Perfil>,
);

export const PERFIL_DEFAULT: PerfilId = "publico";

// Leitura do perfil ativo no servidor (cookie)
export async function getPerfilAtivo(): Promise<Perfil> {
  // import dinâmico para o arquivo poder ser usado em client também
  const { cookies } = await import("next/headers");
  const c = await cookies();
  const id = (c.get("radar_perfil")?.value ?? PERFIL_DEFAULT) as PerfilId;
  return PERFIL_MAP[id] ?? PERFIL_MAP[PERFIL_DEFAULT];
}
