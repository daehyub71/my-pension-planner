import type { Grade } from "@/src/engine/model";

const GRADE_TEXT: Record<Grade, string> = { verified: "조문 대조", web: "웹 확인", estimated: "추정" };
const GRADE_MARK: Record<Grade, string> = { verified: "✓", web: "~", estimated: "?" };
const GRADE_CLASS: Record<Grade, string> = {
  verified: "text-good bg-good-bg border-good/30",
  web: "text-warn bg-warn-bg border-warn/30",
  estimated: "text-danger bg-danger-bg border-danger/30",
};

/** 등급 뱃지. 색만으로 구분하지 않는다 (N6) — 기호와 글자를 함께 쓴다. */
export function GradeBadge({ grade, label }: { grade: Grade; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${GRADE_CLASS[grade]}`}>
      <span aria-hidden>{GRADE_MARK[grade]}</span>
      {label ?? GRADE_TEXT[grade]}
    </span>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "danger" | "good"; children: React.ReactNode }) {
  const cls = {
    neutral: "bg-inset text-ink-2 border-rule",
    warn: "bg-warn-bg text-warn border-warn/30",
    danger: "bg-danger-bg text-danger border-danger/30",
    good: "bg-good-bg text-good border-good/30",
  }[tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${cls}`}>{children}</span>;
}
