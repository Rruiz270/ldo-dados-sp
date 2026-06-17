// Identidade visual oficial — Radar Fiscal Municipal 360
// Paleta extraída do brandbook (documentacao_logo_radar_fiscal_360_gestao_municipal-1.html)

export const brand = {
  azul: "#0b2f63",
  azul2: "#0f4f8f",
  verde: "#4eb51f",
  verde2: "#1d8a43",
  grafite: "#1f2933",
  cinza: "#667085",
  cinzaClaro: "#eef2f6",
  branco: "#ffffff",

  // Gradients oficiais
  gradAzul: "linear-gradient(135deg, #0b2f63, #0f4f8f)",
  gradVerde: "linear-gradient(135deg, #4eb51f, #1d8a43)",
  gradMarca: "linear-gradient(135deg, #0b2f63, #4eb51f)",
  gradSuave: "linear-gradient(135deg, rgba(11,47,99,0.07), rgba(78,181,31,0.09))",
  bgRadial:
    "radial-gradient(circle at top left, rgba(78,181,31,0.09), transparent 30%), radial-gradient(circle at top right, rgba(11,47,99,0.10), transparent 35%), #f7f9fc",

  // Sombras
  sombra: "0 18px 45px rgba(11, 47, 99, 0.12)",
  sombraSuave: "0 8px 22px rgba(11, 47, 99, 0.06)",
  sombraMedia: "0 12px 32px rgba(11, 47, 99, 0.08)",

  raio: 22, // border-radius padrão
} as const;

// Aliases legados (compatibilidade com código existente)
export const brandLegacy = {
  navy: brand.azul,
  navyDark: "#061840",
  navyLight: brand.azul2,
  cyan: "#00B4D8",
  green: brand.verde,
};

// ============================================================
// Semáforo fiscal — § 8.1 do doc de módulos. Quatro faixas por
// % do limite legal consumido (para indicadores de LIMITE MÁXIMO:
// pessoal, dívida, op. crédito, ARO, garantias).
//   Verde    < 80%   → situação confortável
//   Azul     80-90%  → acompanhamento preventivo
//   Amarelo  90-95%  → atenção elevada (limite de ALERTA da LRF, art. 59)
//   Vermelho ≥ 95%   → risco alto (limite PRUDENCIAL da LRF, art. 22)
// Cores na paleta dark (command-center).
// ============================================================
export const SEMAFORO = {
  verde: "#34d399",
  azul: "#3b82f6",
  amarelo: "#fbbf24",
  vermelho: "#f87171",
  neutro: "#5d6b8c",
} as const;

export type FaixaSemaforo = "verde" | "azul" | "amarelo" | "vermelho";

export function faixaLimiteMaximo(pctOfLimit: number): FaixaSemaforo {
  if (pctOfLimit >= 95) return "vermelho";
  if (pctOfLimit >= 90) return "amarelo";
  if (pctOfLimit >= 80) return "azul";
  return "verde";
}

export function lrfColor(pctOfLimit: number): string {
  return SEMAFORO[faixaLimiteMaximo(pctOfLimit)];
}

// Pisos mínimos (educação, saúde, FUNDEB profissionais): a leitura por
// "% do limite" se inverte. § 8.1 "Atenção metodológica": deixar claro se
// está ACIMA ou ABAIXO do piso. pctOfFloor = valor / piso * 100.
export function pisoColor(pctOfFloor: number): string {
  if (pctOfFloor >= 100) return SEMAFORO.verde; // cumpre o piso
  if (pctOfFloor >= 95) return SEMAFORO.amarelo; // quase no piso
  return SEMAFORO.vermelho; // descumprimento constitucional
}

// Legenda do semáforo para exibição (Biblioteca Legal / cards).
export const SEMAFORO_LEGENDA: Array<{ faixa: string; cor: string; leitura: string }> = [
  { faixa: "< 80% do limite", cor: SEMAFORO.verde, leitura: "Situação confortável em relação ao limite calculado." },
  { faixa: "≥ 80% e < 90%", cor: SEMAFORO.azul, leitura: "Acompanhamento preventivo." },
  { faixa: "≥ 90% e < 95%", cor: SEMAFORO.amarelo, leitura: "Atenção elevada — limite de alerta da LRF (art. 59)." },
  { faixa: "≥ 95%", cor: SEMAFORO.vermelho, leitura: "Risco alto — limite prudencial da LRF (art. 22)." },
];

// Cor por nível de risco/criticidade
export const nivelColor: Record<string, string> = {
  baixo: brand.verde2,
  informativo: brand.cinza,
  medio: brand.azul2,
  atencao: "#d97706",
  alto: "#d97706",
  critico: "#dc2626",
  regular: brand.verde2,
};
