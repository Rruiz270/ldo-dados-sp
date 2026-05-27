// Helpers visuais compartilhados pelas páginas de módulo do município.
// Refino visual fica para a fase 2 — aqui é só clareza estrutural.

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
    <section>
      <h2 className="text-lg md:text-xl font-semibold mb-1" style={{ color: "#0A2463" }}>
        {title}
      </h2>
      {subtitle && <p className="text-xs text-slate-600 mb-3">{subtitle}</p>}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">{children}</div>
    </section>
  );
}

export function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            {cols.map((c) => (
              <th
                key={c}
                className="text-left px-3 py-2 font-medium uppercase tracking-wide text-xs"
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
  return <td className={`px-3 py-2 text-slate-800 ${className}`}>{children}</td>;
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
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="text-2xl font-bold my-1" style={{ color: "#0A2463" }}>
        {value}
      </div>
      <div className="text-xs text-slate-500">{sub}</div>
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return <div className="px-3 py-6 text-sm text-slate-500 italic">{msg}</div>;
}

export function Placeholder({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6">
      <div className="text-sm text-slate-500 uppercase tracking-wide font-medium">{titulo}</div>
      <div className="text-sm text-slate-700 mt-2">{descricao}</div>
    </div>
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
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function fmtNum(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—";
}

// Semáforo para indicadores com mínimo legal (educação 25%, saúde 15%, fundeb 70% etc.)
export function SemaforoMin({
  valor,
  limite,
}: {
  valor: string | number | null;
  limite: string | number | null;
}) {
  if (valor === null || limite === null) return <span className="text-slate-400">—</span>;
  const v = Number(valor),
    L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span className="text-slate-400">—</span>;
  if (v < L) return <span className="text-red-700 font-medium">Abaixo do mínimo</span>;
  if (v < L * 1.05) return <span className="text-amber-700 font-medium">No limite</span>;
  return <span className="text-green-700 font-medium">Conforme</span>;
}

// Semáforo para indicadores com máximo legal (pessoal 60%, dívida 120% etc.)
export function SemaforoMax({
  valor,
  limite,
}: {
  valor: string | number | null;
  limite: string | number | null;
}) {
  if (valor === null || limite === null) return <span className="text-slate-400">—</span>;
  const v = Number(valor),
    L = Number(limite);
  if (!Number.isFinite(v) || !Number.isFinite(L)) return <span className="text-slate-400">—</span>;
  if (v > L) return <span className="text-red-700 font-medium">Acima do limite</span>;
  if (v > L * 0.95) return <span className="text-amber-700 font-medium">Prudencial</span>;
  if (v > L * 0.9) return <span className="text-cyan-700 font-medium">Atenção</span>;
  return <span className="text-green-700 font-medium">Conforme</span>;
}
