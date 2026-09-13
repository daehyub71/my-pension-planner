/**
 * 레버 역산 — 「무엇을 얼마나 바꾸면 경계를 넘는가」. 가처분 화면(F10)의 안내 문구 재료다.
 * 가정 하나를 한 해씩 바꿔 다시 시뮬레이션한다. 36년 × 계좌 몇 개라 20회 반복도 충분히 빠르다 (N7).
 */
import type { AccountKind, Assumptions, Rules, Snapshot } from "./model";
import { ruleOf } from "./grade";
import { simulate } from "./index";

/** 연금계좌 중 수령 기간을 바꿀 수 있는 종류 — 1,500만 판정 대상과 같다 */
const LEVER_KINDS: readonly AccountKind[] = ["dc", "irp", "savings"];
const MAX_STEPS = 20;

export interface ThresholdLever {
  direction: "shorten" | "lengthen"; // shorten = 줄이면 넘는다, lengthen = 늘리면 내려온다
  years: number;
  kinds: AccountKind[];
}

/** age 의 연금계좌 과세분이 1,500만 경계를 넘도록(또는 내려오도록) 수령 기간을 몇 년 바꿔야 하나. 못 바꾸면 undefined */
export function thresholdYearsLever(snapshot: Snapshot, assumptions: Assumptions, rules: Rules, age: number): ThresholdLever | undefined {
  const threshold = ruleOf<number>(rules, "private.separate_tax_threshold").value;
  const kinds = LEVER_KINDS.filter((k) => assumptions.privateStart[k] !== undefined);
  if (kinds.length === 0) return undefined;
  const taxableAt = (a: Assumptions): number | undefined => {
    const row = simulate(snapshot, a, rules).years.find((r) => r.age === age);
    return row?.tax ? row.tax.detail.privateTaxable * 1000 : undefined;
  };
  const now = taxableAt(assumptions);
  if (now === undefined || now <= 0) return undefined;
  const under = now <= threshold;
  for (let d = 1; d <= MAX_STEPS; d++) {
    const privateStart = { ...assumptions.privateStart };
    let valid = true;
    for (const k of kinds) {
      const years = privateStart[k]!.years + (under ? -d : d);
      if (years < 1) valid = false;
      privateStart[k] = { ...privateStart[k]!, years };
    }
    if (!valid) return undefined;
    const t = taxableAt({ ...assumptions, privateStart });
    if (t === undefined) continue;
    if (under ? t > threshold : t <= threshold) return { direction: under ? "shorten" : "lengthen", years: d, kinds };
  }
  return undefined;
}
