import type { Metadata } from "next";
import { ExternalLink, Scale, BookText, Gavel, ListChecks } from "lucide-react";
import {
  NORMAS_ESTRUTURAIS,
  NORMAS_REGULAMENTADORAS,
  INDICADORES_LIMITES,
  type Norma,
} from "@/lib/legal";
import { SEMAFORO_LEGENDA } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Biblioteca Legal — Radar Fiscal 360",
  description:
    "Repositório das normas que orientam a gestão pública fiscal e orçamentária, com link oficial de cada norma, limites legais e semáforo fiscal.",
};

const tipoColor: Record<string, string> = {
  Máximo: "var(--verm)",
  Mínimo: "var(--verde)",
  Exato: "var(--cyan)",
  Informativo: "var(--txt3)",
};

export default function BibliotecaLegalPage() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12">
      {/* HERO */}
      <section className="glass rounded-[24px] overflow-hidden relative p-7 md:p-10" style={{ animation: "rise .5s cubic-bezier(.2,.8,.25,1)" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--grad-marca)" }} />
        <span
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-extrabold uppercase"
          style={{ background: "rgba(34,211,238,0.13)", color: "var(--cyan)", border: "1px solid rgba(34,211,238,0.35)", letterSpacing: "0.08em" }}
        >
          <Scale size={13} strokeWidth={2.2} /> Biblioteca legal · módulo 4.4.5
        </span>
        <h1 className="font-extrabold leading-[1.05] mt-4 mb-3" style={{ fontSize: "clamp(30px, 4.5vw, 46px)", letterSpacing: "-0.04em" }}>
          <span style={{ background: "linear-gradient(90deg,#fff,#9bd8ff)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
            Biblioteca Legal
          </span>
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "var(--txt2)", maxWidth: 760 }}>
          Repositório das normas que orientam a gestão pública fiscal e orçamentária, com o
          <b style={{ color: "var(--txt)" }}> link oficial</b> de cada norma e os artigos
          correspondentes por tema. As normas devem ser consultadas sempre em sua versão
          consolidada, considerando alterações posteriores.
        </p>
      </section>

      {/* NORMAS ESTRUTURAIS */}
      <section>
        <SubTitle Icon={BookText} nota="orçamento e finanças públicas">Normas estruturais</SubTitle>
        <NormaTable normas={NORMAS_ESTRUTURAIS} />
      </section>

      {/* NORMAS REGULAMENTADORAS */}
      <section>
        <SubTitle Icon={Gavel} nota="resoluções, manuais e leis sancionatórias">Normas regulamentadoras e manuais técnicos</SubTitle>
        <NormaTable normas={NORMAS_REGULAMENTADORAS} />
      </section>

      {/* LIMITES LEGAIS */}
      <section>
        <SubTitle Icon={ListChecks} nota="§ 8 — indicadores, regras e limites">Indicadores e limites legais</SubTitle>
        <div className="glass rounded-2xl overflow-hidden mt-4">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)" }}>
                <Th>Indicador</Th>
                <Th center>Limite</Th>
                <Th center>Tipo</Th>
                <Th>Interpretação</Th>
              </tr>
            </thead>
            <tbody>
              {INDICADORES_LIMITES.map((i) => (
                <tr key={i.indicador} style={{ borderTop: "1px solid var(--linha)" }}>
                  <Td><b style={{ color: "var(--txt)" }}>{i.indicador}</b></Td>
                  <Td center><span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: "var(--txt)" }}>{i.limite}</span></Td>
                  <Td center>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded" style={{ color: tipoColor[i.tipo], background: "rgba(255,255,255,0.05)" }}>
                      {i.tipo}
                    </span>
                  </Td>
                  <Td><span style={{ color: "var(--txt2)" }}>{i.interpretacao}</span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* SEMÁFORO */}
      <section>
        <SubTitle nota="§ 8.1 — leitura por % do limite (indicadores de limite máximo)">Semáforo fiscal</SubTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {SEMAFORO_LEGENDA.map((s) => (
            <div key={s.faixa} className="glass rounded-2xl p-4 relative overflow-hidden">
              <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 3, background: s.cor }} />
              <div className="flex items-center gap-2 mb-1">
                <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.cor, boxShadow: `0 0 10px ${s.cor}` }} />
                <span className="font-bold text-sm" style={{ color: "var(--txt)", fontVariantNumeric: "tabular-nums" }}>{s.faixa}</span>
              </div>
              <p className="text-xs" style={{ color: "var(--txt2)" }}>{s.leitura}</p>
            </div>
          ))}
        </div>
        <div
          className="mt-4 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.25)", color: "var(--txt2)" }}
        >
          <b style={{ color: "var(--ouro)" }}>Atenção metodológica:</b> para pisos mínimos (educação, saúde,
          FUNDEB profissionais), a leitura se inverte — o sistema sinaliza se o indicador está
          <b style={{ color: "var(--txt)" }}> acima ou abaixo do piso legal</b>, evitando interpretação invertida.
        </div>
      </section>
    </div>
  );
}

function NormaTable({ normas }: { normas: Norma[] }) {
  return (
    <div className="glass rounded-2xl overflow-hidden mt-4">
      <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "rgba(255,255,255,0.04)" }}>
            <Th>Norma</Th>
            <Th>Assunto e artigos principais</Th>
            <Th center>Fonte oficial</Th>
          </tr>
        </thead>
        <tbody>
          {normas.map((n) => (
            <tr key={n.norma} style={{ borderTop: "1px solid var(--linha)" }}>
              <Td><b style={{ color: "var(--txt)" }}>{n.norma}</b></Td>
              <Td><span style={{ color: "var(--txt2)" }}>{n.assunto}</span></Td>
              <Td center>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors hover:border-white/30"
                  style={{ color: "var(--cyan)", border: "1px solid var(--linha2)", whiteSpace: "nowrap" }}
                >
                  abrir <ExternalLink size={12} strokeWidth={2.2} />
                </a>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubTitle({ children, nota, Icon }: { children: React.ReactNode; nota?: string; Icon?: React.ComponentType<{ size?: number; strokeWidth?: number }> }) {
  return (
    <h2 className="text-[11px] uppercase font-extrabold flex items-center gap-3" style={{ letterSpacing: "0.16em", color: "var(--cyan)" }}>
      {Icon && <Icon size={14} strokeWidth={2.2} />}
      {children}
      {nota && (
        <span className="font-semibold normal-case" style={{ fontSize: 10, color: "var(--txt3)", letterSpacing: "0.02em" }}>
          {nota}
        </span>
      )}
      <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg,var(--linha2),transparent)" }} />
    </h2>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th
      className="px-4 py-3 font-bold"
      style={{ textAlign: center ? "center" : "left", fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--txt3)" }}
    >
      {children}
    </th>
  );
}

function Td({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return <td className="px-4 py-3 align-top" style={{ textAlign: center ? "center" : "left" }}>{children}</td>;
}
