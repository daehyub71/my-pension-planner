import { describe, it, expect } from "vitest";
import { formatRuleValue, shortDate } from "@/components/RulesValue";
import { RULES } from "@/src/rules/loader";

const f = (id: string, value: unknown) => formatRuleValue({ id, value });

describe("formatRuleValue", () => {
  it("비율은 %, 금액은 만원·억원, 나이는 세", () => {
    expect(f("portal.inflation", 0.031)).toBe("3.1%");
    expect(f("health.ltc_rate", 0.009448)).toBe("0.9448%");
    expect(f("nps.taxable_ratio_default", 1)).toBe("100%");
    expect(f("nps.deferral_increase_per_year", 0.072)).toBe("연 7.2%");
    expect(f("private.separate_tax_threshold", 15000000)).toBe("1,500만원");
    expect(f("health.dependent_property_upper", 540000000)).toBe("5억 4,000만원");
    expect(f("health.point_price_krw", 211.5)).toBe("211.5원");
    expect(f("portal.private_start_age", 60)).toBe("60세");
    expect(f("inputs.default_life_expectancy", 95)).toBe("95세");
  });

  it("불리언·문자열·범위", () => {
    expect(f("tax.insurance_gain_exempt", true)).toBe("예");
    expect(f("health.dependent_include_private", false)).toBe("아니오");
    expect(f("model.implied_return", "현가 일치 역산")).toBe("현가 일치 역산");
    expect(f("nps.start_age_range", [60, 70])).toBe("60~70세");
  });

  it("표 모양 값은 짧게 요약한다", () => {
    expect(f("private.low_rate_by_age", [{ fromAge: 55, rate: 0.055 }, { fromAge: 70, rate: 0.044 }, { fromAge: 80, rate: 0.033 }])).toBe("5.5 / 4.4 / 3.3%");
    expect(
      f("tax.basic_rates", [
        { upTo: 14000000, rate: 0.06 },
        { upTo: 50000000, rate: 0.15 },
        { upTo: null, rate: 0.45 },
      ]),
    ).toBe("6~45% 3단계");
    expect(f("health.property_score_table", { deductionWon: 100000000, grades: [{ upToManwon: 450, score: 22 }, { upToManwon: null, score: 44 }] })).toBe("2등급 · 1억 공제");
    expect(f("severance.deferred_discount", { upTo10: 0.7, over10: 0.6, over20: 0.5 })).toBe("70 / 60 / 50%");
    expect(f("private.withdrawal_limit", { divisorBase: 11, multiplier: 1.2 })).toBe("÷(11−연차)×120%");
    expect(f("tax.pension_income_deduction", { steps: [{}, {}, {}, {}], max: 9000000 })).toBe("4구간 · 한도 900만원");
  });

  it("모르는 모양은 짧은 JSON 으로", () => {
    expect(f("x.unknown", { a: "b" })).toBe('{"a":"b"}');
    expect(f("x.long", { text: "a".repeat(100) }).length).toBe(40);
  });

  it("실제 규칙 파일의 값은 전부 40자 안쪽 표기가 나온다", () => {
    for (const r of RULES.items) {
      const s = formatRuleValue(r);
      expect(s.length).toBeGreaterThan(0);
      expect(s.length).toBeLessThanOrEqual(40);
    }
    expect(formatRuleValue(RULES.items.find((r) => r.id === "tax.basic_rates")!)).toBe("6~45% 8단계");
    expect(formatRuleValue(RULES.items.find((r) => r.id === "health.property_score_table")!)).toBe("60등급 · 1억 공제");
  });

  it("확인일은 MM-DD", () => {
    expect(shortDate("2026-09-13")).toBe("09-13");
    expect(shortDate(undefined)).toBe("—");
  });
});
