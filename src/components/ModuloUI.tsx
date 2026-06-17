// Helpers visuais compartilhados pelas páginas de módulo do município.
// Tema "command-center" dark (portado do mockup conecta) — usado por
// educação, saúde, dívida, lrf, riscos, contexto, planejamento.

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass p-6 md:p-7 rounded-[22px]">
      <h2
        className="font-extrabold"
        style={{
          color: "var(--txt)",
          fontSize: "22px",
          letterSpacing: "-0.03em",
          borderLeft: "3px solid var(--cyan)",
          paddingLeft: "12px",
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs md:text-sm mt-2 mb-4" style={{ color: "var(--txt2)" }}>
          {subtitle}
        </p>
      )}
      <div
        className="overflow-hidden mt-3 rounded-2xl"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--linha)" }}
      >
        {children}
      </div>
    </section>
  );
}

export function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead style={{ background: "rgba(255,255,255,0.04)" }}>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2.5 font-bold uppercase tracking-wide text-xs"
                style={{ color: "var(--txt3)", letterSpacing: "0.06em" }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={`px-3 py-2.5 ${className}`}
      style={{ color: "var(--txt2)", borderBottom: "1px solid var(--linha)" }}
    >
      {children}
    </td>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="glass p-5 rounded-2xl">
      <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--txt3)" }}>
        {label}
      </div>
      <div
        className="text-2xl md:text-3xl font-extrabold my-1"
        style={{ color: "var(--cyan)", letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--txt3)" }}>
        {sub}
      </div>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return (
    <div className="px-4 py-8 text-sm italic text-center" style={{ color: "var(--txt3)" }}>
      {msg}
    </div>
  );
}

export function Placeholder({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div
      className="p-6 m-3 rounded-2xl"
      style={{
        background: "rgba(34,211,238,0.05)",
        border: "1px dashed var(--linha2)",
      }}
    >
      <div
        className="text-xs uppercase font-bold tracking-wider"
        style={{ color: "var(--cyan)", letterSpacing: "0.08em" }}
      >
        {titulo}
      </div>
      <div className="text-sm mt-2" style={{ color: "var(--txt2)" }}>
        {descricao}
      </div>
    </div>
  );
}

export function Eyebrow({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <span
      className={`inline-block font-extrabold uppercase rounded-full ${
        small ? "text-[11px] px-2.5 py-1" : "text-xs px-3 py-1.5"
      }`}
      style={{
        background: "rgba(34,211,238,0.13)",
        color: "var(--cyan)",
        border: "1px solid rgba(34,211,238,0.3)",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </span>
  );
}

export function fmtPct(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

export function fmtBRL(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function fmtNum(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—";
}

// Formata DATE/TIMESTAMPTZ vindo do Neon (pode ser Date object ou string)
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

// Semáforo para indicadores com mínimo legal (educação 25%, saúde 15%, fundeb 70% etc.)
export function SemaforoMin({
  valor,
  limite,
}: {
  valor: string | number | null;
  limite: string | number | null;
}) {
  if (valor === null || limite === null) return <span style={{ color: "var(--txt3)" }}>—</span>;
  const v = Number(valor),
    L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span style={{ color: "var(--txt3)" }}>—</span>;
  if (v < L) return <Badge color="#f87171">Abaixo do mínimo</Badge>;
  if (v < L * 1.05) return <Badge color="#fbbf24">No limite</Badge>;
  return <Badge color="#34d399">Conforme</Badge>;
}

// Semáforo para indicadores com máximo legal (pessoal 60%, dívida 120% etc.)
export function SemaforoMax({
  valor,
  limite,
}: {
  valor: string | number | null;
  limite: string | number | null;
}) {
  if (valor === null || limite === null) return <span style={{ color: "var(--txt3)" }}>—</span>;
  const v = Number(valor),
    L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span style={{ color: "var(--txt3)" }}>—</span>;
  if (v > L) return <Badge color="#f87171">Acima do limite</Badge>;
  if (v > L * 0.95) return <Badge color="#f87171">Prudencial</Badge>;
  if (v > L * 0.9) return <Badge color="#fbbf24">Atenção</Badge>;
  return <Badge color="#34d399">Conforme</Badge>;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ color, background: `${color}22`, border: `1px solid ${color}55` }}
    >
      {children}
    </span>
  );
}
