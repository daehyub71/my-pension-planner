import { describe, it, expect } from "vitest";
import { RULES, parseRules, getRule, worstGrade } from "@/src/rules/loader";

describe("rules/kr-2026.json", () => {
  it("버전과 항목을 읽는다", () => {
    expect(RULES.version).toBe("kr-2026");
    expect(RULES.items.length).toBeGreaterThan(10);
  });

  it("포털 물가 가정 3.1% 는 실측 verified 다", () => {
    const r = getRule<number>(RULES, "portal.inflation");
    expect(r.value).toBe(0.031);
    expect(r.grade).toBe("verified");
  });

  it("조문 대조한 규칙은 verified 이고 근거에 조문이 있다 (2026-09-13 korean-law-mcp)", () => {
    for (const id of ["private.low_rate_by_age", "tax.basic_rates", "private.withdrawal_limit", "severance.deferred_discount", "health.premium_rate"]) {
      const r = RULES.items.find((x) => x.id === id)!;
      expect(r.grade).toBe("verified");
      expect(r.source).toMatch(/제\d+조/);
    }
  });

  it("R-2(피부양자·지역보험료에 사적연금 포함 여부)는 아직 estimated 다", () => {
    expect(getRule(RULES, "health.dependent_include_private").grade).toBe("estimated");
  });

  it("없는 규칙은 예외 — 조용한 기본값 금지", () => {
    expect(() => getRule(RULES, "nope.missing")).toThrow(/not found/);
  });

  it("모양이 틀린 JSON 은 거부한다", () => {
    expect(() => parseRules({ version: "x", items: [{ id: "a", value: 1, kind: "law", source: "s", grade: "maybe" }] })).toThrow(/grade/);
    expect(() =>
      parseRules({ version: "x", items: [
        { id: "a", value: 1, kind: "law", source: "s", grade: "web" },
        { id: "a", value: 2, kind: "law", source: "s", grade: "web" },
      ] }),
    ).toThrow(/중복/);
  });

  it("worstGrade 는 가장 낮은 등급을 고른다", () => {
    expect(worstGrade("verified", "verified")).toBe("verified");
    expect(worstGrade("verified", "web")).toBe("web");
    expect(worstGrade("web", "estimated", "verified")).toBe("estimated");
  });
});
