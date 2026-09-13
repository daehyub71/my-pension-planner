"use client";

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

/** 상태를 색만으로 알리지 않는다 (N6) — 선택된 쪽에 글자 굵기와 aria-pressed 를 함께 준다. */
export function Toggle<T extends string>({ value, options, onChange, tone = "navy" }: { value: T; options: ToggleOption<T>[]; onChange: (v: T) => void; tone?: "navy" | "muted" }) {
  const border = tone === "navy" ? "border-navy" : "border-rule";
  return (
    <div className={`inline-flex overflow-hidden rounded-full border-[1.5px] text-[13px] font-bold ${border}`} role="group">
      {options.map((o) => {
        const active = o.value === value;
        const base = "px-4 py-1 transition-colors";
        const cls = active
          ? tone === "navy"
            ? "bg-navy text-white"
            : "bg-inset text-ink font-bold"
          : o.disabled
            ? "text-ink-3 cursor-not-allowed"
            : tone === "navy"
              ? "text-navy hover:bg-navy/5"
              : "text-ink-2 hover:bg-inset";
        return (
          <button key={o.value} type="button" aria-pressed={active} disabled={o.disabled} title={o.title} className={`${base} ${cls}`} onClick={() => !o.disabled && onChange(o.value)}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
