import { describe, it, expect } from "vitest";
import { validateInputs, missingForJudgement, DEFAULT_LIFE_EXPECTANCY } from "@/src/engine/inputs";

const good = { birthYearMonth: "1968-07", retireAge: 60, targetMonthlySpend: 300 };

describe("F3 validateInputs", () => {
  it("필수 셋이 있으면 통과하고 기대수명 기본 95 를 채운다", () => {
    const r = validateInputs(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.inputs.lifeExpectancy).toBe(DEFAULT_LIFE_EXPECTANCY);
  });

  it("은퇴 나이는 필수다 — 크레바스가 여기서 정의된다", () => {
    const r = validateInputs({ ...good, retireAge: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.field)).toContain("retireAge");
  });

  it("기대수명은 은퇴 나이보다 커야 한다", () => {
    const r = validateInputs({ ...good, retireAge: 70, lifeExpectancy: 70 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]?.field).toBe("lifeExpectancy");
  });

  it("생년월 형식을 본다", () => {
    expect(validateInputs({ ...good, birthYearMonth: "1968년07월" }).ok).toBe(false);
  });

  it("선택 항목은 비워도 되지만 음수는 안 된다", () => {
    expect(validateInputs({ ...good, financialAssets: undefined }).ok).toBe(true);
    expect(validateInputs({ ...good, financialAssets: -1 }).ok).toBe(false);
    expect(validateInputs({ ...good, npsTaxableRatio: 1.2 }).ok).toBe(false);
  });

  it("비운 선택 항목은 해당 판정을 '판정 불가'로 표시한다 — 추정하지 않는다", () => {
    const r = validateInputs(good);
    if (!r.ok) throw new Error("unexpected");
    const missing = missingForJudgement(r.inputs);
    expect(missing.map((m) => m.judgement)).toEqual(["goal", "health-premium", "dependent"]);
    const r2 = validateInputs({ ...good, financialAssets: 30000, propertyTaxBase: 0, spouseEmployed: true });
    if (!r2.ok) throw new Error("unexpected");
    expect(missingForJudgement(r2.inputs)).toEqual([]);
  });
});
