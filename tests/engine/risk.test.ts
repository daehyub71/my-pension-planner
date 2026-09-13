import demoExpected from "@/tests/fixtures/demo-k/expected.json";
import { describe, it, expect } from "vitest";
import { findCliffs, findCrevasse, totalByAge } from "@/src/engine/risk";
import type { Account } from "@/src/engine/model";

function acc(id: string, flow: Record<number, number>): Account {
  return { id, kind: "dc", owner: "self", institution: "x", product: id, startDate: "2031-01", flowByAge: flow };
}

/** 합성 K씨 합계 (tests/fixtures/demo-k/expected.json) 55~90세 — 절벽 77·80세 두 곳 */
const TOTAL: Record<number, number> = Object.fromEntries(Object.entries(demoExpected.totalByAge).map(([k, v]) => [Number(k), v as number]));

describe("F7 findCliffs — 절벽은 임계치 규칙이지 80세 고정이 아니다", () => {
  it("절벽 두 곳을 찾는다 — 77세와 80세", () => {
    const cliffs = findCliffs(TOTAL, 0.2);
    expect(cliffs.map((c) => c.age)).toEqual([77, 80]);
    expect(cliffs[0]!.dropRatio).toBeCloseTo(0.2048, 3);
    expect(cliffs[1]!.dropRatio).toBeCloseTo(0.4639, 3);
  });

  it("임계치를 올리면 큰 것만 남는다", () => {
    expect(findCliffs(TOTAL, 0.3).map((c) => c.age)).toEqual([80]);
  });

  it("종료한 계좌를 원인으로 알려 준다", () => {
    const accounts = [acc("a", { 60: 100, 61: 100, 62: 0 }), acc("b", { 60: 20, 61: 20, 62: 20 })];
    const total = totalByAge(accounts, 60, 62);
    const cliffs = findCliffs(total, 0.2, accounts);
    expect(cliffs).toHaveLength(1);
    expect(cliffs[0]!.age).toBe(62);
    expect(cliffs[0]!.endedAccountIds).toEqual(["a"]);
  });

  it("상승 구간에는 절벽이 없다", () => {
    expect(findCliffs({ 60: 100, 61: 120, 62: 130 }, 0.2)).toEqual([]);
  });
});

describe("F7 findCrevasse — 은퇴 나이에 종속된다", () => {
  it("은퇴 55세: 55세부터 본궤도 직전까지", () => {
    const c = findCrevasse(TOTAL, 55, 0.7);
    expect(c).toBeDefined();
    expect(c!.fromAge).toBe(55);
    expect(c!.toAge).toBe(69);
    expect(c!.depthRatio).toBeLessThan(0.5);
  });

  it("같은 데이터라도 은퇴가 늦으면 크레바스가 짧아진다", () => {
    const c = findCrevasse(TOTAL, 62, 0.7);
    expect(c!.fromAge).toBe(62);
    expect(c!.toAge).toBe(69);
  });

  it("은퇴가 본궤도 뒤면 크레바스가 없다", () => {
    expect(findCrevasse(TOTAL, 70, 0.7)).toBeUndefined();
  });

  it("본궤도 기준을 낮추면 크레바스가 짧아진다", () => {
    const loose = findCrevasse(TOTAL, 55, 0.3);
    expect(loose!.toAge).toBeLessThan(findCrevasse(TOTAL, 55, 0.7)!.toAge);
  });
});
