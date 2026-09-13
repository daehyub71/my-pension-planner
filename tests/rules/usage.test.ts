import { describe, it, expect } from "vitest";
import { RULES } from "@/src/rules/loader";
import { ruleGroups, screensUsing, reportSummary } from "@/src/rules/usage";

describe("M5-1 규칙 근거 — 그룹·쓰이는 화면·요약", () => {
  it("모든 규칙에 표시 이름이 있다", () => {
    for (const r of RULES.items) expect(r.label, r.id).toBeTruthy();
  });

  it("모든 규칙이 어느 그룹에 속하고, 그룹마다 쓰이는 화면이 있다", () => {
    const groups = ruleGroups(RULES);
    expect(groups.flatMap((g) => g.rules).length).toBe(RULES.items.length);
    for (const g of groups) expect(g.screens.length, g.key).toBeGreaterThan(0);
  });

  it("그룹 등급은 가장 낮은 규칙 등급이다", () => {
    const health = ruleGroups(RULES).find((g) => g.key === "health")!;
    expect(health.grade).toBe("estimated"); // R-2 가 남아 있다
  });

  it("추정 규칙이 쓰이는 화면을 모은다", () => {
    const screens = screensUsing(RULES, "estimated");
    expect(screens).toContain("가처분");
    expect(screens.length).toBeGreaterThan(0);
  });

  it("요약 — 조문 대조 규칙 수와 그룹 수", () => {
    const s = reportSummary(RULES);
    expect(s.total).toBe(RULES.items.length);
    expect(s.verified).toBe(RULES.items.filter((r) => r.grade === "verified").length);
    expect(s.groupsVerified).toBeLessThanOrEqual(s.groups);
    expect(s.lastChecked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
