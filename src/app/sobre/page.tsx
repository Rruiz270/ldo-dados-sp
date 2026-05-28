import { Section, Eyebrow } from "@/components/ModuloUI";

export const dynamic = "force-dynamic";

const OBJETIVOS = [
  "Centralizar os principais dados fiscais e orçamentários do Município.",
  "Calcular automaticamente índices legais e gerenciais.",
  "Acompanhar a execução da LOA e das metas da LDO.",
  "Monitorar o cumprimento dos limites da Lei de Responsabilidade Fiscal.",
  "Acompanhar os mínimos constitucionais de educação e saúde.",
  "Acompanhar a aplicação dos recursos do Fundeb.",
  "Controlar dívida, operações de crédito, garantias, restos a pagar e disponibilidade de caixa.",
  "Emitir alertas preventivos por meio de semáforo fiscal.",
  "Criar histórico comparativo mensal, bimestral, quadrimestral e anual.",
  "Apoiar a governança fiscal, o planejamento, a transparência e a gestão orientada por evidências.",
];

export default function SobrePage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-12 space-y-7">
      <header className="mb-2">
        <Eyebrow>Documento institucional</Eyebrow>
        <h1
          className="font-bold mt-3"
          style={{
            color: "var(--azul)",
            fontSize: "clamp(34px, 5vw, 56px)",
            letterSpacing: "-0.04em",
            lineHeight: 1.05,
          }}
        >
          Sobre o Radar Fiscal Municipal{" "}
          <span style={{ color: "var(--verde-2)" }}>360</span>
        </h1>
        <p
          className="font-bold mt-2"
          style={{ color: "var(--verde-2)", fontSize: "clamp(18px, 2vw, 22px)" }}
        >
          Monitoramento inteligente para decisões seguras
        </p>
      </header>

      <Section title="Apresentação" subtitle="Por que o Radar 360 existe">
        <div className="px-5 py-5 space-y-3 text-sm md:text-base" style={{ color: "var(--grafite)", lineHeight: 1.7 }}>
          <p>
            O <strong>Radar Fiscal Municipal 360</strong> é uma solução tecnológica voltada à gestão pública
            municipal, concebida para consolidar dados fiscais, orçamentários, financeiros, legais,
            operacionais e gerenciais em um ambiente único de acompanhamento preventivo.
          </p>
          <p>
            Permite que prefeitos, secretários, controladores internos, contadores, procuradores, vereadores
            e equipes técnicas acompanhem, de forma simples e objetiva, a situação fiscal do Município, a
            execução orçamentária, o cumprimento das metas da LDO, os limites legais, os indicadores externos
            de contexto e os riscos que possam comprometer a responsabilidade fiscal.
          </p>
          <p>
            O sistema opera como uma <strong>plataforma de inteligência fiscal e gerencial</strong>,
            transformando dados técnicos em alertas, painéis, relatórios, providências recomendadas, soluções
            possíveis e histórico de acompanhamento.
          </p>
        </div>
      </Section>

      <Section title="Objetivos específicos" subtitle="O que o sistema entrega">
        <ul className="px-6 py-5 space-y-2 text-sm md:text-base" style={{ color: "var(--grafite)" }}>
          {OBJETIVOS.map((o, i) => (
            <li key={i} className="flex gap-3">
              <span style={{ color: "var(--verde-2)" }} className="inline-flex items-center mt-0.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Identidade visual" subtitle="Versões do logo aplicadas pela plataforma">
        <div className="p-5">
          <img
            src={`${basePath}/brand/radar-360-variantes.png`}
            alt="Versões sugeridas da marca Radar Fiscal 360"
            className="w-full h-auto rounded-2xl"
            style={{ border: "1px solid rgba(11,47,99,0.07)" }}
          />
          <p className="text-xs mt-3 italic" style={{ color: "var(--cinza)" }}>
            Versão 1 (principal leve) — Versão 2 (institucional completa) — Versão 3 (reduzida) — Versão 4 (símbolo).
            Aplicação conforme o brandbook oficial.
          </p>
        </div>
      </Section>

      {/* Instituto i10 */}
      <section
        className="rounded-[28px] overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0b2f63 0%, #0f4f8f 100%)",
          boxShadow: "0 18px 45px rgba(11,47,99,0.18)",
        }}
      >
        <div className="p-7 md:p-10 grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-6 items-center text-white">
          <div>
            <div
              className="text-[10px] uppercase font-bold tracking-widest mb-2"
              style={{ color: "#00E5A0", letterSpacing: "0.15em" }}
            >
              Instituto idealizador
            </div>
            <h2
              className="font-bold text-3xl md:text-4xl mb-3"
              style={{ letterSpacing: "-0.04em", lineHeight: 1.05 }}
            >
              Instituto <span style={{ color: "#00E5A0" }}>i10</span>
            </h2>
            <p className="text-sm md:text-base font-semibold" style={{ color: "rgba(255,255,255,0.95)" }}>
              Pesquisa, dados e tecnologia para gestão pública.
            </p>
          </div>
          <div className="space-y-3 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.88)" }}>
            <p>
              O <strong style={{ color: "white" }}>Instituto i10</strong> desenvolveu o Radar Fiscal Municipal 360
              para apoiar prefeitos, secretários e gestores públicos a transformarem dados fiscais e orçamentários
              em decisões responsáveis, transparentes e baseadas em evidência.
            </p>
            <p>
              A plataforma consolida informações de SICONFI, AUDESP, SIOPE, SIOPS, INEP e demais fontes oficiais
              em um ambiente único, com semáforo de risco, alertas preventivos, workflow de providências e
              relatórios gerenciais por perfil.
            </p>
            <div className="pt-2">
              <a
                href="https://institutoi10.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-colors"
                style={{ background: "#00E5A0", color: "#0b2f63" }}
              >
                Conhecer o Instituto i10
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
