// @vitest-environment node
import { describe, it, expect } from "vitest";
import { simulateInputSchema, rulesInputSchema } from "@/mcp/src/schemas";
import { runSimulate, listRules } from "@/mcp/src/tools";
import { simulate } from "@/src/engine";
import { RULES } from "@/src/rules/loader";
import { DEMO_SNAPSHOT } from "@/src/demo";


const simulateSchema = simulateInputSchema;

describe("F20 계산기 MCP — 엔진 결과와 도구 출력의 계약 (M6-2)", () => {
  it("데모 스냅샷의 계좌·입력이 도구 입력 스키마를 통과한다", () => {
    const parsed = simulateSchema.safeParse({ accounts: DEMO_SNAPSHOT.accounts, inputs: DEMO_SNAPSHOT.inputs, asOf: DEMO_SNAPSHOT.asOf });
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
  });

  it("잘못된 입력은 스키마가 거부한다 — 계좌 종류·은퇴 나이", () => {
    expect(simulateSchema.safeParse({ accounts: [{ ...DEMO_SNAPSHOT.accounts[0], kind: "stock" }], inputs: DEMO_SNAPSHOT.inputs, asOf: "2026-08-31" }).success).toBe(false);
    expect(simulateSchema.safeParse({ accounts: DEMO_SNAPSHOT.accounts, inputs: { ...DEMO_SNAPSHOT.inputs, retireAge: undefined }, asOf: "2026-08-31" }).success).toBe(false);
  });

  it("simulate 도구는 엔진 simulate 와 같은 숫자를 낸다 — flowByYear·metrics·warnings·grades", () => {
    const out = runSimulate({ accounts: DEMO_SNAPSHOT.accounts, inputs: DEMO_SNAPSHOT.inputs, asOf: DEMO_SNAPSHOT.asOf });
    const engine = simulate({ ...DEMO_SNAPSHOT, demo: undefined }, undefined, RULES);
    expect(out.rulesVersion).toBe(engine.rulesVersion);
    expect(out.flowByYear).toHaveLength(engine.years.length);
    const r = out.flowByYear.find((y) => y.age === 70)!;
    const e = engine.years.find((y) => y.age === 70)!;
    expect(r).toMatchObject({ age: 70, year: e.year, gross: e.gross, real: e.real, disposable: e.disposable, disposableReal: e.disposableReal });
    expect(r.tax).toBeCloseTo(e.tax!.withholding + e.tax!.settlement, 6);
    expect(r.healthPremium).toBeCloseTo(e.health!.premium, 6);
    expect(out.metrics).toEqual(engine.metrics);
    expect(out.warnings).toEqual(engine.warnings);
    expect(out.grades).toEqual(engine.grades);
    expect(out.units).toMatch(/천원/);
  });

  it("가정을 일부만 넘기면 포털 가정 위에 덮어쓴다", () => {
    const base = runSimulate({ accounts: DEMO_SNAPSHOT.accounts, inputs: DEMO_SNAPSHOT.inputs, asOf: DEMO_SNAPSHOT.asOf });
    const later = runSimulate({ accounts: DEMO_SNAPSHOT.accounts, inputs: DEMO_SNAPSHOT.inputs, asOf: DEMO_SNAPSHOT.asOf, assumptions: { npsStartAge: 68 } });
    expect(later.assumptions.npsStartAge).toBe(68);
    expect(later.assumptions.inflation).toBe(base.assumptions.inflation);
    expect(later.flowByYear.find((y) => y.age === 66)!.gross).toBeLessThan(base.flowByYear.find((y) => y.age === 66)!.gross);
  });

  it("useDemo 로 개인 데이터 없이 합성 K씨를 돌린다", () => {
    const out = runSimulate({ useDemo: true });
    expect(out.demo).toBe(true);
    expect(out.flowByYear.length).toBeGreaterThan(0);
  });

  it("rules 도구 — 전체 목록과 등급·접두어 필터, 버전", () => {
    const all = listRules({});
    expect(all.version).toBe(RULES.version);
    expect(all.items).toHaveLength(RULES.items.length);
    expect(listRules({ grade: "estimated" }).items.every((r) => r.grade === "estimated")).toBe(true);
    expect(listRules({ prefix: "health." }).items.every((r) => r.id.startsWith("health."))).toBe(true);
    expect(rulesInputSchema.safeParse({ grade: "maybe" }).success).toBe(false);
  });
});
