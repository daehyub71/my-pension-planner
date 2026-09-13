import { describe, it, expect } from "vitest";
import { propagateGrades, gradeOfRules } from "@/src/engine/grade";
import type { Rules } from "@/src/engine/model";

const rules: Rules = {
  version: "t",
  items: [
    { id: "a", value: 1, kind: "law", source: "s", grade: "verified" },
    { id: "b", value: 1, kind: "law", source: "s", grade: "web" },
    { id: "c", value: 1, kind: "law", source: "s", grade: "estimated" },
  ],
};

describe("등급 전파", () => {
  it("쓴 규칙 중 가장 낮은 등급", () => {
    expect(gradeOfRules(rules, ["a"])).toBe("verified");
    expect(gradeOfRules(rules, ["a", "b"])).toBe("web");
    expect(gradeOfRules(rules, ["a", "b", "c"])).toBe("estimated");
  });

  it("가처분은 흐름·세금·건보료 중 가장 낮은 등급을 물려받는다", () => {
    expect(propagateGrades({ flow: "verified", tax: "web", health: "estimated" }).disposable).toBe("estimated");
    expect(propagateGrades({ flow: "verified", tax: "web", health: "web" }).disposable).toBe("web");
    expect(propagateGrades({ flow: "estimated", tax: "verified", health: "verified" }).disposable).toBe("estimated");
  });

  it("다른 키는 그대로 둔다", () => {
    const g = propagateGrades({ flow: "verified", tax: "web", health: "estimated", cliffs: "verified" });
    expect(g).toMatchObject({ flow: "verified", tax: "web", health: "estimated", cliffs: "verified" });
  });
});
