export function KpiCard({ value, label, tone = "ink" }: { value: React.ReactNode; label: React.ReactNode; tone?: "ink" | "danger" | "warn" | "good" }) {
  const color = { ink: "text-ink", danger: "text-danger", warn: "text-warn", good: "text-good" }[tone];
  return (
    <div role="listitem" className="rounded-[10px] bg-inset px-4.5 py-3.5">
      <div className={`font-title text-[22px] font-bold ${color} num`}>{value}</div>
      <div className="text-[12.5px] text-ink-2">{label}</div>
    </div>
  );
}
