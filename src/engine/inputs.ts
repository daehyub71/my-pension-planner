/** F3 — 추가 입력 검증. 엔진에 들어가기 전에 모양을 잠근다. 미입력 선택 항목은 추정하지 않고 비워 둔다. */
import type { Inputs } from "./model";

export const INPUT_LIMITS = {
  retireAge: { min: 40, max: 80 },
  lifeExpectancy: { min: 60, max: 110 },
  targetMonthlySpend: { min: 1, max: 100000 }, // 만원
} as const;

export const DEFAULT_LIFE_EXPECTANCY = 95;

export interface InputError {
  field: keyof Inputs;
  message: string;
}

export function validateInputs(raw: Partial<Inputs>): { ok: true; inputs: Inputs } | { ok: false; errors: InputError[] } {
  const errors: InputError[] = [];
  const birth = raw.birthYearMonth ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(birth)) errors.push({ field: "birthYearMonth", message: "생년월은 YYYY-MM 형식이어야 한다" });

  const retire = raw.retireAge;
  if (retire === undefined || !Number.isInteger(retire)) errors.push({ field: "retireAge", message: "소득이 끊기는 나이는 필수다" });
  else if (retire < INPUT_LIMITS.retireAge.min || retire > INPUT_LIMITS.retireAge.max)
    errors.push({ field: "retireAge", message: `은퇴 나이는 ${INPUT_LIMITS.retireAge.min}~${INPUT_LIMITS.retireAge.max}세 사이여야 한다` });

  const life = raw.lifeExpectancy ?? DEFAULT_LIFE_EXPECTANCY;
  if (!Number.isInteger(life) || life < INPUT_LIMITS.lifeExpectancy.min || life > INPUT_LIMITS.lifeExpectancy.max)
    errors.push({ field: "lifeExpectancy", message: `기대수명은 ${INPUT_LIMITS.lifeExpectancy.min}~${INPUT_LIMITS.lifeExpectancy.max}세 사이여야 한다` });
  else if (retire !== undefined && life <= retire) errors.push({ field: "lifeExpectancy", message: "기대수명은 은퇴 나이보다 커야 한다" });

  const spend = raw.targetMonthlySpend;
  if (spend === undefined || !Number.isFinite(spend)) errors.push({ field: "targetMonthlySpend", message: "목표 월 지출은 필수다" });
  else if (spend < INPUT_LIMITS.targetMonthlySpend.min || spend > INPUT_LIMITS.targetMonthlySpend.max)
    errors.push({ field: "targetMonthlySpend", message: "목표 월 지출 범위를 벗어났다" });

  for (const f of ["financialAssets", "annualFinancialIncome", "propertyTaxBase"] as const) {
    const v = raw[f];
    if (v !== undefined && (!Number.isFinite(v) || v < 0)) errors.push({ field: f, message: "0 이상의 숫자여야 한다" });
  }
  if (raw.npsTaxableRatio !== undefined && (raw.npsTaxableRatio < 0 || raw.npsTaxableRatio > 1))
    errors.push({ field: "npsTaxableRatio", message: "과세대상 비율은 0~1 이다" });

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    inputs: {
      birthYearMonth: birth,
      retireAge: retire!,
      targetMonthlySpend: spend!,
      lifeExpectancy: life,
      financialAssets: raw.financialAssets,
      annualFinancialIncome: raw.annualFinancialIncome,
      propertyTaxBase: raw.propertyTaxBase,
      spouseEmployed: raw.spouseEmployed,
      npsTaxableRatio: raw.npsTaxableRatio,
    },
  };
}

/** 어느 판정이 "판정 불가"인지 — 선택 입력이 비면 해당 계산을 하지 않는다 (SPEC F3) */
export function missingForJudgement(inputs: Inputs): Array<{ judgement: "goal" | "health-premium" | "dependent"; field: keyof Inputs }> {
  const out: Array<{ judgement: "goal" | "health-premium" | "dependent"; field: keyof Inputs }> = [];
  if (inputs.financialAssets === undefined) out.push({ judgement: "goal", field: "financialAssets" });
  if (inputs.propertyTaxBase === undefined) out.push({ judgement: "health-premium", field: "propertyTaxBase" });
  if (inputs.spouseEmployed === undefined) out.push({ judgement: "dependent", field: "spouseEmployed" });
  return out;
}
