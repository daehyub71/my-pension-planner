// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simulate, portalAssumptions, defaultContext } from "@/src/engine";
import { breakeven, scenarioMetrics } from "@/src/engine/metrics";
import { presetScenarios } from "@/src/engine/presets";
import type { Snapshot } from "@/src/engine/model";
import { RULES } from "@/src/rules/loader";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { buildSnapshot } from "@/src/importers/normalize";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
const pdf = parseContractItems(items as TextItem[]);
const snapshot: Snapshot = buildSnapshot({ excel, pdf, inputs: { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 90, spouseEmployed: true }, rulesVersion: RULES.version });
const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, 60, 90);
const base = portalAssumptions(snapshot.accounts.filter((a) => a.owner === "self"), ctx);

describe("F11 누적 손익분기", () => {
  it("늦게 시작해 나중에 앞서면 「N세부터 우위」 — 교차 나이를 선형 보간한다", () => {
    // 누적 차이(B−A): 60세 −10, 61세 −5, 62세 +5 → 61.5세에 0
    const a = { 60: 10, 61: 10, 62: 10 };
    const b = { 60: 0, 61: 15, 62: 20 };
    expect(breakeven(a, b)).toEqual({ kind: "ahead-from", age: 61.5 });
  });

  it("먼저 앞서다 뒤처지면 「N세까지 우위」", () => {
    const a = { 60: 0, 61: 15, 62: 20 };
    const b = { 60: 10, 61: 10, 62: 10 };
    expect(breakeven(a, b)).toEqual({ kind: "ahead-until", age: 61.5 });
  });

  it("교차하지 않으면 늘 우위이거나 늘 열위", () => {
    expect(breakeven({ 60: 1, 61: 1 }, { 60: 2, 61: 2 })).toEqual({ kind: "always-ahead" });
    expect(breakeven({ 60: 2, 61: 2 }, { 60: 1, 61: 1 })).toEqual({ kind: "always-behind" });
    expect(breakeven({ 60: 1 }, { 60: 1 })).toEqual({ kind: "same" });
  });
});

describe("M4-1 프리셋 5종", () => {
  const presets = presetScenarios(base, snapshot.inputs, RULES, simulate(snapshot, base, RULES));

  it("기본·연기·조기·지출 조정·주택연금", () => {
    expect(presets.map((p) => p.key)).toEqual(["base", "delay", "early", "spend", "housing"]);
    expect(presets[0]!.assumptions).toEqual(base);
    expect(presets[1]!.assumptions.npsStartAge).toBe(Math.min(70, base.npsStartAge + 3));
    expect(presets[2]!.assumptions.npsStartAge).toBe(60);
    expect(presets[3]!.assumptions.targetMonthlySpend).toBe(250);
    expect(presets[4]!.assumptions.housing).toMatchObject({ monthly: 1_000_000 });
    expect(presets[1]!.name).toMatch(/연기 \d+세/);
  });

  it("주택연금은 가장 큰 절벽 나이에 개시한다 — 절벽이 없으면 규칙의 기본 나이", () => {
    const sim = simulate(snapshot, base, RULES);
    const worst = sim.metrics.cliffs.reduce((w, c) => (c.dropRatio > w.dropRatio ? c : w));
    expect(presets[4]!.assumptions.housing!.startAge).toBe(worst.age);
  });
});

describe("F11 시나리오 지표", () => {
  const baseSim = simulate(snapshot, base, RULES);
  const delay = { ...base, npsStartAge: base.npsStartAge + 3 };
  const delaySim = simulate(snapshot, delay, RULES);

  it("필요 자산 · 가장 큰 절벽 · 90세 실질 가처분 · 손익분기 · 피부양자", () => {
    const m = scenarioMetrics(snapshot, delay, delaySim, RULES, { assumptions: base, result: baseSim });
    expect(m.requiredAtRetire).toBeGreaterThan(0);
    expect(m.worstCliff?.age).toBeGreaterThan(0);
    expect(m.realDisposableAt.age).toBe(90);
    expect(m.realDisposableAt.value).toBeCloseTo(delaySim.years.find((r) => r.age === 90)!.disposableReal!, 6);
    expect(["ahead-from", "always-ahead", "always-behind", "ahead-until"]).toContain(m.breakeven!.kind);
    expect(m.dependentLossAge).toBe(delaySim.metrics.dependentLossAge);
    expect(m.sparkline.length).toBe(delaySim.years.length);
  });

  it("기준 시나리오 자신은 손익분기가 없다", () => {
    expect(scenarioMetrics(snapshot, base, baseSim, RULES).breakeven).toBeUndefined();
  });
});

describe("가처분 화면 문구 재료 — 엔진이 역산한다 (2026-09-13 사용자 결정)", () => {
  it("1,500만 경계를 넘기는(또는 내려오는) 수령 기간 변화 — 적용하면 경계를 넘고, 한 해 덜 바꾸면 넘지 않는다", async () => {
    const { thresholdYearsLever } = await import("@/src/engine/levers");
    const threshold = 15_000_000;
    // 합성 K씨는 사적연금이 기준선보다 훨씬 커서 20년을 늘려도 못 내려온다 — 사적연금을 절반 규모로 줄인 사례로 본다
    const half = (a: Snapshot["accounts"][number]) =>
      a.kind === "national" ? a : { ...a, balance: a.balance !== undefined ? a.balance / 2 : undefined, flowByAge: Object.fromEntries(Object.entries(a.flowByAge).map(([k, v]) => [k, v / 2])) };
    const small: Snapshot = { ...snapshot, accounts: snapshot.accounts.map(half) };
    const smallBase = portalAssumptions(small.accounts.filter((a) => a.owner === "self"), ctx);
    const taxableAt = (a: typeof base, age: number) => (simulate(small, a, RULES).years.find((r) => r.age === age)?.tax?.detail.privateTaxable ?? 0) * 1000;
    let found = 0;
    for (const age of [62, 65, 70, 75]) {
      const lever = thresholdYearsLever(small, smallBase, RULES, age);
      if (!lever) continue;
      found++;
      const apply = (d: number) => {
        const privateStart = { ...smallBase.privateStart };
        for (const k of lever.kinds) privateStart[k] = { ...privateStart[k]!, years: privateStart[k]!.years + (under ? -d : d) };
        return { ...smallBase, privateStart };
      };
      const under = taxableAt(smallBase, age) <= threshold;
      expect(lever.direction).toBe(under ? "shorten" : "lengthen");
      expect(taxableAt(apply(lever.years), age) > threshold).toBe(under);
      if (lever.years > 1) expect(taxableAt(apply(lever.years - 1), age) > threshold).toBe(!under);
    }
    expect(found).toBeGreaterThan(0);
  });

  it("20년 안에 경계를 못 넘기면 문구를 만들지 않는다", async () => {
    const { thresholdYearsLever } = await import("@/src/engine/levers");
    expect(thresholdYearsLever(snapshot, base, RULES, 75)).toBeUndefined();
  });

  it("연기 프리셋의 피부양자 탈락 나이 — 연기 시나리오를 돌린 결과와 같다", async () => {
    const { delayDependentLoss } = await import("@/src/engine/presets");
    const baseSim = simulate(snapshot, base, RULES);
    const d = delayDependentLoss(snapshot, base, RULES, baseSim);
    const delaySim = simulate(snapshot, { ...base, npsStartAge: d.startAge }, RULES);
    expect(d.startAge).toBe(Math.min(70, base.npsStartAge + 3));
    expect(d.dependentLossAge).toBe(delaySim.metrics.dependentLossAge);
  });
});
