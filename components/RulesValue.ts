/** 규칙 값 → 사람이 읽는 짧은 표기 (규칙 근거 화면). 계산하지 않고 표시만 한다. */
import type { Rule } from "@/src/engine/model";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** 0.072 → "7.2" (소수 끝 0 제거) */
function pctNum(v: number): string {
  return String(Number((v * 100).toFixed(4)));
}

/** 원 → "1,500만원" · "5억 4,000만원" · "211.5원" */
export function wonText(won: number): string {
  if (Math.abs(won) < 10_000) return `${won.toLocaleString("ko-KR")}원`;
  const eokPart = Math.floor(won / 100_000_000);
  const manPart = Math.round((won % 100_000_000) / 10_000);
  if (eokPart > 0) return manPart > 0 ? `${eokPart}억 ${manPart.toLocaleString("ko-KR")}만원` : `${eokPart}억원`;
  return `${manPart.toLocaleString("ko-KR")}만원`;
}

function numberText(id: string, v: number): string {
  if (/age|expectancy/.test(id)) return `${v}세`;
  if (/krw|won|price/.test(id) || Math.abs(v) >= 10_000) return wonText(v);
  if (Math.abs(v) <= 1) return `${id.endsWith("_per_year") ? "연 " : ""}${pctNum(v)}%`;
  return v.toLocaleString("ko-KR");
}

function fallback(v: unknown): string {
  const s = JSON.stringify(v) ?? String(v);
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

export function formatRuleValue(rule: Pick<Rule, "id" | "value">): string {
  const { id, value: v } = rule;
  if (typeof v === "boolean") return v ? "예" : "아니오";
  if (typeof v === "string") return v;
  if (isNum(v)) return numberText(id, v);

  if (Array.isArray(v)) {
    // [60, 70] 같은 범위
    if (v.length === 2 && v.every(isNum)) {
      const unit = /age/.test(id) ? "세" : "";
      return `${v[0]}~${v[1]}${unit}`;
    }
    if (v.length > 0 && v.every((x) => isRec(x) && isNum(x.rate))) {
      const rates = v.map((x) => (x as Rec).rate as number);
      // 구간 세율표 (upTo) — 최저~최고 N단계
      if (v.every((x) => "upTo" in (x as Rec))) return `${pctNum(Math.min(...rates))}~${pctNum(Math.max(...rates))}% ${v.length}단계`;
      return `${rates.map(pctNum).join(" / ")}%`;
    }
    return fallback(v);
  }

  if (isRec(v)) {
    // 재산 점수표
    if (Array.isArray(v.grades)) {
      const parts = [`${v.grades.length}등급`];
      if (isNum(v.deductionWon)) parts.push(`${wonText(v.deductionWon).replace(/원$/, "")} 공제`);
      return parts.join(" · ");
    }
    // 공제 구간표
    if (Array.isArray(v.steps)) {
      const parts = [`${v.steps.length}구간`];
      if (isNum(v.max)) parts.push(`한도 ${wonText(v.max)}`);
      return parts.join(" · ");
    }
    // 연금수령한도
    if (isNum(v.divisorBase) && isNum(v.multiplier)) return `÷(${v.divisorBase}−연차)×${pctNum(v.multiplier)}%`;
    const vals = Object.values(v);
    if (vals.length > 0 && vals.every(isNum)) {
      if (vals.every((x) => Math.abs(x) <= 1)) return `${vals.map(pctNum).join(" / ")}%`;
      if (vals.every((x) => Math.abs(x) >= 10_000)) return vals.map((x) => wonText(x).replace(/원$/, "")).join(" / ");
    }
    return fallback(v);
  }
  return fallback(v);
}

/** "2026-09-13" → "09-13" */
export function shortDate(d?: string): string {
  if (!d) return "—";
  const m = /^\d{4}-(\d{2}-\d{2})/.exec(d);
  return m ? m[1]! : d;
}
