import { describe, it, expect } from "vitest";
import {
  loadTaxParams,
  lowRate,
  progressiveTax,
  pensionIncomeDeduction,
  comprehensivePensionTax,
  annualPensionTax,
  withdrawalLimit,
  firstReceiptYear,
  splitBySource,
  severanceDiscount,
  computeTaxSchedule,
} from "@/src/engine/tax";
import type { Account } from "@/src/engine/model";
import { RULES } from "@/src/rules/loader";

const { params: P } = loadTaxParams(RULES);

describe("F8 ② 사적연금 저율 — 나이 경계", () => {
  it("69세 5.5% · 70세 4.4% · 79세 4.4% · 80세 3.3%", () => {
    expect(lowRate(55, P)).toBe(0.055);
    expect(lowRate(69, P)).toBe(0.055);
    expect(lowRate(70, P)).toBe(0.044);
    expect(lowRate(79, P)).toBe(0.044);
    expect(lowRate(80, P)).toBe(0.033);
  });
});

describe("종합과세 재료 — 기본세율 · 연금소득공제", () => {
  it("누진 세율표 (국세만)", () => {
    expect(progressiveTax(0, P)).toBe(0);
    expect(progressiveTax(14_000_000, P)).toBe(840_000);
    expect(progressiveTax(50_000_000, P)).toBe(6_240_000);
    expect(progressiveTax(60_000_000, P)).toBe(6_240_000 + 10_000_000 * 0.24);
  });

  it("연금소득공제 구간과 900만 한도", () => {
    expect(pensionIncomeDeduction(3_000_000, P)).toBe(3_000_000);
    expect(pensionIncomeDeduction(5_000_000, P)).toBe(4_100_000);
    expect(pensionIncomeDeduction(10_000_000, P)).toBe(5_500_000);
    expect(pensionIncomeDeduction(20_000_000, P)).toBe(6_900_000);
    expect(pensionIncomeDeduction(50_000_000, P)).toBe(9_000_000);
  });

  it("종합과세 세액 = (연금 − 공제 − 기본공제) × 세율 × 1.1(지방세)", () => {
    // 4,000만: 공제 890만 → 과표 2,960만 → 84만 + 1,560만×15% = 318만 → ×1.1
    expect(comprehensivePensionTax(40_000_000, P)).toBeCloseTo(3_498_000, 0);
    expect(comprehensivePensionTax(1_000_000, P)).toBe(0);
  });
});

describe("F8 ③ 1,500만 초과 시 전액 — 종합 vs 분리 자동 판정", () => {
  it("1,500만원 정확히는 저율, 1원 넘으면 전액이 16.5%", () => {
    const at = annualPensionTax({ age: 65, privateTaxable: 15_000_000, npsTaxable: 0, severanceTax: 0 }, P);
    const over = annualPensionTax({ age: 65, privateTaxable: 15_000_001, npsTaxable: 0, severanceTax: 0 }, P);
    expect(at.overThreshold).toBe(false);
    expect(at.options.separate).toBeCloseTo(825_000, 0);
    expect(over.overThreshold).toBe(true);
    expect(over.options.separate).toBeCloseTo(15_000_001 * 0.165, 0);
  });

  it("다른 연금소득이 크면 분리과세가 유리하다", () => {
    const r = annualPensionTax({ age: 65, privateTaxable: 20_000_000, npsTaxable: 60_000_000, severanceTax: 0 }, P);
    expect(r.method).toBe("separate");
    expect(r.total).toBeCloseTo(comprehensivePensionTax(60_000_000, P) + 20_000_000 * 0.165, 0);
  });

  it("연금 말고 소득이 없으면 종합과세가 유리할 수 있다 — 싼 쪽을 고른다", () => {
    const r = annualPensionTax({ age: 65, privateTaxable: 20_000_000, npsTaxable: 0, severanceTax: 0 }, P);
    expect(r.method).toBe("comprehensive");
    expect(r.total).toBe(Math.min(r.options.separate, r.options.comprehensive));
  });

  it("원천징수는 저율 + 국민연금 연말정산, 5월 정산은 최종 세액과의 차이", () => {
    const r = annualPensionTax({ age: 72, privateTaxable: 20_000_000, npsTaxable: 60_000_000, severanceTax: 100_000 }, P);
    const npsAlone = comprehensivePensionTax(60_000_000, P);
    expect(r.withholding).toBeCloseTo(20_000_000 * 0.044 + npsAlone + 100_000, 0);
    expect(r.withholding + r.settlement).toBeCloseTo(r.total + 100_000, 0);
  });
});

describe("F8 ④ 연금수령한도 — 연차 10/11 · 2013 특례", () => {
  it("평가액 ÷ (11 − 연차) × 120%, 11년차부터 한도 없음", () => {
    expect(withdrawalLimit(100_000_000, 1, P)).toBeCloseTo(12_000_000, 0);
    expect(withdrawalLimit(100_000_000, 10, P)).toBeCloseTo(120_000_000, 0);
    expect(withdrawalLimit(100_000_000, 11, P)).toBe(Infinity);
  });

  it("2013-03-01 이전 가입은 6년차로 기산한다 (R-4)", () => {
    expect(firstReceiptYear("2007-05-01", P)).toBe(6);
    expect(firstReceiptYear("2013-02-28", P)).toBe(6);
    expect(firstReceiptYear("2013-03-01", P)).toBe(1);
    expect(firstReceiptYear(undefined, P)).toBe(1);
  });
});

describe("F8 ① 인출 순서 — 비과세 → 이연퇴직 → 과세", () => {
  it("비과세를 먼저 쓰고, 이연퇴직, 나머지가 과세다", () => {
    const s1 = splitBySource(8_000_000, { exempt: 5_000_000, severance: 10_000_000 });
    expect(s1).toMatchObject({ exempt: 5_000_000, severance: 3_000_000, taxable: 0 });
    const s2 = splitBySource(12_000_000, s1.remaining);
    expect(s2).toMatchObject({ exempt: 0, severance: 7_000_000, taxable: 5_000_000 });
    expect(s2.remaining).toEqual({ exempt: 0, severance: 0 });
  });

  it("이연퇴직 감면율은 실제 수령연차로 — 10년 70% · 11년 60% · 21년 50%(R-1)", () => {
    expect(severanceDiscount(1, P)).toBe(0.7);
    expect(severanceDiscount(10, P)).toBe(0.7);
    expect(severanceDiscount(11, P)).toBe(0.6);
    expect(severanceDiscount(20, P)).toBe(0.6);
    expect(severanceDiscount(21, P)).toBe(0.5);
  });
});

function acc(over: Partial<Account> & Pick<Account, "id" | "kind" | "flowByAge">): Account {
  return { owner: "self", institution: "x", product: over.id, startDate: "2030-01", ...over };
}

describe("F8 연도별 세금 스케줄", () => {
  const base = { birthYearMonth: "1970-01", asOfYear: 2026.5, fromAge: 60, toAge: 70, retireAge: 60 };

  it("sourceMix 가 없으면 전액 과세로 보고 추정으로 내린다", () => {
    const flow = { 60: 10_000, 61: 10_000 }; // 천원
    const a = acc({ id: "irp", kind: "irp", flowByAge: flow, balance: 30_000_000 });
    const s = computeTaxSchedule({ ...base, accounts: [a], flows: new Map([["irp", flow]]), returns: { irp: 0.03 }, npsTaxableRatio: 1 }, P);
    expect(s.byAge[60]!.privateTaxable).toBeCloseTo(10_000, 6);
    expect(s.grade).toBe("estimated");
    expect(s.warnings.some((w) => w.code === "tax-assumption" && w.accountId === "irp")).toBe(true);
  });

  it("sourceMix 를 넣으면 이연퇴직분은 퇴직소득세 × 70% 로 과세하고 1,500만 합산에서 빠진다", () => {
    const flow = { 60: 20_000, 61: 20_000 };
    const a = acc({
      id: "irp",
      kind: "irp",
      flowByAge: flow,
      balance: 40_000_000,
      sourceMix: { exempt: 0, deferredSeverance: 30_000_000, taxable: 10_000_000, deferredSeveranceTax: 3_000_000 },
    });
    const s = computeTaxSchedule({ ...base, accounts: [a], flows: new Map([["irp", flow]]), returns: { irp: 0 }, npsTaxableRatio: 1 }, P);
    expect(s.byAge[60]!.severanceWithdrawn).toBeCloseTo(20_000, 6);
    expect(s.byAge[60]!.severanceTax).toBeCloseTo(20_000 * 0.1 * 0.7, 6);
    expect(s.byAge[61]!.severanceWithdrawn).toBeCloseTo(10_000, 6);
    expect(s.byAge[61]!.privateTaxable).toBeCloseTo(10_000, 6);
    expect(s.byAge[60]!.overThreshold).toBe(false);
  });

  it("일반연금보험은 연금소득이 아니다 — 보험차익 비과세로 보고 1,500만 합산에서 뺀다 (소득세법 제16조 ①9)", () => {
    const flow = { 60: 20_000 };
    const ins = acc({ id: "ins", kind: "insurance", flowByAge: flow, balance: 30_000_000 });
    const s = computeTaxSchedule({ ...base, toAge: 60, accounts: [ins], flows: new Map([["ins", flow]]), returns: { insurance: 0.03 }, npsTaxableRatio: 1 }, P);
    expect(s.byAge[60]!.privateTaxable).toBe(0);
    expect(s.byAge[60]!.exemptWithdrawn).toBeCloseTo(20_000, 6);
    expect(s.byAge[60]!.withholding + s.byAge[60]!.settlement).toBe(0);
    expect(s.warnings.some((w) => w.code === "tax-assumption" && w.accountId === "ins" && /보험차익/.test(w.message))).toBe(true);
    expect(s.grade).toBe("estimated");
  });

  it("국민연금 과세대상 비율을 곱한다", () => {
    const flow = { 65: 24_000 };
    const nps = acc({ id: "nps", kind: "national", flowByAge: flow, monthlyAmount: 2_000_000 });
    const s = computeTaxSchedule({ ...base, fromAge: 65, toAge: 65, accounts: [nps], flows: new Map([["nps", flow]]), returns: {}, npsTaxableRatio: 0.5 }, P);
    expect(s.byAge[65]!.npsTaxable).toBeCloseTo(12_000, 6);
  });

  it("국민연금 과세대상 비율이 없으면 전액 과세 + 추정", () => {
    const flow = { 65: 24_000 };
    const nps = acc({ id: "nps", kind: "national", flowByAge: flow, monthlyAmount: 2_000_000 });
    const s = computeTaxSchedule({ ...base, fromAge: 65, toAge: 65, accounts: [nps], flows: new Map([["nps", flow]]), returns: {} }, P);
    expect(s.byAge[65]!.npsTaxable).toBeCloseTo(24_000, 6);
    expect(s.grade).toBe("estimated");
  });

  // 1970-01생은 2025년에 55세 — 그 해가 연차 1 (가입 5년도 지났다). 55세부터 받으면 첫해가 곧 연차 1
  const at55 = { ...base, fromAge: 55, toAge: 60 };

  it("첫해에 적립금 대부분을 빼면 수령한도 초과를 경고한다", () => {
    const flow = { 55: 50_000, 56: 1_000 };
    const a = acc({ id: "sav", kind: "savings", flowByAge: flow, balance: 51_000_000, joinDate: "2015-01-01" });
    const s = computeTaxSchedule({ ...at55, accounts: [a], flows: new Map([["sav", flow]]), returns: { savings: 0 }, npsTaxableRatio: 1 }, P);
    const w = s.warnings.find((x) => x.code === "withdrawal-limit");
    expect(w).toMatchObject({ accountId: "sav", age: 55 });
  });

  it("같은 인출이라도 2013 이전 가입이면 한도가 넉넉해 경고가 없다", () => {
    // 1년차: 5,100만 ÷ 10 × 1.2 = 612만 < 1,000만 · 6년차: 5,100만 ÷ 5 × 1.2 = 1,224만 > 1,000만
    const flow = { 55: 10_000, 56: 10_000 };
    const early = acc({ id: "old", kind: "savings", flowByAge: flow, balance: 51_000_000, joinDate: "2007-05-01" });
    const late = acc({ id: "new", kind: "savings", flowByAge: flow, balance: 51_000_000, joinDate: "2015-01-01" });
    const run = (a: Account) => computeTaxSchedule({ ...at55, accounts: [a], flows: new Map([[a.id, flow]]), returns: { savings: 0 }, npsTaxableRatio: 1 }, P);
    expect(run(early).warnings.some((w) => w.code === "withdrawal-limit")).toBe(false);
    expect(run(late).warnings.some((w) => w.code === "withdrawal-limit")).toBe(true);
  });

  it("개시를 늦추면 연차가 이미 쌓여 있어 한도가 넉넉하다 — 연차는 받을 수 있게 된 해부터 센다", () => {
    const flow = { 60: 10_000, 61: 10_000 };
    const late = acc({ id: "new", kind: "savings", flowByAge: flow, balance: 51_000_000, joinDate: "2015-01-01" });
    const s = computeTaxSchedule({ ...base, accounts: [late], flows: new Map([["new", flow]]), returns: { savings: 0 }, npsTaxableRatio: 1 }, P);
    expect(s.warnings.some((w) => w.code === "withdrawal-limit")).toBe(false);
  });
});
