import type { Metadata } from "next";
import { CalendarClock, Building2 } from "lucide-react";
import { CALENDARIO_OBRIGACOES } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Calendário de Obrigações — Radar Fiscal 360",
  description:
    "Calendário consolidado das obrigações fiscais e orçamentárias municipais, com periodicidade, prazo legal e órgão de destino.",
};

export default function CalendarioObrigacoesPage() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 space-y-10">
      {/* HERO */}
      <section className="glass rounded-[24px] overflow-hidden relative p-7 md:p-10" style={{ animation: "rise .5s cubic-bezier(.2,.8,.25,1)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-2)" }} />
        <span
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase"
          style={{ background: "rgba(52,211,153,0.13)", color: "var(--verde)", border: "1px solid rgba(52,211,153,0.35)", letterSpacing: "0.08em" }}
        >
          <CalendarClock size={13} strokeWidth={2.2} /> Treinamento · módulo 4.5.4
        </span>
        <h1 className="font-extrabold leading-[1.05] mt-4 mb-3" style={{ fontSize: "clamp(30px, 4.5vw, 46px)", letterSpacing: "-0.04em" }}>
          <span style={{ background: "linear-gradient(90deg,#fff,#9bd8ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            Calendário de Obrigações
          </span>
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--txt2)", maxWidth: 800 }}>
          Obrigações fiscais e orçamentárias relacionadas à sua periodicidade, prazo legal e órgão de
          destino. As datas acompanham os cronogramas da <b style={{ color: "var(--txt)" }}>STN/SICONFI</b> e
          do <b style={{ color: "var(--txt)" }}>TCE-SP (Audesp)</b>.
        </p>
        <div
          className="mt-5 rounded-xl px-4 py-3 text-sm inline-flex items-start gap-2"
          style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", color: "var(--txt2)" }}
        >
          <span style={{ color: "var(--ouro)" }}>⚠️</span>
          Os prazos abaixo são referenciais e devem ser confirmados a cada exercício nos calendários
          oficiais, pois variam conforme o ano e eventuais prorrogações.
        </div>
      </section>

      {/* TABELA */}
      <section>
        <div className="glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <Th>Obrigação</Th>
                <Th>Periodicidade</Th>
                <Th>Prazo de referência</Th>
                <Th>Órgão / sistema</Th>
              </tr>
            </thead>
            <tbody>
              {CALENDARIO_OBRIGACOES.map((o) => (
                <tr key={o.obrigacao} style={{ borderTop: "1px solid var(--linha)" }}>
                  <Td><b style={{ color: "var(--txt)" }}>{o.obrigacao}</b></Td>
                  <Td><span style={{ color: "var(--txt2)" }}>{o.periodicidade}</span></Td>
                  <Td><span style={{ color: "var(--txt2)" }}>{o.prazo}</span></Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ color: "var(--cyan)", background: "rgba(34,211,238,0.1)", border: "1px solid rgba(34,211,238,0.25)" }}>
                      <Building2 size={12} strokeWidth={2.2} /> {o.orgao}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 font-bold text-left" style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--txt3)" }}>
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3 align-top">{children}</td>;
}
