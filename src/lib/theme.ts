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

// Semáforo LRF — situação fiscal por % do limite consumido
export function lrfColor(pctOfLimit: number): string {
  if (pctOfLimit >= 95) return "#dc2626"; // vermelho — estouro iminente
  if (pctOfLimit >= 90) return "#f59e0b"; // amarelo — alerta
  if (pctOfLimit >= 80) return brand.azul2; // azul — atenção
  return brand.verde; // verde — folga
}

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
