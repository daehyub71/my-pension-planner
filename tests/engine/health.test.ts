import { describe, it, expect } from "vitest";
import { loadHealthParams, dependentIncome, isDependentEligible, regionalPremium, healthForYear } from "@/src/engine/health";
import { RULES } from "@/src/rules/loader";

const { params: H, grade } = loadHealthParams(RULES);

describe("F9 피부양자 — 소득·재산 경계", () => {
  it("연 소득 2,000만원까지 유지, 1원 넘으면 상실", () => {
    expect(isDependentEligible({ income: 20_000_000 }, H).eligible).toBe(true);
    expect(isDependentEligible({ income: 20_000_001 }, H)).toEqual({ eligible: false, reason: "income" });
  });

  it("재산 과표 9억 초과면 소득과 무관하게 상실, 5.4억 초과면 소득 1,000만 이하여야 유지", () => {
    expect(isDependentEligible({ income: 0, propertyTaxBase: 900_000_001 }, H)).toEqual({ eligible: false, reason: "property" });
    expect(isDependentEligible({ income: 10_000_000, propertyTaxBase: 540_000_001 }, H).eligible).toBe(true);
    expect(isDependentEligible({ income: 10_000_001, propertyTaxBase: 540_000_001 }, H)).toEqual({ eligible: false, reason: "property" });
  });

  it("공적연금은 전액, 금융소득은 1,000만 초과일 때만, 사적연금은 넣지 않는다 (R-2)", () => {
    expect(dependentIncome({ publicPension: 15_000_000, privatePension: 30_000_000, financialIncome: 10_000_000 }, H)).toBe(15_000_000);
    expect(dependentIncome({ publicPension: 15_000_000, privatePension: 0, financialIncome: 10_000_001 }, H)).toBe(25_000_001);
  });
});

describe("F9 지역보험료 — 추정", () => {
  it("공적연금 50% × (건강보험료율 + 장기요양보험료율)", () => {
    const p = regionalPremium({ publicPension: 24_000_000, financialIncome: 0 }, H);
    expect(p).toBeCloseTo(12_000_000 * (0.0719 + 0.009448), 0);
  });

  it("R-2 가 남아 건보료 산출은 추정 등급이다", () => {
    expect(grade).toBe("estimated");
  });
});

describe("F9 연도별 판정", () => {
  const common = { retireAge: 60, publicPension: 24_000_000, privatePension: 0, financialIncome: 0 };

  it("은퇴 전에는 직장가입 — 연금에 붙는 보험료 없음", () => {
    expect(healthForYear({ ...common, age: 59, spouseEmployed: true }, H)).toMatchObject({ basis: "employee", premium: 0, dependent: false });
  });

  it("배우자가 직장가입이고 요건 안이면 피부양자", () => {
    expect(healthForYear({ ...common, age: 65, spouseEmployed: true, publicPension: 20_000_000 }, H)).toMatchObject({ basis: "dependent", premium: 0, dependent: true });
  });

  it("요건을 넘으면 지역가입자로 보험료가 붙는다", () => {
    const r = healthForYear({ ...common, age: 65, spouseEmployed: true }, H);
    expect(r).toMatchObject({ basis: "regional", dependent: false, lostDependent: true });
    expect(r.premium).toBeGreaterThan(0);
  });

  it("배우자 직장가입 여부를 모르면 판정 불가 — 보험료는 지역가입 기준으로 보수적으로", () => {
    const r = healthForYear({ ...common, age: 65 }, H);
    expect(r.basis).toBe("unknown");
    expect(r.premium).toBeGreaterThan(0);
  });
});

describe("F9 재산분 지역보험료 — 시행령 별표 4 (M5-7)", () => {
  it("재산세 과표에서 1억을 빼고 60등급 점수로 바꾼다", async () => {
    const { propertyScore } = await import("@/src/engine/health");
    expect(propertyScore(undefined, H)).toBe(0);
    expect(propertyScore(100_000_000, H)).toBe(0); // 공제 후 0 이하
    expect(propertyScore(100_000_000 + 4_500_000, H)).toBe(22); // 450만 이하 → 1등급
    expect(propertyScore(100_000_000 + 4_500_001, H)).toBe(44); // 2등급
    expect(propertyScore(100_000_000 + 7_781_240_001, H)).toBe(2341); // 60등급
  });

  it("월 재산보험료 = 점수 × 211.5원, 장기요양은 같은 비율로 붙는다", () => {
    const p = regionalPremium({ publicPension: 0, financialIncome: 0, propertyTaxBase: 100_000_000 + 4_500_000 }, H);
    expect(p).toBeCloseTo(22 * 211.5 * 12 * (1 + 0.009448 / 0.0719), 3);
  });

  it("소득분과 재산분을 더한다", () => {
    const income = regionalPremium({ publicPension: 24_000_000, financialIncome: 0 }, H);
    const both = regionalPremium({ publicPension: 24_000_000, financialIncome: 0, propertyTaxBase: 300_000_000 }, H);
    expect(both).toBeGreaterThan(income);
  });
});
