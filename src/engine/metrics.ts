/** F11 — 시나리오 지표표. 화면은 계산하지 않고 이 결과만 그린다. 금액 단위 천원(실질). */
import type { Assumptions, Grade, Metrics, Rules, SimResult, Snapshot } from "./model";
import { computeGoal } from "./goal";

/** 지표표의 「N세 실질 연간 가처분」 기준 나이 (DESIGN 3번 시안) */
export const DISPOSABLE_REFERENCE_AGE = 90;

export type Breakeven = { kind: "ahead-from" | "ahead-until"; age: number } | { kind: "always-ahead" | "always-behind" | "same" };

/**
 * 누적 손익분기 — b 의 누적 수령이 a 를 넘거나(ahead-from) a 에 따라잡히는(ahead-until) 나이.
 * 연 1행이라 교차 나이는 앞뒤 해의 누적 차이로 선형 보간한다.
 */
export function breakeven(a: Record<number, number>, b: Record<number, number>): Breakeven {
  const ages = [...new Set([...Object.keys(a), ...Object.keys(b)].map(Number))].sort((x, y) => x - y);
  const eps = 1e-9;
  let cum = 0;
  let prevAge: number | undefined;
  let prevCum = 0;
  let sawPositive = false;
  let sawNegative = false;
  for (const age of ages) {
    cum += (b[age] ?? 0) - (a[age] ?? 0);
    if (prevAge !== undefined && Math.abs(prevCum) > eps && Math.abs(cum) > eps && Math.sign(cum) !== Math.sign(prevCum)) {
      const at = prevAge + prevCum / (prevCum - cum);
      return { kind: cum > 0 ? "ahead-from" : "ahead-until", age: Math.round(at * 10) / 10 };
    }
    if (cum > eps) sawPositive = true;
    if (cum < -eps) sawNegative = true;
    if (Math.abs(cum) > eps) {
      prevAge = age;
      prevCum = cum;
    }
  }
  if (sawPositive) return { kind: "always-ahead" };
  if (sawNegative) return { kind: "always-behind" };
  return { kind: "same" };
}

export interface ScenarioMetrics {
  requiredAtRetire: number;
  gap?: number;
  depletionAge?: number;
  worstCliff?: Metrics["cliffs"][number];
  crevasse?: Metrics["crevasse"];
  realDisposableAt: { age: number; value: number };
  breakeven?: Breakeven;
  dependentLossAge?: number;
  sparkline: Array<{ age: number; value: number }>;
  grade: Grade;
}

function realDisposableByAge(result: SimResult): Record<number, number> {
  return Object.fromEntries(result.years.map((r) => [r.age, r.disposableReal ?? r.real]));
}

/** baseline 을 주면 누적 손익분기를 그 시나리오와 견준다 */
export function scenarioMetrics(snapshot: Snapshot, assumptions: Assumptions, result: SimResult, rules: Rules, baseline?: { assumptions: Assumptions; result: SimResult }): ScenarioMetrics {
  const goal = computeGoal(snapshot, assumptions, result, rules);
  const byAge = realDisposableByAge(result);
  const lastAge = result.years[result.years.length - 1]?.age ?? DISPOSABLE_REFERENCE_AGE;
  const refAge = Math.min(DISPOSABLE_REFERENCE_AGE, lastAge);
  const worstCliff = result.metrics.cliffs.reduce<Metrics["cliffs"][number] | undefined>((w, c) => (!w || c.dropRatio > w.dropRatio ? c : w), undefined);
  return {
    requiredAtRetire: goal.requiredAtRetire,
    gap: goal.gap,
    depletionAge: goal.depletionAge,
    worstCliff,
    crevasse: result.metrics.crevasse,
    realDisposableAt: { age: refAge, value: byAge[refAge] ?? 0 },
    breakeven: baseline ? breakeven(realDisposableByAge(baseline.result), byAge) : undefined,
    dependentLossAge: result.metrics.dependentLossAge,
    sparkline: result.years.map((r) => ({ age: r.age, value: byAge[r.age] ?? 0 })),
    grade: goal.grade,
  };
}
