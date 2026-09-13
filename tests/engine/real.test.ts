import { describe, it, expect } from "vitest";
import { toReal, realFactor } from "@/src/engine/real";

describe("F6 실질가치 — 명목의 착시를 벗긴다", () => {
  it("기준연도는 그대로", () => {
    expect(realFactor(2026, 2026, 0.031)).toBe(1);
    expect(toReal(1000, 2026, 2026, 0.031)).toBe(1000);
  });

  it("미래 금액은 물가로 할인한다", () => {
    expect(toReal(1031, 2027, 2026, 0.031)).toBeCloseTo(1000, 6);
  });

  it("명목의 착시: 명목은 90세가 80세보다 크지만 실질은 반대 (합성 K씨 합계)", () => {
    const base = 2026;
    const nominal80 = 37980; // 80세 = 2048년 (1968-07생)
    const nominal90 = 50611; // 90세 = 2058년
    expect(nominal90).toBeGreaterThan(nominal80);
    const real80 = toReal(nominal80, 2048, base, 0.031);
    const real90 = toReal(nominal90, 2058, base, 0.031);
    expect(real90).toBeLessThan(real80);
  });

  it("물가가 0이면 명목 = 실질", () => {
    expect(toReal(500, 2060, 2026, 0)).toBe(500);
  });
});
