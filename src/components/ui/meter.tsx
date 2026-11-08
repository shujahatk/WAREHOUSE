type MeterProps = {
  label: string;
  detail: string;
  value: string;
  ratio: number;
  caption?: string;
};

export function Meter({ label, detail, value, ratio, caption }: MeterProps) {
  const clamped = Math.min(1, Math.max(0, ratio));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium text-neutral-950">{label}</p>
        <p className="font-mono text-xs text-neutral-700 tabular-nums">{value}</p>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">{detail}</p>
      {caption ? <p className="mt-1 text-xs leading-5 text-neutral-700">{caption}</p> : null}
      <div className="mt-2 h-1.5 bg-neutral-100" aria-hidden="true">
        <div className="h-full bg-neutral-950" style={{ width: `${clamped * 100}%` }} />
      </div>
    </div>
  );
}
