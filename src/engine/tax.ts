/**
 * F8 — 세금 계층. 값은 전부 rules JSON 에서 온다.
 *
 * 한 해의 흐름:
 *  ① 계좌마다 인출액을 비과세 → 이연퇴직소득 → 과세(③) 순서로 가른다.
 *  ② ③ 합계에 나이별 저율을 원천징수한다. 1,500만원을 1원이라도 넘으면 **전액**이 16.5% 분리 또는 종합과세.
 *  ③ 종합과세(국민연금 과세분 + ③)와 분리과세 중 싼 쪽을 고른다 — 5월 정산.
 *  ④ 연금수령한도를 넘는 인출은 경고만 한다 (연금외수령 세금은 계산하지 않는다).
 *  ⑤ 연금보험(연금저축이 아닌 저축성보험)은 연금소득이 아니다 — 보험차익 비과세로 본다.
 *
 * 단순화: 연금 외 종합소득(근로·사업)은 넣지 않는다. 기준선(1,500만 등)은 명목 고정으로 본다.
 * 금액: 공개 산식 함수는 원, 스케줄 결과는 천원(엔진 흐름과 같은 단위).
 */
import type { Account, AccountKind, Grade, Rules, SimWarning, TaxDetail } from "./model";
import { gradeOfRules, ruleOf, worstOf } from "./grade";
import { yearOfAge } from "./portal";

interface Bracket {
  upTo: number | null;
  rate: number;
}

export interface TaxParams {
  lowRates: Array<{ fromAge: number; rate: number }>;
  separateThreshold: number;
  separateRate: number;
  brackets: Bracket[];
  localRatio: number;
  basicDeduction: number;
  pensionDeduction: { steps: Array<{ over: number; base: number; rate: number }>; max: number };
  withdrawalLimit: {
    divisorBase: number;
    multiplier: number;
    firstYearNormal: number;
    firstYearPre2013: number;
    pre2013Cutoff: string;
    eligibleAge: number;
    minJoinYears: number;
  };
  severanceDiscount: { upTo10: number; over10: number; over20: number };
  npsTaxableRatioDefault: number;
  /** 연금보험(연금저축 아닌 저축성보험)의 보험차익을 비과세로 본다 */
  insuranceGainExempt: boolean;
  grades: { core: Grade; severance: Grade; npsDefault: Grade; insurance: Grade };
}

const CORE_RULES = [
  "private.low_rate_by_age",
  "private.separate_tax_threshold",
  "private.separate_tax_rate",
  "tax.basic_rates",
  "tax.local_income_tax_ratio",
  "tax.basic_deduction",
  "tax.pension_income_deduction",
  "private.withdrawal_limit",
];

export function loadTaxParams(rules: Rules): { params: TaxParams; grade: Grade } {
  const v = <T>(id: string): T => ruleOf<T>(rules, id).value;
  const core = gradeOfRules(rules, CORE_RULES);
  return {
    params: {
      lowRates: [...v<TaxParams["lowRates"]>("private.low_rate_by_age")].sort((a, b) => a.fromAge - b.fromAge),
      separateThreshold: v("private.separate_tax_threshold"),
      separateRate: v("private.separate_tax_rate"),
      brackets: v("tax.basic_rates"),
      localRatio: v("tax.local_income_tax_ratio"),
      basicDeduction: v("tax.basic_deduction"),
      pensionDeduction: v("tax.pension_income_deduction"),
      withdrawalLimit: v("private.withdrawal_limit"),
      severanceDiscount: v("severance.deferred_discount"),
      npsTaxableRatioDefault: v("nps.taxable_ratio_default"),
      insuranceGainExempt: v("tax.insurance_gain_exempt"),
      grades: {
        core,
        severance: ruleOf(rules, "severance.deferred_discount").grade,
        npsDefault: ruleOf(rules, "nps.taxable_ratio_default").grade,
        insurance: ruleOf(rules, "tax.insurance_gain_exempt").grade,
      },
    },
    grade: core,
  };
}

/** 사적연금 저율 (지방세 포함). 첫 구간보다 어리면 첫 구간 세율 */
export function lowRate(age: number, p: TaxParams): number {
  let rate = p.lowRates[0]!.rate;
  for (const r of p.lowRates) if (age >= r.fromAge) rate = r.rate;
  return rate;
}

/** 종합소득 기본세율 — 국세만 */
export function progressiveTax(base: number, p: TaxParams): number {
  let tax = 0;
  let prev = 0;
  for (const b of p.brackets) {
    const top = b.upTo ?? Infinity;
    if (base <= prev) break;
    tax += (Math.min(base, top) - prev) * b.rate;
    prev = top;
  }
  return tax;
}

export function pensionIncomeDeduction(total: number, p: TaxParams): number {
  if (total <= 0) return 0;
  const { steps, max } = p.pensionDeduction;
  let step = steps[0]!;
  for (const s of steps) if (total > s.over) step = s;
  return Math.min(max, step.base + (total - step.over) * step.rate);
}

/** 연금소득만으로 종합과세할 때 세액 (지방세 포함) */
export function comprehensivePensionTax(pensionIncome: number, p: TaxParams): number {
  const base = Math.max(0, pensionIncome - pensionIncomeDeduction(pensionIncome, p) - p.basicDeduction);
  return progressiveTax(base, p) * (1 + p.localRatio);
}

export interface AnnualTax {
  lowRate: number;
  overThreshold: boolean;
  method: TaxDetail["method"];
  options: { separate: number; comprehensive: number };
  total: number; // 이연퇴직 세금 제외 최종 세액
  withholding: number;
  settlement: number;
}

/** 한 해 연금 세금 (원). severanceTax 는 분리과세로 끝나 판정에 끼지 않는다. */
export function annualPensionTax(
  { age, privateTaxable, npsTaxable, severanceTax }: { age: number; privateTaxable: number; npsTaxable: number; severanceTax: number },
  p: TaxParams,
): AnnualTax {
  const low = lowRate(age, p);
  const over = privateTaxable > p.separateThreshold;
  const npsAlone = comprehensivePensionTax(npsTaxable, p);
  const separate = npsAlone + privateTaxable * (over ? p.separateRate : low);
  const comprehensive = comprehensivePensionTax(npsTaxable + privateTaxable, p);
  const pickSeparate = separate <= comprehensive;
  const total = pickSeparate ? separate : comprehensive;
  const withheld = privateTaxable * low + npsAlone;
  return {
    lowRate: low,
    overThreshold: over,
    method: pickSeparate ? (over ? "separate" : "low") : "comprehensive",
    options: { separate, comprehensive },
    total,
    withholding: withheld + severanceTax,
    settlement: total - withheld,
  };
}

/** 연금수령한도 (원). 11년차부터 한도 없음 */
export function withdrawalLimit(balance: number, receiptYear: number, p: TaxParams): number {
  const { divisorBase, multiplier } = p.withdrawalLimit;
  if (receiptYear >= divisorBase) return Infinity;
  return (Math.max(0, balance) / (divisorBase - receiptYear)) * multiplier;
}

/** 연차 기산 — 2013-03-01 이전 가입 계좌는 6년차부터 (R-4) */
export function firstReceiptYear(joinDate: string | undefined, p: TaxParams): number {
  const { firstYearNormal, firstYearPre2013, pre2013Cutoff } = p.withdrawalLimit;
  return joinDate && joinDate < pre2013Cutoff ? firstYearPre2013 : firstYearNormal;
}

export interface SourceRemaining {
  exempt: number;
  severance: number;
}

/** 인출액을 비과세 → 이연퇴직 → 과세 순서로 가른다 */
export function splitBySource(amount: number, remaining: SourceRemaining): { exempt: number; severance: number; taxable: number; remaining: SourceRemaining } {
  const exempt = Math.min(amount, remaining.exempt);
  const severance = Math.min(amount - exempt, remaining.severance);
  return {
    exempt,
    severance,
    taxable: amount - exempt - severance,
    remaining: { exempt: remaining.exempt - exempt, severance: remaining.severance - severance },
  };
}

/** 이연퇴직소득 감면 — 실제 수령연차 기준 */
export function severanceDiscount(actualYear: number, p: TaxParams): number {
  const d = p.severanceDiscount;
  if (actualYear > 20) return d.over20;
  if (actualYear > 10) return d.over10;
  return d.upTo10;
}

// 연금계좌는 퇴직연금계좌(DC·IRP)와 「연금저축」 계좌뿐이다 (소득세법 시행령 제40조의2 ①)
const PENSION_ACCOUNT_KINDS: readonly AccountKind[] = ["dc", "irp", "savings"];

export interface TaxScheduleArgs {
  accounts: Account[];
  flows: Map<string, Record<number, number>>; // 천원
  birthYearMonth: string;
  asOfYear: number;
  fromAge: number;
  toAge: number;
  retireAge: number;
  returns: Partial<Record<AccountKind, number>>;
  npsTaxableRatio?: number;
}

export interface YearTax extends TaxDetail {
  withholding: number;
  settlement: number;
}

export interface TaxSchedule {
  byAge: Record<number, YearTax>;
  warnings: SimWarning[];
  grade: Grade;
}

/** 연 1행이라 지급은 그 해 중간, 한도 평가는 그 해 1월 1일로 본다 (portal.ts 와 같은 시간축) */
function balanceAtYearStart(balanceK: number, ret: number, flow: Record<number, number>, age: number, a: TaxScheduleArgs): number {
  const t0 = yearOfAge(a.birthYearMonth, age) - a.asOfYear;
  let b = balanceK * Math.pow(1 + ret, Math.max(0, t0));
  for (const [k, v] of Object.entries(flow)) {
    const prior = Number(k);
    if (prior >= age || v <= 0) continue;
    const payT = yearOfAge(a.birthYearMonth, prior) + 0.5 - a.asOfYear;
    if (payT < 0) continue; // 조회기준일 전 지급은 적립금에 이미 반영돼 있다
    b -= v * Math.pow(1 + ret, t0 - payT);
  }
  return b;
}

export function computeTaxSchedule(a: TaxScheduleArgs, p: TaxParams): TaxSchedule {
  const warnings: SimWarning[] = [];
  const grades: Grade[] = [];
  const zero = (): Omit<YearTax, "withholding" | "settlement" | "lowRate" | "overThreshold" | "method" | "options" | "pensionIncomeTotal" | "pensionDeduction"> => ({
    exemptWithdrawn: 0,
    severanceWithdrawn: 0,
    privateTaxable: 0,
    npsTaxable: 0,
    severanceTax: 0,
  });
  const acc: Record<number, ReturnType<typeof zero>> = {};
  for (let age = a.fromAge; age <= a.toAge; age++) acc[age] = zero();

  const hasFlow = (flow: Record<number, number>): boolean => Object.values(flow).some((v) => v > 0);

  for (const account of a.accounts) {
    const flow = a.flows.get(account.id) ?? {};
    if (!hasFlow(flow)) continue;

    if (account.kind === "national") {
      let ratio = a.npsTaxableRatio;
      if (ratio === undefined) {
        ratio = p.npsTaxableRatioDefault;
        grades.push(p.grades.npsDefault);
        warnings.push({ code: "tax-assumption", accountId: account.id, message: "국민연금 과세대상 비율을 몰라 전액 과세로 계산했다 — 공단 연말정산 모의계산에서 확인해 넣으면 세금이 준다" });
      }
      for (let age = a.fromAge; age <= a.toAge; age++) acc[age]!.npsTaxable += (flow[age] ?? 0) * ratio;
      continue;
    }
    if (account.kind === "insurance") {
      // 저축성보험의 보험차익은 연금소득이 아니라 이자소득이다 (소득세법 제16조 ①9). 10년 유지 등 요건을 채우면 비과세
      grades.push(p.grades.insurance);
      if (p.insuranceGainExempt) {
        warnings.push({ code: "tax-assumption", accountId: account.id, message: `${account.product}: 보험차익 비과세(10년 유지 등 요건 충족)로 보고 세금을 매기지 않았다 — 요건을 못 채우면 이자소득으로 과세된다` });
        for (let age = a.fromAge; age <= a.toAge; age++) acc[age]!.exemptWithdrawn += flow[age] ?? 0;
      } else {
        warnings.push({ code: "tax-assumption", accountId: account.id, message: `${account.product}: 보험차익 과세 여부를 몰라 세금을 계산하지 않았다` });
      }
      continue;
    }
    if (!PENSION_ACCOUNT_KINDS.includes(account.kind)) continue;

    const mix = account.sourceMix;
    let remaining: SourceRemaining = { exempt: 0, severance: 0 };
    let severanceRate = 0;
    if (!mix) {
      grades.push("estimated");
      warnings.push({ code: "tax-assumption", accountId: account.id, message: `${account.product}: 원천 구성(비과세·이연퇴직·과세)을 몰라 전액 연금소득세 대상으로 계산했다` });
    } else {
      remaining = { exempt: mix.exempt, severance: mix.deferredSeverance };
      if (mix.deferredSeverance > 0 && mix.deferredSeveranceTax === undefined) {
        remaining.severance = 0;
        grades.push("estimated");
        warnings.push({ code: "tax-assumption", accountId: account.id, message: `${account.product}: 이연퇴직소득세를 몰라 이연퇴직분도 연금소득세 대상으로 계산했다` });
      } else if (mix.deferredSeverance > 0) {
        severanceRate = mix.deferredSeveranceTax! / mix.deferredSeverance;
        grades.push(p.grades.severance);
      }
    }

    // 연금수령연차: 받을 수 있게 된 해(55세 · 연금저축류는 가입 5년)가 기산 연차
    const ret = a.returns[account.kind];
    const canCheckLimit = account.balance !== undefined && ret !== undefined;
    const L = p.withdrawalLimit;
    const joinYear = account.joinDate ? Number(account.joinDate.slice(0, 4)) : undefined;
    const needsJoinYears = account.kind === "savings"; // 이연퇴직소득이 있는 퇴직연금계좌는 5년 요건이 없다 (시행령 제40조의2 ③2)
    const eligibleYear = Math.max(yearOfAge(a.birthYearMonth, L.eligibleAge), needsJoinYears && joinYear !== undefined ? joinYear + L.minJoinYears : -Infinity);
    const base = firstReceiptYear(account.joinDate, p);
    let warnedLimit = false;

    const ages = Object.keys(flow)
      .map(Number)
      .filter((x) => (flow[x] ?? 0) > 0)
      .sort((x, y) => x - y);
    const firstAge = ages[0]!;
    for (const age of ages) {
      const k = flow[age]!;
      const won = k * 1000;
      const split = splitBySource(won, remaining);
      remaining = split.remaining;
      if (canCheckLimit && !warnedLimit) {
        const year = yearOfAge(a.birthYearMonth, age);
        const receiptYear = base + Math.max(0, year - eligibleYear);
        const limit = withdrawalLimit(balanceAtYearStart(account.balance! / 1000, ret!, flow, age, a) * 1000, receiptYear, p);
        if (won > limit + 1) {
          warnedLimit = true;
          warnings.push({
            code: "withdrawal-limit",
            accountId: account.id,
            age,
            message: `${account.product}: ${age}세 인출이 연금수령한도(연차 ${receiptYear})를 넘는다 — 넘는 몫은 연금외수령으로 과세된다`,
          });
        }
      }
      if (age < a.fromAge || age > a.toAge) continue;
      const row = acc[age]!;
      row.exemptWithdrawn += split.exempt / 1000;
      row.severanceWithdrawn += split.severance / 1000;
      row.privateTaxable += split.taxable / 1000;
      row.severanceTax += (split.severance * severanceRate * severanceDiscount(age - firstAge + 1, p)) / 1000;
    }
  }

  const byAge: Record<number, YearTax> = {};
  for (let age = a.fromAge; age <= a.toAge; age++) {
    const r = acc[age]!;
    const t = annualPensionTax({ age, privateTaxable: r.privateTaxable * 1000, npsTaxable: r.npsTaxable * 1000, severanceTax: r.severanceTax * 1000 }, p);
    byAge[age] = {
      ...r,
      lowRate: t.lowRate,
      overThreshold: t.overThreshold,
      method: t.method,
      options: { separate: t.options.separate / 1000, comprehensive: t.options.comprehensive / 1000 },
      pensionIncomeTotal: r.npsTaxable + r.privateTaxable,
      pensionDeduction: pensionIncomeDeduction((r.npsTaxable + r.privateTaxable) * 1000, p) / 1000,
      withholding: t.withholding / 1000,
      settlement: t.settlement / 1000,
    };
  }
  return { byAge, warnings, grade: worstOf(p.grades.core, ...grades) };
}
