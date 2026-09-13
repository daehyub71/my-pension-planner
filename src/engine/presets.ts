/** M4-1 — 시나리오 프리셋 5종 (DESIGN 3번 시안): 기본 · 연기 · 조기 · 지출 조정 · 주택연금 */
import type { Assumptions, Inputs, Rules, SimResult, Snapshot } from "./model";
import { ruleOf } from "./grade";
import { simulate } from "./index";

export type PresetKey = "base" | "delay" | "early" | "spend" | "housing";

export interface Preset {
  key: PresetKey;
  name: string;
  assumptions: Assumptions;
}

const DELAY_YEARS = 3;
const SPEND_CUT_MANWON = 50;

export function presetScenarios(base: Assumptions, inputs: Inputs, rules: Rules, baseResult: SimResult): Preset[] {
  const [minStart, maxStart] = ruleOf<[number, number]>(rules, "nps.start_age_range").value;
  const delayAge = Math.min(maxStart, base.npsStartAge + DELAY_YEARS);
  const spend = Math.max(1, inputs.targetMonthlySpend - SPEND_CUT_MANWON);
  // 주택연금은 절벽을 메우는 레버다 — 가장 큰 절벽 나이에 개시한다
  const worstCliff = baseResult.metrics.cliffs.reduce<(typeof baseResult.metrics.cliffs)[number] | undefined>((w, c) => (!w || c.dropRatio > w.dropRatio ? c : w), undefined);
  const housingAge = worstCliff?.age ?? ruleOf<number>(rules, "housing.preset_default_age").value;
  const housingMonthly = ruleOf<number>(rules, "housing.preset_monthly_krw").value;
  return [
    { key: "base", name: "기본 (포털 가정)", assumptions: base },
    { key: "delay", name: `연기 ${delayAge}세`, assumptions: { ...base, npsStartAge: delayAge } },
    { key: "early", name: `조기 ${minStart}세`, assumptions: { ...base, npsStartAge: minStart } },
    { key: "spend", name: `지출 −${SPEND_CUT_MANWON}만`, assumptions: { ...base, targetMonthlySpend: spend } },
    { key: "housing", name: `주택연금 ${housingAge}세`, assumptions: { ...base, housing: { startAge: housingAge, monthly: housingMonthly } } },
  ];
}

/** 연기 프리셋에서 피부양자를 잃는 나이 — 가처분 화면이 「연기하면 N세 탈락」을 알린다 */
export function delayDependentLoss(snapshot: Snapshot, base: Assumptions, rules: Rules, baseResult: SimResult): { startAge: number; dependentLossAge?: number } {
  const delay = presetScenarios(base, snapshot.inputs, rules, baseResult).find((p) => p.key === "delay")!;
  return { startAge: delay.assumptions.npsStartAge, dependentLossAge: simulate(snapshot, delay.assumptions, rules).metrics.dependentLossAge };
}
