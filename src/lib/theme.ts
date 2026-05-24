// Tokens visuais Instituto i10 — extraídos do brandbook oficial.
// Use estas constantes em vez de hardcoded hex.

export const brand = {
  navy: "#0A2463",
  navyDark: "#061840",
  navyLight: "#1a3a7a",
  cyan: "#00B4D8",
  cyanLight: "#48CAE4",
  cyanPale: "#ADE8F4",
  green: "#00E5A0",
  greenDark: "#00C48A",
  greenPale: "#B7F5E0",
  white: "#FFFFFF",
  offWhite: "#F8FAFC",
  gradientMain: "linear-gradient(135deg, #0A2463 0%, #00B4D8 100%)",
  gradientAccent: "linear-gradient(90deg, #00B4D8 0%, #00E5A0 100%)",
  gradientDark: "linear-gradient(135deg, #061840 0%, #0A2463 100%)",
} as const;

// Semáforo LRF (% do limite consumido)
export function lrfColor(pctOfLimit: number): string {
  if (pctOfLimit >= 95) return "#dc2626";  // vermelho — estouro iminente
  if (pctOfLimit >= 90) return "#f59e0b";  // amarelo — alerta
  if (pctOfLimit >= 80) return brand.cyan; // azul — atenção
  return brand.green;                       // verde — folga
}
