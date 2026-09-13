/**
 * F9 — 건보료. 요율·요건은 조문 대조(2026-09-13)했지만 R-2(사적연금 포함 여부)가 남아 산출은 추정 등급이다.
 *
 * 피부양자: 공적연금 전액 + 금융소득(1,000만 초과 시) 합이 2,000만을 넘거나 재산 요건을 넘으면 상실.
 * 지역보험료: (공적연금 × 50% + 금융소득) × (건강보험료율 + 장기요양보험료율). 사적연금은 넣지 않는다 —
 * 조문 문언은 포함으로 읽혀(R-2) simulate 가 「포함했을 때」를 따로 계산해 경고로 보여 준다.
 * 재산분: 재산세 과표 − 1억을 시행령 별표 4 점수로 바꿔 점수당 금액을 곱한다 (2026-09-13 수록).
 * 금액: 원/년.
 */
import type { Grade, HealthBasis, Rules } from "./model";
import { gradeOfRules, ruleOf } from "./grade";

export interface HealthParams {
  dependentIncomeLimit: number;
  property: { upper: number; lower: number; lowerIncomeLimit: number };
  financialThreshold: number;
  includePrivate: boolean;
  publicPensionRatio: number;
  premiumRate: number;
  ltcRate: number;
  pointPrice: number; // 원/점/월
  propertyTable: { deductionWon: number; grades: Array<{ upToManwon: number | null; score: number }> };
}

export function loadHealthParams(rules: Rules): { params: HealthParams; grade: Grade } {
  const v = <T>(id: string): T => ruleOf<T>(rules, id).value;
  return {
    params: {
      dependentIncomeLimit: v("health.dependent_income_limit"),
      property: v("health.dependent_property"),
      financialThreshold: v("health.financial_income_threshold"),
      includePrivate: v("health.dependent_include_private"),
      publicPensionRatio: v("health.public_pension_income_ratio"),
      premiumRate: v("health.premium_rate"),
      ltcRate: v("health.ltc_rate"),
      pointPrice: v("health.point_price_krw"),
      propertyTable: v("health.property_score_table"),
    },
    // 쓴 규칙의 최저 등급 — R-2(사적연금 포함 여부)가 estimated 라 지금은 추정이다
    grade: gradeOfRules(rules, [
      "health.dependent_income_limit",
      "health.dependent_property",
      "health.financial_income_threshold",
      "health.dependent_include_private",
      "health.public_pension_income_ratio",
      "health.premium_rate",
      "health.ltc_rate",
      "health.point_price_krw",
      "health.property_score_table",
    ]),
  };
}

interface IncomeParts {
  publicPension: number;
  privatePension: number;
  financialIncome: number;
}

function countedFinancial(financialIncome: number, h: HealthParams): number {
  return financialIncome > h.financialThreshold ? financialIncome : 0;
}

/** 피부양자 소득요건에 넣는 소득 합 */
export function dependentIncome({ publicPension, privatePension, financialIncome }: IncomeParts, h: HealthParams): number {
  return publicPension + countedFinancial(financialIncome, h) + (h.includePrivate ? privatePension : 0);
}

export function isDependentEligible({ income, propertyTaxBase }: { income: number; propertyTaxBase?: number }, h: HealthParams): { eligible: true } | { eligible: false; reason: "income" | "property" } {
  if (income > h.dependentIncomeLimit) return { eligible: false, reason: "income" };
  const prop = propertyTaxBase ?? 0;
  if (prop > h.property.upper) return { eligible: false, reason: "property" };
  if (prop > h.property.lower && income > h.property.lowerIncomeLimit) return { eligible: false, reason: "property" };
  return { eligible: true };
}

/** 재산보험료부과점수 — 재산세 과표 합계(원)에서 공제액을 빼고 등급 점수로 (시행령 별표 4) */
export function propertyScore(taxBaseWon: number | undefined, h: HealthParams): number {
  const net = (taxBaseWon ?? 0) - h.propertyTable.deductionWon;
  if (net <= 0) return 0;
  const manwon = net / 10000;
  for (const g of h.propertyTable.grades) if (g.upToManwon === null || manwon <= g.upToManwon) return g.score;
  return 0;
}

/**
 * 지역가입자 보험료 (장기요양 포함, 원/년).
 * 소득분: 연금소득 50% + 금융소득 × (건보료율 + 장기요양률) — 사적연금은 includePrivate 일 때만 (R-2).
 * 재산분: 점수 × 점수당 금액 × 12, 장기요양은 건보료에 같은 비율(장기요양률 ÷ 건보료율)로 붙는다.
 */
export function regionalPremium(
  { publicPension, privatePension = 0, financialIncome, propertyTaxBase }: Omit<IncomeParts, "privatePension"> & { privatePension?: number; propertyTaxBase?: number },
  h: HealthParams,
): number {
  const pension = publicPension + (h.includePrivate ? privatePension : 0);
  const income = pension * h.publicPensionRatio + countedFinancial(financialIncome, h);
  const property = propertyScore(propertyTaxBase, h) * h.pointPrice * 12 * (1 + h.ltcRate / h.premiumRate);
  return income * (h.premiumRate + h.ltcRate) + property;
}

export interface HealthYearArgs extends IncomeParts {
  age: number;
  retireAge: number;
  spouseEmployed?: boolean;
  propertyTaxBase?: number;
}

export interface HealthYear {
  premium: number;
  dependent: boolean;
  basis: HealthBasis;
  lostDependent?: boolean;
}

export function healthForYear(a: HealthYearArgs, h: HealthParams): HealthYear {
  // 은퇴 전에는 본인이 직장가입자 — 연금 때문에 붙는 보험료는 없다고 본다
  if (a.age < a.retireAge) return { premium: 0, dependent: false, basis: "employee" };
  const premium = regionalPremium(a, h);
  if (a.spouseEmployed === undefined) return { premium, dependent: false, basis: "unknown" };
  if (!a.spouseEmployed) return { premium, dependent: false, basis: "regional" };
  const judged = isDependentEligible({ income: dependentIncome(a, h), propertyTaxBase: a.propertyTaxBase }, h);
  if (judged.eligible) return { premium: 0, dependent: true, basis: "dependent" };
  return { premium, dependent: false, basis: "regional", lostDependent: true };
}
