/**
 * F12 — 목표 모드. "매달 얼마를 쓰고 싶은가"를 연금 가처분이 채우고 남는 부족분으로 바꾼다.
 *
 * 모든 금액은 조회기준일 연도의 돈 가치(실질)로 계산한다 — 월 지출이 「지금 돈 가치」로 입력되기 때문이다.
 * 보유 금융자산은 명목 수익률에서 물가를 뺀 실질수익률로 불린다. 은퇴 전에는 꺼내 쓰지 않는다고 본다.
 * 금액 단위: 천원 (월 지출만 입력 그대로 만원).
 */
import type { Assumptions, Grade, Inputs, Metrics, Rules, SimResult, Snapshot } from "./model";
import { ruleOf } from "./grade";

export interface GoalResult {
  monthlySpend: number; // 만원
  retireAge: number;
  lifeExpectancy: number;
  currentAge: number;
  assetReturn: number;
  realReturn: number;
  gapByAge: Record<number, number>; // 해마다 가처분이 못 채우는 몫 (실질, 천원)
  requiredAtRetire: number; // 은퇴 나이 시점에 있어야 할 금융자산 (실질)
  held?: number; // 지금 보유
  heldAtRetire?: number; // 은퇴 나이까지 불린 보유 자산
  gap?: number; // heldAtRetire − requiredAtRetire (음수면 부족)
  depletionAge?: number;
  crevasse?: Metrics["crevasse"];
  missing: Array<keyof Inputs>;
  grade: Grade;
}

/** 은퇴 나이 시점의 필요 자산 = 부족분을 실질수익률로 할인한 합 */
export function requiredAssetsAt(gapByAge: Record<number, number>, retireAge: number, realReturn: number): number {
  let sum = 0;
  for (const [k, gap] of Object.entries(gapByAge)) {
    const age = Number(k);
    if (age < retireAge || gap <= 0) continue;
    sum += gap / Math.pow(1 + realReturn, age - retireAge);
  }
  return sum;
}

/** 보유 자산이 처음 바닥나는 나이. 기대수명까지 버티면 undefined */
export function depletionAge({ held, currentAge, retireAge, gapByAge, realReturn }: { held: number; currentAge: number; retireAge: number; gapByAge: Record<number, number>; realReturn: number }): number | undefined {
  const lastAge = Math.max(...Object.keys(gapByAge).map(Number));
  let balance = held;
  for (let age = currentAge + 1; age <= lastAge; age++) {
    balance *= 1 + realReturn;
    if (age >= retireAge) balance -= gapByAge[age] ?? 0;
    if (balance < -1e-9) return age;
  }
  return undefined;
}

export function computeGoal(snapshot: Snapshot, assumptions: Assumptions, result: SimResult, rules: Rules): GoalResult {
  const { inputs } = snapshot;
  const monthlySpend = assumptions.targetMonthlySpend ?? inputs.targetMonthlySpend;
  const assetReturn = ruleOf<number>(rules, "goal.asset_return").value;
  const realReturn = (1 + assetReturn) / (1 + assumptions.inflation) - 1;
  const currentAge = Number(snapshot.asOf.slice(0, 4)) - Number(inputs.birthYearMonth.slice(0, 4));
  const annualNeed = monthlySpend * 10 * 12; // 만원/월 → 천원/년

  const gapByAge: Record<number, number> = {};
  for (const row of result.years) {
    if (row.age < inputs.retireAge || row.age > inputs.lifeExpectancy) continue;
    const income = Math.max(0, row.disposableReal ?? row.real);
    gapByAge[row.age] = Math.max(0, annualNeed - income);
  }
  const requiredAtRetire = requiredAssetsAt(gapByAge, Math.max(inputs.retireAge, currentAge), realReturn);

  const missing: Array<keyof Inputs> = [];
  let held: number | undefined;
  let heldAtRetire: number | undefined;
  let gap: number | undefined;
  let depletion: number | undefined;
  if (inputs.financialAssets === undefined) {
    missing.push("financialAssets"); // 추정하지 않는다 — 갭·소진 나이는 판정 불가 (SPEC F3)
  } else {
    held = inputs.financialAssets * 10;
    heldAtRetire = held * Math.pow(1 + realReturn, Math.max(0, inputs.retireAge - currentAge));
    gap = heldAtRetire - requiredAtRetire;
    depletion = depletionAge({ held, currentAge, retireAge: inputs.retireAge, gapByAge, realReturn });
  }

  return {
    monthlySpend,
    retireAge: inputs.retireAge,
    lifeExpectancy: inputs.lifeExpectancy,
    currentAge,
    assetReturn,
    realReturn,
    gapByAge,
    requiredAtRetire,
    held,
    heldAtRetire,
    gap,
    depletionAge: depletion,
    crevasse: result.metrics.crevasse,
    missing,
    grade: result.grades.disposable ?? "estimated",
  };
}
