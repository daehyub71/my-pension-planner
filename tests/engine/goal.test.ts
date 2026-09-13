// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simulate, portalAssumptions, defaultContext } from "@/src/engine";
import { computeGoal, requiredAssetsAt, depletionAge } from "@/src/engine/goal";
import type { Snapshot } from "@/src/engine/model";
import { RULES } from "@/src/rules/loader";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { buildSnapshot } from "@/src/importers/normalize";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
const pdf = parseContractItems(items as TextItem[]);
const snapshot: Snapshot = buildSnapshot({ excel, pdf, inputs: { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: RULES.version });

describe("F12 산식 조각", () => {
  it("필요 금융자산 = 은퇴 나이 기준 부족분의 실질 현가 (실질수익률로 할인)", () => {
    // 은퇴 60세, 부족분 60·61세 각 1,000 (천원), 실질수익률 0 → 2,000
    expect(requiredAssetsAt({ 60: 1000, 61: 1000 }, 60, 0)).toBeCloseTo(2000, 6);
    // 실질수익률 10% → 1000 + 1000/1.1
    expect(requiredAssetsAt({ 60: 1000, 61: 1000 }, 60, 0.1)).toBeCloseTo(1000 + 1000 / 1.1, 6);
    // 부족분이 없으면 0
    expect(requiredAssetsAt({ 60: 0, 61: 0 }, 60, 0.05)).toBe(0);
  });

  it("소진 나이 — 잔액이 처음 음수가 되는 나이. 끝까지 버티면 없다", () => {
    // 지금 3,000 보유, 은퇴 60세, 매년 1,000씩 부족, 수익 0 → 60·61·62세에 쓰고 62세에 0, 63세에 음수
    expect(depletionAge({ held: 3000, currentAge: 58, retireAge: 60, gapByAge: { 60: 1000, 61: 1000, 62: 1000, 63: 1000 }, realReturn: 0 })).toBe(63);
    expect(depletionAge({ held: 10_000, currentAge: 58, retireAge: 60, gapByAge: { 60: 1000, 61: 1000 }, realReturn: 0 })).toBeUndefined();
  });
});

describe("F12 목표 모드 — 실제 스냅샷", () => {
  const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, 60, 90);
  const base = portalAssumptions(snapshot.accounts.filter((a) => a.owner === "self"), ctx);
  const sim = simulate(snapshot, base, RULES);

  it("월 지출과 가처분(실질)으로 필요 금융자산을 낸다 — 금융자산을 모르면 갭은 판정 불가", () => {
    const g = computeGoal(snapshot, base, sim, RULES);
    expect(g.requiredAtRetire).toBeGreaterThan(0);
    expect(g.held).toBeUndefined();
    expect(g.gap).toBeUndefined();
    expect(g.depletionAge).toBeUndefined();
    expect(g.missing).toContain("financialAssets");
    expect(g.retireAge).toBe(60);
    expect(g.assetReturn).toBe(0.05);
  });

  it("금융자산을 넣으면 갭·소진 나이가 나온다", () => {
    const withAssets: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, financialAssets: 10_000 } }; // 1억
    const g = computeGoal(withAssets, base, simulate(withAssets, base, RULES), RULES);
    expect(g.held).toBeCloseTo(100_000, 6); // 천원
    expect(g.gap).toBeCloseTo(g.heldAtRetire! - g.requiredAtRetire, 6);
    if (g.gap! < 0) expect(g.depletionAge).toBeGreaterThanOrEqual(60);
  });

  it("지출을 줄이면 필요 금융자산이 준다 — 시나리오의 지출 조정이 가정으로 들어온다", () => {
    const g1 = computeGoal(snapshot, base, sim, RULES);
    const g2 = computeGoal(snapshot, { ...base, targetMonthlySpend: 250 }, sim, RULES);
    expect(g2.requiredAtRetire).toBeLessThan(g1.requiredAtRetire);
    expect(g2.monthlySpend).toBe(250);
  });

  it("가처분이 추정이면 목표도 추정이다", () => {
    expect(computeGoal(snapshot, base, sim, RULES).grade).toBe("estimated");
  });
});
