// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { simulate } from "@/src/engine";
import { dashboardGuide, scenariosGuide } from "@/src/engine/explain";
import { RULES } from "@/src/rules/loader";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { buildSnapshot } from "@/src/importers/normalize";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
const snapshot = buildSnapshot({ excel, pdf: parseContractItems(items as TextItem[]), inputs: { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: RULES.version });
const sim = simulate(snapshot, undefined, RULES);

describe("F21 「이 화면 읽는 법」 — 정적 템플릿에 내 수치", () => {
  it("대시보드 — 절벽·크레바스·명목/실질·엑셀 출처 4꼭지, 내 수치가 들어간다", () => {
    const g = dashboardGuide(snapshot, sim);
    expect(g.map((s) => s.key)).toEqual(["source", "cliff", "crevasse", "real"]);
    const cliff = sim.metrics.cliffs[0]!;
    expect(g.find((s) => s.key === "cliff")!.body).toContain(`${cliff.age}세`);
    expect(g.find((s) => s.key === "crevasse")!.body).toContain(`${sim.metrics.crevasse!.fromAge}`);
    expect(g.find((s) => s.key === "source")!.body).toContain(snapshot.asOf);
    expect(g.find((s) => s.key === "real")!.body).toMatch(/3\.1%/);
  });

  it("절벽이 없으면 없다고 말한다 — 지어내지 않는다", () => {
    const g = dashboardGuide(snapshot, { ...sim, metrics: { ...sim.metrics, cliffs: [], crevasse: undefined } });
    expect(g.find((s) => s.key === "cliff")!.body).toMatch(/없습니다/);
    expect(g.find((s) => s.key === "crevasse")!.body).toMatch(/없습니다/);
  });

  it("시나리오 — 손익분기·필요 자산·피부양자 읽는 법", () => {
    const g = scenariosGuide([
      { name: "기본", breakeven: undefined, requiredAtRetire: 460_000, dependentLossAge: undefined },
      { name: "연기 68세", breakeven: { kind: "ahead-from", age: 80.8 }, requiredAtRetire: 410_000, dependentLossAge: 73 },
    ]);
    expect(g.map((s) => s.key)).toEqual(["breakeven", "required", "dependent"]);
    expect(g[0]!.body).toContain("80.8세");
    expect(g[2]!.body).toContain("73세");
  });

  it("손익분기가 「같음」이면 필요 자산이 다를 때만 「지출만 다름」이라고 말한다", () => {
    const same = { kind: "same" } as const;
    const spend = scenariosGuide([
      { name: "기본", requiredAtRetire: 460_000 },
      { name: "지출 −50만", breakeven: same, requiredAtRetire: 300_000 },
    ]);
    expect(spend[0]!.body).toContain("필요 금융자산만 다릅니다");
    const noop = scenariosGuide([
      { name: "기본", requiredAtRetire: 460_000 },
      { name: "연기 68세", breakeven: same, requiredAtRetire: 460_000 },
    ]);
    expect(noop[0]!.body).toContain("다시 계산되지 않았습니다");
  });
});
