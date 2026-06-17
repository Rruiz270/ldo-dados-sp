// ============================================================
// Biblioteca legal — fonte única de normas, limites e obrigações
// Conteúdo do doc "Documentação de Módulos — Gestor Público i10"
// (seções 4.4.5 Biblioteca legal, 4.5.4 Calendário, 8 Indicadores).
// Reutilizada pelos módulos Biblioteca Legal e Treinamento (4.5.1).
// ============================================================

export interface Norma {
  norma: string;
  assunto: string;
  link: string;
}

// 4.4.5 — Normas estruturais (orçamento e finanças públicas)
export const NORMAS_ESTRUTURAIS: Norma[] = [
  {
    norma: "Constituição Federal de 1988",
    assunto:
      "Orçamento público (arts. 165 a 169); fiscalização contábil e financeira (arts. 70 a 75); aplicação mínima em saúde (art. 198); educação e FUNDEB (arts. 212 e 212-A); limite do Legislativo municipal (art. 29-A).",
    link: "https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm",
  },
  {
    norma: "Lei nº 4.320/1964",
    assunto:
      "Normas gerais de direito financeiro; elaboração e controle dos orçamentos e balanços (arts. 2º a 8º); créditos adicionais (arts. 40 a 46); execução: empenho, liquidação e pagamento (arts. 58 a 70).",
    link: "https://www.planalto.gov.br/ccivil_03/leis/l4320.htm",
  },
  {
    norma: "Lei Complementar nº 101/2000 (LRF)",
    assunto:
      "PPA, LDO e LOA (arts. 3º a 5º); execução e cumprimento de metas (arts. 8º a 9º); despesa com pessoal (arts. 18 a 23); dívida e operações de crédito (arts. 29 a 40); transparência e RGF (arts. 48 a 55).",
    link: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp101.htm",
  },
  {
    norma: "Lei Complementar nº 141/2012",
    assunto:
      "Aplicação mínima em ações e serviços públicos de saúde (ASPS); define o piso de 15% para municípios e o que é despesa em saúde.",
    link: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp141.htm",
  },
  {
    norma: "Emenda Constitucional nº 108/2020",
    assunto:
      "Torna o FUNDEB permanente; insere o art. 212-A na CF; piso de 70% para remuneração de profissionais da educação básica.",
    link: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc108.htm",
  },
  {
    norma: "Lei Complementar nº 178/2021",
    assunto:
      "Regime de recuperação fiscal; altera a LRF; regra de redução de excessos de despesa de pessoal; apuração por competência (art. 18, § 2º).",
    link: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp178.htm",
  },
];

// 4.4.5 — Normas regulamentadoras e manuais técnicos
export const NORMAS_REGULAMENTADORAS: Norma[] = [
  {
    norma: "Resolução SF nº 40/2001",
    assunto:
      "Limites globais da dívida consolidada de Estados e Municípios (art. 30 da LRF): 200% da RCL para Estados e 120% para Municípios.",
    link: "https://legis.senado.leg.br/norma/582393",
  },
  {
    norma: "Resolução SF nº 43/2001",
    assunto:
      "Operações de crédito, garantias e ARO (arts. 7º e 38 da LRF): montante 16%, comprometimento 11,5%, ARO 7%, garantias 22%/32% da RCL.",
    link: "https://legis.senado.leg.br/norma/582395",
  },
  {
    norma: "Manual de Demonstrativos Fiscais (MDF) — STN",
    assunto:
      "Modelo e instruções de preenchimento do RREO e do RGF (LRF, art. 55, § 4º); padroniza anexos e conceitos para todos os entes.",
    link: "https://www.tesourotransparente.gov.br/publicacoes/manual-de-demonstrativos-fiscais-mdf",
  },
  {
    norma: "Portaria MOG nº 42/1999",
    assunto:
      "Classificação da despesa por função e subfunção de governo (base do módulo de áreas-fim).",
    link: "https://www.planalto.gov.br/ccivil_03/portaria/portaria-42.htm",
  },
  {
    norma: "Decreto-Lei nº 201/1967",
    assunto: "Responsabilidade de prefeitos e vereadores; crimes de responsabilidade na gestão pública.",
    link: "https://www.planalto.gov.br/ccivil_03/decreto-lei/del0201.htm",
  },
  {
    norma: "Lei nº 10.028/2000",
    assunto:
      "Crimes contra as finanças públicas (Lei de Crimes Fiscais); sanções por descumprimento dos limites da LRF.",
    link: "https://www.planalto.gov.br/ccivil_03/leis/l10028.htm",
  },
];

// 8 — Indicadores, regras e limites legais
export interface IndicadorLimite {
  indicador: string;
  limite: string;
  tipo: "Máximo" | "Mínimo" | "Exato" | "Informativo";
  interpretacao: string;
}

export const INDICADORES_LIMITES: IndicadorLimite[] = [
  { indicador: "Pessoal", limite: "≤ 60%", tipo: "Máximo", interpretacao: "Despesa total com pessoal sobre a RCL (art. 19, III, LRF)." },
  { indicador: "Educação (MDE)", limite: "≥ 25%", tipo: "Mínimo", interpretacao: "Aplicação em manutenção e desenvolvimento do ensino (CF art. 212)." },
  { indicador: "Saúde (ASPS)", limite: "≥ 15%", tipo: "Mínimo", interpretacao: "Aplicação mínima em ações e serviços públicos de saúde (CF art. 198; LC 141/2012)." },
  { indicador: "FUNDEB", limite: "= 100%", tipo: "Exato", interpretacao: "Aplicação integral do repasse recebido (CF art. 212-A)." },
  { indicador: "FUNDEB profissionais", limite: "≥ 70%", tipo: "Mínimo", interpretacao: "Mínimo na remuneração de profissionais da educação básica (EC 108/2020)." },
  { indicador: "Dívida Consolidada", limite: "≤ 120%", tipo: "Máximo", interpretacao: "DCL/RCL — Municípios (Res. SF 40/2001). Ainda não populado na V1." },
  { indicador: "Operações de crédito", limite: "≤ 16%", tipo: "Máximo", interpretacao: "Montante anual sobre a RCL (Res. SF 43/2001)." },
  { indicador: "ARO", limite: "≤ 7%", tipo: "Máximo", interpretacao: "Operações de crédito por antecipação da receita (Res. SF 43/2001)." },
  { indicador: "Garantias", limite: "≤ 22%", tipo: "Máximo", interpretacao: "Garantias e contragarantias (32% com inequívoca adimplência do garantidor)." },
  { indicador: "Resultado da execução", limite: "Livre", tipo: "Informativo", interpretacao: "Superávit ou déficit orçamentário." },
];

// 4.5.4 — Calendário de obrigações fiscais e orçamentárias
export interface Obrigacao {
  obrigacao: string;
  periodicidade: string;
  prazo: string;
  orgao: string;
}

export const CALENDARIO_OBRIGACOES: Obrigacao[] = [
  { obrigacao: "RREO — Relatório Resumido da Execução Orçamentária", periodicidade: "Bimestral", prazo: "Até 30 dias após cada bimestre", orgao: "STN / SICONFI" },
  { obrigacao: "RGF — Relatório de Gestão Fiscal", periodicidade: "Quadrimestral (semestral p/ municípios < 50 mil hab.)", prazo: "Até 30 dias após o período", orgao: "STN / SICONFI" },
  { obrigacao: "DCA — Declaração de Contas Anuais", periodicidade: "Anual", prazo: "Até 30/04 do exercício seguinte", orgao: "STN / SICONFI" },
  { obrigacao: "MSC — Matriz de Saldos Contábeis", periodicidade: "Mensal", prazo: "Até o fim do mês seguinte", orgao: "STN / SICONFI" },
  { obrigacao: "PPA, LDO e LOA", periodicidade: "Anual / plurianual", prazo: "Conforme Lei Orgânica municipal e LDO", orgao: "Câmara / TCE-SP" },
  { obrigacao: "Prestação de contas e remessas Audesp", periodicidade: "Mensal / por fase", prazo: "Conforme cronograma anual do TCE-SP", orgao: "TCE-SP (Audesp)" },
  { obrigacao: "Audiências públicas da LRF (metas fiscais)", periodicidade: "Quadrimestral", prazo: "Maio, setembro e fevereiro", orgao: "Executivo / Câmara" },
];
