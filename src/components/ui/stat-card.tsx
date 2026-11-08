type StatCardProps = {
  label: string;
  value: string;
  detail: string;
};

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <section className="border border-neutral-200 bg-white px-4 py-3">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        {label}
      </h2>
      <p className="mt-2 font-mono text-2xl font-medium tracking-tight text-neutral-950 tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-neutral-600">{detail}</p>
    </section>
  );
}
