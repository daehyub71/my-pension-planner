// @vitest-environment node
import { REAL, hasRealExpected } from "../private.helper";
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { simulate, portalAssumptions, defaultContext, projectAccount, deriveBase, npsAdjustFactor } from "@/src/engine";
import type { Assumptions, Snapshot } from "@/src/engine/model";
import { RULES } from "@/src/rules/loader";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { buildSnapshot } from "@/src/importers/normalize";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
const pdf = parseContractItems(items as TextItem[]);
const snapshot: Snapshot = buildSnapshot({ excel, pdf, inputs: { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: RULES.version });
const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, 60, 90);
const selfAccounts = snapshot.accounts.filter((a) => a.owner === "self");

describe("F4 포털 가정은 원본을 그대로 되살린다", () => {
  const base = portalAssumptions(selfAccounts, ctx);
  const sim = simulate(snapshot, base, RULES);

  it("모든 계좌가 pass-through 다 — 근사 모델로 덮지 않는다", () => {
    for (const a of selfAccounts) {
      const p = projectAccount(a, base, ctx, { earlyPerYear: 0.06, deferPerYear: 0.072 });
      expect({ id: a.id, changed: p.changed }).toEqual({ id: a.id, changed: false });
    }
  });

  it("연도별 합계가 엑셀 합계 행과 같다 (본인 행만)", () => {
    const familyByAge = snapshot.accounts.filter((a) => a.owner === "family").reduce<Record<number, number>>((acc, a) => {
      for (const [age, v] of Object.entries(a.flowByAge)) acc[Number(age)] = (acc[Number(age)] ?? 0) + v;
      return acc;
    }, {});
    for (const row of sim.years) {
      expect(row.gross).toBe((excel.totalByAge[row.age] ?? 0) - (familyByAge[row.age] ?? 0));
    }
  });

  it("연령을 달력 연도로 옮긴다", () => {
    expect(sim.years.find((r) => r.age === 65)?.year).toBe(2033); // 1968-07생
  });

  it("가족 행은 기본으로 빼고, 옵션으로 넣을 수 있다", () => {
    const withFamily = simulate(snapshot, undefined, RULES, { selfOnly: false });
    expect(withFamily.metrics.accountCount).toBe(6);
    expect(sim.metrics.accountCount).toBe(5);
  });
});

describe("F5 가정을 바꾸면 그 계좌만 다시 만든다", () => {
  const base = portalAssumptions(selfAccounts, ctx);

  it("국민연금 연기: 수령액이 늘고 개시가 밀린다", () => {
    const later: Assumptions = { ...base, npsStartAge: base.npsStartAge + 3 };
    const sim = simulate(snapshot, later, RULES);
    const nps = selfAccounts.find((a) => a.kind === "national")!;
    const at68 = sim.years.find((r) => r.age === 68)!.byAccount[nps.id]!;
    const at66 = sim.years.find((r) => r.age === 66)!.byAccount[nps.id]!;
    expect(at66).toBe(0);
    expect(at68).toBeGreaterThan(0);
    expect(sim.warnings.some((w) => w.code === "nps-shift")).toBe(true);
  });

  it("개시 나이를 옮기면 그 사이 물가 반영도 옮긴다 — 둘 다 받는 나이에서는 비율이 가산·감액 계수와 같다", () => {
    const nps = selfAccounts.find((a) => a.kind === "national")!;
    const baseSim = simulate(snapshot, base, RULES);
    const at = (s: typeof baseSim, age: number) => s.years.find((r) => r.age === age)!.byAccount[nps.id]!;
    const later = simulate(snapshot, { ...base, npsStartAge: base.npsStartAge + 3 }, RULES);
    const earlier = simulate(snapshot, { ...base, npsStartAge: base.npsStartAge - 5 }, RULES);
    const age = base.npsStartAge + 5; // 셋 다 만 1년 넘게 받는 나이
    expect(at(later, age) / at(baseSim, age)).toBeCloseTo(1.216, 3);
    expect(at(earlier, age) / at(baseSim, age)).toBeCloseTo(0.7, 3);
  });

  it("연기 계수는 규칙에서 온다 — 연 7.2%", () => {
    expect(npsAdjustFactor(68, 65, 0.06, 0.072)).toBeCloseTo(1.216, 6);
    expect(npsAdjustFactor(60, 65, 0.06, 0.072)).toBeCloseTo(0.7, 6);
    expect(npsAdjustFactor(65, 65, 0.06, 0.072)).toBe(1);
  });

  it("퇴직연금 수령 기간을 늘리면 연 지급액이 준다", () => {
    const dc = selfAccounts.find((a) => a.kind === "dc")!;
    const b = deriveBase(dc, ctx)!;
    const longer: Assumptions = { ...base, privateStart: { ...base.privateStart, dc: { age: b.startAge, years: b.years + 10 } } };
    const sim = simulate(snapshot, longer, RULES);
    const first = sim.years.find((r) => r.age === b.startAge)!.byAccount[dc.id]!;
    expect(first).toBeLessThan(dc.flowByAge[b.startAge]!);
  });

  it("적립금을 모르면 다시 만들지 않고 알려 준다", () => {
    const noBalance: Snapshot = { ...snapshot, accounts: snapshot.accounts.map((a) => (a.kind === "dc" ? { ...a, balance: undefined } : a)) };
    const dc = noBalance.accounts.find((a) => a.kind === "dc")!;
    const b = deriveBase(dc, ctx)!;
    const changed: Assumptions = { ...base, privateStart: { ...base.privateStart, dc: { age: b.startAge + 2, years: b.years } } };
    const sim = simulate(noBalance, changed, RULES);
    expect(sim.warnings.some((w) => w.code === "no-balance")).toBe(true);
    expect(sim.grades.flow).toBe("estimated");
    expect(sim.years.find((r) => r.age === b.startAge)!.byAccount[dc.id]).toBe(dc.flowByAge[b.startAge]);
  });
});

describe("F6·F7 실질가치와 위험 구간", () => {
  const sim = simulate(snapshot, undefined, RULES);

  it("실질은 명목보다 작고, 기준연도는 같다", () => {
    const first = sim.years[0]!;
    expect(sim.baseYear).toBe(2026);
    const later = sim.years.find((r) => r.age === 90)!;
    expect(later.real).toBeLessThan(later.gross);
    expect(first.real).toBeLessThanOrEqual(first.gross);
  });

  it("절벽과 크레바스를 경고로 낸다", () => {
    expect(sim.metrics.cliffs.length).toBeGreaterThan(0);
    expect(sim.warnings.some((w) => w.code === "cliff")).toBe(true);
    expect(sim.metrics.crevasse?.fromAge).toBe(60);
  });

  it("절벽에 원인 계좌가 붙는다", () => {
    const c = sim.metrics.cliffs[0]!;
    expect(c.endedAccountIds.length).toBeGreaterThan(0);
  });

  it("포털 데이터가 끝난 뒤에도 국민연금은 앵커 산식으로 기대수명까지 이어진다 — 종신연금이다", () => {
    const longer: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, lifeExpectancy: 95 } };
    const s = simulate(longer, undefined, RULES);
    const nps = selfAccounts.find((a) => a.kind === "national")!;
    const at = (age: number) => s.years.find((r) => r.age === age)!.byAccount[nps.id]!;
    // 90세까지는 포털 원본 그대로
    expect(at(90)).toBe(nps.flowByAge[90]);
    // 91세 이후는 0 이 아니고 물가만큼 커진다
    for (const age of [91, 93, 95]) expect(at(age)).toBeGreaterThan(0);
    expect(at(91) / at(90)).toBeCloseTo(1.031, 2);
    // 사적연금은 지어내지 않는다
    const dc = selfAccounts.find((a) => a.kind === "dc")!;
    expect(s.years.find((r) => r.age === 95)!.byAccount[dc.id]).toBe(0);
  });

  it("포털 데이터가 끝나는 나이를 알려 준다", () => {
    const longer: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, lifeExpectancy: 95 } };
    const s = simulate(longer, undefined, RULES);
    expect(s.warnings.some((w) => w.code === "data-ends")).toBe(true);
    expect(s.years[s.years.length - 1]?.age).toBe(95);
  });

  it("규칙 버전을 결과에 달고 다닌다", () => {
    expect(sim.rulesVersion).toBe("kr-2026");
  });
});

describe("F8·F9 세금·건보료·가처분 (M2)", () => {
  const sim = simulate(snapshot, undefined, RULES);

  it("모든 해에 세금·건보료·가처분이 채워지고, 가처분 = 세전 − 원천징수 − 정산 − 건보료", () => {
    for (const r of sim.years) {
      expect(r.tax).toBeDefined();
      expect(r.health).toBeDefined();
      expect(r.disposable).toBeCloseTo(r.gross - r.tax!.withholding - r.tax!.settlement - r.health!.premium, 6);
      if (r.year >= sim.baseYear) expect(r.disposableReal!).toBeLessThanOrEqual(r.disposable! + 1e-9);
    }
  });

  it("수령이 있는 해는 세금이 붙고, 없는 해는 0 이다", () => {
    const paying = sim.years.find((r) => r.gross > 0)!;
    expect(paying.tax!.withholding + paying.tax!.settlement).toBeGreaterThan(0);
    const idle = sim.years.find((r) => r.gross === 0);
    if (idle) expect(idle.disposable).toBe(0);
  });

  it("원천 구성·과세대상 비율을 몰라 세금은 추정, 건보료도 추정 — 가처분이 추정을 물려받는다", () => {
    expect(sim.grades.tax).toBe("estimated");
    expect(sim.grades.health).toBe("estimated");
    expect(sim.grades.disposable).toBe("estimated");
    expect(sim.warnings.some((w) => w.code === "tax-assumption")).toBe(true);
    expect(sim.warnings.some((w) => w.code === "health-unknown")).toBe(true);
  });

  it("국민연금 과세대상 비율을 넣으면 세금이 준다", () => {
    const withRatio: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, npsTaxableRatio: 0.3 } };
    const s = simulate(withRatio, undefined, RULES);
    const at70 = (x: typeof sim) => x.years.find((r) => r.age === 70)!.tax!;
    expect(at70(s).detail.npsTaxable).toBeLessThan(at70(sim).detail.npsTaxable);
    expect(at70(s).withholding + at70(s).settlement).toBeLessThanOrEqual(at70(sim).withholding + at70(sim).settlement);
  });

  it("배우자 직장가입이면 피부양자 탈락 나이를 찾는다 — 은퇴 전은 직장가입", () => {
    const dep: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, spouseEmployed: true } };
    const s = simulate(dep, undefined, RULES);
    expect(s.years.find((r) => r.age === 59)!.health!.basis).toBe("employee");
    // 합성 K씨 국민연금은 월 135만 → 연 1,620만에서 물가로 커져 2,000만을 넘는 해가 온다
    expect(s.metrics.dependentLossAge).toBeGreaterThan(65);
    expect(s.warnings.some((w) => w.code === "dependent-loss" && w.age === s.metrics.dependentLossAge)).toBe(true);
    const before = s.years.find((r) => r.age === s.metrics.dependentLossAge! - 1)!;
    expect(before.health).toMatchObject({ basis: "dependent", premium: 0 });
  });

  it("R-2 — 사적연금이 건보 소득에 들어가는 경우도 함께 계산해 경고로 보여 준다 (2026-09-13 사용자 결정)", () => {
    const dep: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, spouseEmployed: true } };
    const s = simulate(dep, undefined, RULES);
    const alt = s.metrics.healthIfPrivateCounted!;
    expect(alt).toBeDefined();
    // 합성 K씨는 60세부터 사적연금이 연 2,000만을 넘는다 — 포함하면 은퇴하자마자 피부양자를 잃는다
    expect(alt.dependentLossAge).toBe(60);
    expect(alt.dependentLossAge!).toBeLessThan(s.metrics.dependentLossAge!);
    expect(alt.extraPremiumTotal).toBeGreaterThan(0);
    expect(alt.extraPremiumMaxMonthly).toBeGreaterThan(0);
    expect(s.warnings.some((w) => w.code === "health-unknown" && /R-2/.test(w.message))).toBe(true);
    // 기본 경로(미반영)의 가처분은 바뀌지 않는다
    expect(s.years.find((r) => r.age === 60)!.health!.premium).toBe(0);
  });

  it("F13 주택연금을 넣으면 개시 나이부터 월액×12 가 비과세로 더해진다", () => {
    const base = portalAssumptions(selfAccounts, ctx);
    const plain = simulate(snapshot, base, RULES);
    const s = simulate(snapshot, { ...base, housing: { startAge: 80, monthly: 1_000_000 } }, RULES);
    const at79 = (x: typeof s) => x.years.find((r) => r.age === 79)!;
    const at80 = (x: typeof s) => x.years.find((r) => r.age === 80)!;
    expect(at79(s).gross).toBe(at79(plain).gross);
    expect(at80(s).byAccount.housing).toBe(12_000);
    expect(at80(s).gross).toBeCloseTo(at80(plain).gross + 12_000, 6);
    // 세금·건보료는 그대로 — 주택연금은 비과세이고 건보 소득도 아니다
    expect(at80(s).tax!.withholding + at80(s).tax!.settlement).toBeCloseTo(at80(plain).tax!.withholding + at80(plain).tax!.settlement, 6);
    expect(at80(s).health!.premium).toBeCloseTo(at80(plain).health!.premium, 6);
  });

  it("한 해 해부 재료 — 연금소득 합산·연금소득공제·피부양자 소득을 엔진이 낸다", () => {
    const s = simulate({ ...snapshot, inputs: { ...snapshot.inputs, spouseEmployed: true } }, undefined, RULES);
    const r = s.years.find((y) => y.age === 70)!;
    expect(r.tax!.detail.pensionIncomeTotal).toBeCloseTo(r.tax!.detail.npsTaxable + r.tax!.detail.privateTaxable, 6);
    expect(r.tax!.detail.pensionDeduction).toBeGreaterThan(0);
    expect(r.health!.dependentIncome).toBeGreaterThan(0);
  });

  it("국민연금을 늦추면 수령액이 커져 피부양자를 더 일찍 잃을 수 있다 — 연기의 역효과", () => {
    const dep: Snapshot = { ...snapshot, inputs: { ...snapshot.inputs, spouseEmployed: true } };
    const base = portalAssumptions(selfAccounts, ctx);
    const early = simulate(dep, base, RULES).metrics.dependentLossAge!;
    const later = simulate(dep, { ...base, npsStartAge: base.npsStartAge + 5 }, RULES).metrics.dependentLossAge!;
    expect(later).toBeGreaterThan(base.npsStartAge + 4);
    expect(later - (base.npsStartAge + 5)).toBeLessThan(early - base.npsStartAge);
  });

});

const PRIVATE_DIR = join(__dirname, "..", "..", "data", "private");
const px = existsSync(PRIVATE_DIR) ? readdirSync(PRIVATE_DIR).find((f) => /^100lifeplan_.*\.xlsx$/.test(f)) : undefined;
const pp = existsSync(PRIVATE_DIR) ? readdirSync(PRIVATE_DIR).find((f) => /\.pdf$/.test(f)) : undefined;

describe.skipIf(!px || !pp || !hasRealExpected)("실데이터 (로컬에만 있음, 기대값은 data/private/expected-real.json)", () => {
  it("포털 가정이 엑셀 합계를 그대로 되살리고, 절벽 두 곳과 크레바스를 찾는다", async () => {
    const { extractTextItems } = await import("@/src/importers/pdf");
    const ex = parsePortalExcel(readFileSync(join(PRIVATE_DIR, px!)));
    const pd = parseContractItems(await extractTextItems(new Uint8Array(readFileSync(join(PRIVATE_DIR, pp!)))));
    const snap = buildSnapshot({ excel: ex, pdf: pd, inputs: { retireAge: 55, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: RULES.version });
    const sim = simulate(snap, undefined, RULES);
    for (const row of sim.years) expect(row.gross).toBe(ex.totalByAge[row.age]);
    expect(sim.metrics.cliffs.map((c) => c.age)).toEqual(REAL.simulate.cliffs);
    expect(sim.metrics.peakAge).toBe(REAL.simulate.peakAge);
    expect(sim.metrics.crevasse).toMatchObject(REAL.simulate.crevasse);
    // 내재수익률이 계좌마다 다르게 역산된다
    const c = defaultContext(snap.inputs.birthYearMonth, snap.asOf, 55, 90);
    const rets = snap.accounts.filter((a) => a.owner === "self" && a.kind !== "national").map((a) => deriveBase(a, c)!.ret!);
    expect(rets.map((r) => Math.round(r * 1000) / 10)).toEqual(REAL.simulate.impliedReturnsPct);
  });
});
