// Helpers visuais compartilhados pelas páginas de módulo do município.
// Identidade visual: Radar Fiscal 360 — Gestão Municipal (brandbook oficial).

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
    <section
      className="p-6 md:p-7 rounded-[22px]"
      style={{
        background: "rgba(255,255,255,0.94)",
        border: "1px solid rgba(11,47,99,0.08)",
        boxShadow: "0 12px 32px rgba(11,47,99,0.08)",
      }}
    >
      <h2
        className="font-bold"
        style={{
          color: "var(--azul)",
          fontSize: "22px",
          letterSpacing: "-0.03em",
          borderLeft: "5px solid var(--verde)",
          paddingLeft: "12px",
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-xs md:text-sm mt-2 mb-4" style={{ color: "var(--cinza)" }}>
          {subtitle}
        </p>
      )}
      <div
        className="overflow-hidden mt-3 rounded-2xl"
        style={{ background: "#fff", border: "1px solid rgba(11,47,99,0.07)" }}
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
        <thead style={{ background: "linear-gradient(135deg, #0b2f63, #0f4f8f)", color: "white" }}>
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2.5 font-semibold uppercase tracking-wide text-xs"
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
      style={{ color: "var(--grafite)", borderBottom: "1px solid rgba(11,47,99,0.06)" }}
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
    <div
      className="p-5 rounded-2xl"
      style={{
        background: "white",
        border: "1px solid rgba(11,47,99,0.09)",
        boxShadow: "0 8px 22px rgba(11,47,99,0.06)",
      }}
    >
      <div
        className="text-xs uppercase font-semibold tracking-wider"
        style={{ color: "var(--cinza)" }}
      >
        {label}
      </div>
      <div
        className="text-2xl md:text-3xl font-bold my-1"
        style={{ color: "var(--azul)", letterSpacing: "-0.03em" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--cinza)" }}>
        {sub}
      </div>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return (
    <div className="px-4 py-8 text-sm italic text-center" style={{ color: "var(--cinza)" }}>
      {msg}
    </div>
  );
}

export function Placeholder({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div
      className="p-6 m-3 rounded-2xl"
      style={{
        background: "linear-gradient(135deg, rgba(11,47,99,0.04), rgba(78,181,31,0.05))",
        border: "1px dashed rgba(11,47,99,0.2)",
      }}
    >
      <div
        className="text-xs uppercase font-bold tracking-wider"
        style={{ color: "var(--verde-2)", letterSpacing: "0.08em" }}
      >
        {titulo}
      </div>
      <div className="text-sm mt-2" style={{ color: "var(--cinza)" }}>
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
        background: "rgba(78,181,31,0.13)",
        color: "var(--verde-2)",
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
  if (valor === null || limite === null) return <span style={{ color: "var(--cinza)" }}>—</span>;
  const v = Number(valor),
    L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span style={{ color: "var(--cinza)" }}>—</span>;
  if (v < L) return <Badge color="#dc2626">Abaixo do mínimo</Badge>;
  if (v < L * 1.05) return <Badge color="#d97706">No limite</Badge>;
  return <Badge color="var(--verde-2)">Conforme</Badge>;
}

// Semáforo para indicadores com máximo legal (pessoal 60%, dívida 120% etc.)
export function SemaforoMax({
  valor,
  limite,
}: {
  valor: string | number | null;
  limite: string | number | null;
}) {
  if (valor === null || limite === null) return <span style={{ color: "var(--cinza)" }}>—</span>;
  const v = Number(valor),
    L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span style={{ color: "var(--cinza)" }}>—</span>;
  if (v > L) return <Badge color="#dc2626">Acima do limite</Badge>;
  if (v > L * 0.95) return <Badge color="#d97706">Prudencial</Badge>;
  if (v > L * 0.9) return <Badge color="var(--azul-2)">Atenção</Badge>;
  return <Badge color="var(--verde-2)">Conforme</Badge>;
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ color, background: `${color}1f` }}
    >
      {children}
    </span>
  );
}
