"use client";

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display: string;
  note?: React.ReactNode;
  changed?: boolean;
}

export function Slider({ label, value, min, max, step, onChange, display, note, changed }: SliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-[13.5px] text-ink-2">
        <label htmlFor={`s-${label}`}>{label}</label>
        <b className={changed ? "text-navy" : "text-ink"}>
          {display}
          {changed && <span className="ml-1 text-[11px] font-normal text-navy">바뀜</span>}
        </b>
      </div>
      <input
        id={`s-${label}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-rule accent-navy"
      />
      {note && <div className="text-[11.5px] text-ink-3">{note}</div>}
    </div>
  );
}
