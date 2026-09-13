/** F20 — 도구 본체. 순수 함수라 테스트(tests/mcp)와 stdio 서버가 함께 쓴다. */
import { defaultContext, portalAssumptions, simulate } from "../../src/engine";
import type { Assumptions, Rules, Snapshot } from "../../src/engine/model";
import rulesJson from "../../rules/kr-2026.json";
import demoJson from "../../src/demo/demo-k.snapshot.json";
import type { RulesInput, SimulateInput } from "./schemas";

const RULES = rulesJson as unknown as Rules;
const DEMO = demoJson as unknown as Snapshot;

export function runSimulate(input: SimulateInput) {
  const snapshot: Snapshot = input.useDemo
    ? { ...DEMO, demo: undefined }
    : { asOf: input.asOf!, accounts: input.accounts as Snapshot["accounts"], inputs: input.inputs!, rulesVersion: RULES.version, warnings: [] };
  const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, snapshot.inputs.retireAge, snapshot.inputs.lifeExpectancy);
  const base = portalAssumptions(snapshot.accounts.filter((a) => a.owner === "self"), ctx);
  const assumptions: Assumptions = { ...base, ...(input.assumptions as Partial<Assumptions> | undefined) };
  const result = simulate(snapshot, assumptions, RULES);
  return {
    demo: Boolean(input.useDemo),
    rulesVersion: result.rulesVersion,
    baseYear: result.baseYear,
    units: "금액은 천원/년 — gross 세전 명목 · real 실질 · tax 원천징수+5월 정산 · healthPremium 건보료 · disposable 가처분",
    assumptions,
    flowByYear: result.years.map((r) => ({
      age: r.age,
      year: r.year,
      gross: r.gross,
      real: r.real,
      tax: (r.tax?.withholding ?? 0) + (r.tax?.settlement ?? 0),
      healthPremium: r.health?.premium ?? 0,
      disposable: r.disposable,
      disposableReal: r.disposableReal,
    })),
    metrics: result.metrics,
    warnings: result.warnings,
    grades: result.grades,
  };
}

export function listRules(filter: RulesInput) {
  const items = RULES.items.filter((r) => (!filter.grade || r.grade === filter.grade) && (!filter.prefix || r.id.startsWith(filter.prefix)));
  return { version: RULES.version, items };
}
