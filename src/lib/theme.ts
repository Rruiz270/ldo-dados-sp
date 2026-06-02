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

// Semáforo LRF para TETOS — cor por % do limite consumido (alto = ruim).
// 4 faixas: Verde <80 · Azul 80-90 · Amarelo 90-95 · Vermelho ≥95 do limite.
export function lrfColor(pctOfLimit: number): string {
  if (pctOfLimit >= 95) return "#dc2626"; // vermelho — estouro iminente
  if (pctOfLimit >= 90) return "#f59e0b"; // amarelo — alerta
  if (pctOfLimit >= 80) return brand.azul2; // azul — atenção
  return brand.verde; // verde — folga
}

// Semáforo para PISOS constitucionais (educação 25%, saúde 15%, fundeb 100%,
// fundeb_profissionais 70%). NÃO inverte: alto = bom. pctDoPiso = valor/piso*100.
//   ≥100 → cumpre (verde) · 95-100 → no limite (amarelo) · <95 → abaixo (vermelho)
export function pisoColor(pctOfPiso: number): string {
  if (pctOfPiso >= 100) return brand.verde2; // cumpre o mínimo
  if (pctOfPiso >= 95) return "#f59e0b";      // quase no piso
  return "#dc2626";                            // abaixo do mínimo
}

// Faixa textual/semântica de um indicador LRF respeitando a existência (ou não)
// das faixas prudencial/alerta. Para TETOS usa o valor absoluto vs. os limites
// legais; para PISOS lê acima/abaixo do mínimo. Devolve { faixa, label, cor }.
export type FaixaLRF = "conforme" | "atencao" | "alerta" | "prudencial" | "efetivo" | "abaixo" | "no_limite" | "sem_dado";

export interface LrfMetaLike {
  natureza: "teto" | "piso";
  limiteEfetivo: number | null;
  limitePrudencial: number | null;
  limiteAlerta: number | null;
}

export function faixaLRF(
  meta: LrfMetaLike,
  valor: number | null,
): { faixa: FaixaLRF; label: string; cor: string } {
  if (valor == null || !Number.isFinite(valor)) {
    return { faixa: "sem_dado", label: "—", cor: brand.cinza };
  }

  if (meta.natureza === "piso") {
    const piso = meta.limiteEfetivo;
    if (piso == null || piso <= 0) return { faixa: "sem_dado", label: "—", cor: brand.cinza };
    const pct = (valor / piso) * 100;
    if (valor >= piso) return { faixa: "efetivo", label: "Acima do mínimo", cor: pisoColor(pct) };
    if (pct >= 95) return { faixa: "no_limite", label: "No limite do piso", cor: pisoColor(pct) };
    return { faixa: "abaixo", label: "Abaixo do mínimo", cor: pisoColor(pct) };
  }

  // TETO — ordem: efetivo > prudencial > alerta. Faixas só onde definidas.
  const { limiteEfetivo: ef, limitePrudencial: prud, limiteAlerta: al } = meta;
  if (ef != null && valor >= ef) return { faixa: "efetivo", label: "Acima do limite", cor: "#dc2626" };
  if (prud != null && valor >= prud) return { faixa: "prudencial", label: "Limite prudencial", cor: "#dc2626" };
  if (al != null && valor >= al) return { faixa: "alerta", label: "Alerta", cor: "#f59e0b" };
  // Sem estouro/faixa intermediária: classifica pela proximidade do teto.
  if (ef != null && ef > 0) {
    const pct = (valor / ef) * 100;
    if (pct >= 80) return { faixa: "atencao", label: "Atenção", cor: lrfColor(pct) };
    return { faixa: "conforme", label: "Conforme", cor: brand.verde2 };
  }
  return { faixa: "conforme", label: "Conforme", cor: brand.verde2 };
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
