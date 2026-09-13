/**
 * 엔진 진입점 — Snapshot + 가정 + 규칙 → 연도별 결과.
 * 순수 함수다. React·DOM·파서·저장소를 import 하지 않는다 (PLAN §1-3, ESLint 로 잠금).
 */
import type { Account, AccountKind, Assumptions, Grade, Metrics, Rules, SimResult, SimWarning, Snapshot, YearRow } from "./model";
import { defaultContext, deriveBase, portalAssumptions, projectAccount, type ProjectContext } from "./project";
import { ruleOf, propagateGrades, worstOf } from "./grade";
import { computeTaxSchedule, loadTaxParams } from "./tax";
import { dependentIncome, healthForYear, loadHealthParams } from "./health";
import { findCliffs, findCrevasse } from "./risk";
import { toReal } from "./real";
import { yearOfAge } from "./portal";

export * from "./model";
export { npsFlowFromAnchor, deriveGrowthRate, deriveImpliedReturn, regenerateFlow, yearOfAge, monthsInFirstYear } from "./portal";
export { deriveBase, portalAssumptions, projectAccount, defaultContext, npsAdjustFactor } from "./project";
export { findCliffs, findCrevasse, totalByAge } from "./risk";
export { toReal, realFactor } from "./real";
export { validateInputs, missingForJudgement, DEFAULT_LIFE_EXPECTANCY } from "./inputs";
export { computeTaxSchedule, loadTaxParams, annualPensionTax } from "./tax";
export { healthForYear, loadHealthParams } from "./health";
export { computeGoal } from "./goal";
export { scenarioMetrics, breakeven } from "./metrics";
export { presetScenarios, delayDependentLoss } from "./presets";
export { thresholdYearsLever } from "./levers";
export { compareSnapshots } from "./compare";
export { dashboardGuide, scenariosGuide } from "./explain";
export { propagateGrades, gradeOfRules, worstOf } from "./grade";

const rule = ruleOf;

function housingAccount(h: NonNullable<Assumptions["housing"]>, ctx: ProjectContext): Account {
  const flowByAge: Record<number, number> = {};
  for (let age = ctx.fromAge; age <= ctx.toAge; age++) flowByAge[age] = age >= h.startAge ? (h.monthly * 12) / 1000 : 0;
  return {
    id: "housing",
    kind: "housing",
    owner: "self",
    institution: "한국주택금융공사",
    product: "주택연금 (직접 입력)",
    startDate: `${yearOfAge(ctx.birthYearMonth, h.startAge)}-01`,
    flowByAge,
  };
}

export interface SimulateOptions {
  /** 대시보드가 본인 것만 그린다 (부부 합산 UI 는 2차). 기본 true */
  selfOnly?: boolean;
}

export function simulate(snapshot: Snapshot, assumptions: Assumptions | undefined, rules: Rules, options: SimulateOptions = {}): SimResult {
  const { selfOnly = true } = options;
  const { inputs } = snapshot;
  const ctx: ProjectContext = defaultContext(inputs.birthYearMonth, snapshot.asOf, inputs.retireAge, inputs.lifeExpectancy);
  const accounts: Account[] = selfOnly ? snapshot.accounts.filter((a) => a.owner === "self") : snapshot.accounts;
  const used = portalAssumptions(accounts, ctx);
  const effective = assumptions ?? used;

  const early = rule<number>(rules, "nps.early_reduction_per_year");
  const defer = rule<number>(rules, "nps.deferral_increase_per_year");
  const cliffThreshold = rule<number>(rules, "risk.cliff_threshold");
  const mainlineRatio = rule<number>(rules, "risk.mainline_ratio");

  const warnings: SimWarning[] = [];
  // F13 주택연금 — 가정에만 있는 계좌를 붙인다. 정액 월액이고 비과세·건보 소득 아님
  const planned = effective.housing ? [...accounts, housingAccount(effective.housing, ctx)] : accounts;
  const projected = planned.map((a) => projectAccount(a, effective, ctx, { earlyPerYear: early.value, deferPerYear: defer.value }));
  const grades: Record<string, Grade> = { flow: "verified", cliffs: "verified", crevasse: "verified" };

  for (const p of projected) {
    const acc = planned.find((a) => a.id === p.accountId)!;
    if (p.note === "no-balance") {
      const what = acc.kind === "national" ? "예상 월액(계약정보 PDF)을 몰라 개시 나이를 바꿔도" : "적립금을 몰라 가정을 바꿔도";
      warnings.push({ code: "no-balance", accountId: p.accountId, message: `${acc.product}: ${what} 다시 계산하지 못한다 — 포털 값을 그대로 쓴다` });
      grades.flow = "estimated";
    }
    if (p.note === "model-mismatch") {
      warnings.push({
        code: "model-mismatch",
        accountId: p.accountId,
        message: `${acc.product}: 명목 고정 + 주기 보너스 구조라 역산 수익률을 액면대로 쓸 수 없다 — 이 계좌의 재계산은 추정이다`,
      });
      grades.flow = "estimated";
    }
    if (p.changed && acc.kind === "national") {
      grades.flow = grades.flow === "estimated" ? "estimated" : early.grade;
      warnings.push({ code: "nps-shift", accountId: p.accountId, message: `국민연금 개시를 ${effective.npsStartAge}세로 바꿔 다시 계산했다` });
    }
  }

  // 포털 데이터는 90세에서 끝난다. 그 뒤를 지어내지 않는다 — 국민연금만 앵커 산식으로 이어진다.
  const portalLastAge = Math.max(
    0,
    ...accounts.flatMap((a) =>
      Object.entries(a.flowByAge)
        .filter(([, v]) => v > 0)
        .map(([k]) => Number(k)),
    ),
  );
  if (inputs.lifeExpectancy > portalLastAge) {
    warnings.push({ code: "data-ends", age: portalLastAge, message: `포털 데이터는 ${portalLastAge}세에서 끝난다 — 그 뒤는 국민연금(앵커 산식)과 다시 계산한 계좌만 값이 있다` });
  }

  const flows = new Map(projected.map((p) => [p.accountId, p.flow]));
  const baseYear = Number(snapshot.asOf.slice(0, 4));
  const years: YearRow[] = [];
  const totalByAge: Record<number, number> = {};
  for (let age = ctx.fromAge; age <= ctx.toAge; age++) {
    const byAccount: Record<string, number> = {};
    let gross = 0;
    for (const a of planned) {
      const v = flows.get(a.id)?.[age] ?? 0;
      byAccount[a.id] = v;
      gross += v;
    }
    const year = yearOfAge(inputs.birthYearMonth, age);
    totalByAge[age] = gross;
    years.push({ age, year, byAccount, gross, real: toReal(gross, year, baseYear, effective.inflation) });
  }

  const cliffs = findCliffs(totalByAge, cliffThreshold.value, planned);
  const crevasse = findCrevasse(totalByAge, inputs.retireAge, mainlineRatio.value);
  for (const c of cliffs) {
    warnings.push({ code: "cliff", age: c.age, message: `${c.age}세에 수령액이 전년 대비 ${Math.round(c.dropRatio * 100)}% 줄어든다` });
  }
  if (crevasse) {
    warnings.push({ code: "crevasse", age: crevasse.fromAge, message: `${crevasse.fromAge}~${crevasse.toAge}세는 본궤도의 ${Math.round(crevasse.depthRatio * 100)}% 수준이다` });
  }

  // F8·F9 — 세금·건보료·가처분. 본인 계좌만 계산한다 (가족은 나이를 몰라 세율·연차를 정할 수 없다)
  const selfAccounts = accounts.filter((a) => a.owner === "self");
  const returns: Partial<Record<AccountKind, number>> = {};
  for (const a of selfAccounts) {
    const r = effective.returnByKind[a.kind] ?? deriveBase(a, ctx)?.ret;
    if (r !== undefined && returns[a.kind] === undefined) returns[a.kind] = r;
  }
  const taxParams = loadTaxParams(rules);
  const schedule = computeTaxSchedule(
    { accounts: selfAccounts, flows, birthYearMonth: inputs.birthYearMonth, asOfYear: ctx.asOfYear, fromAge: ctx.fromAge, toAge: ctx.toAge, retireAge: inputs.retireAge, returns, npsTaxableRatio: inputs.npsTaxableRatio },
    taxParams.params,
  );
  warnings.push(...schedule.warnings);
  if (selfAccounts.length < accounts.length) {
    warnings.push({ code: "tax-assumption", message: "가족 계좌는 세금·건보료 계산에서 뺐다 — 가처분에 세전 그대로 들어간다" });
  }

  const health = loadHealthParams(rules);
  const financialIncome = (inputs.annualFinancialIncome ?? 0) * 10000;
  const propertyTaxBase = inputs.propertyTaxBase !== undefined ? inputs.propertyTaxBase * 10000 : undefined;
  const altHealth = { ...health.params, includePrivate: !health.params.includePrivate };
  let dependentLossAge: number | undefined;
  let altLossAge: number | undefined;
  let extraPremiumTotal = 0;
  let extraPremiumMaxMonthly = 0;
  for (const row of years) {
    let publicPension = 0;
    let privatePension = 0;
    for (const a of selfAccounts) {
      const v = (row.byAccount[a.id] ?? 0) * 1000;
      if (a.kind === "national") publicPension += v;
      // 비과세 소득은 건보 소득에서 빠진다 (건보법 시행령 제41조 ①) — 주택연금·보험차익 비과세 연금보험
      else if (a.kind !== "housing" && a.kind !== "insurance") privatePension += v;
    }
    const h = healthForYear({ age: row.age, retireAge: inputs.retireAge, spouseEmployed: inputs.spouseEmployed, publicPension, privatePension, financialIncome, propertyTaxBase }, health.params);
    if (h.lostDependent && dependentLossAge === undefined) dependentLossAge = row.age;
    // R-2 반대 해석으로 한 번 더 — 가처분에는 넣지 않고 차이만 모은다
    const alt = healthForYear({ age: row.age, retireAge: inputs.retireAge, spouseEmployed: inputs.spouseEmployed, publicPension, privatePension, financialIncome, propertyTaxBase }, altHealth);
    if (alt.lostDependent && altLossAge === undefined) altLossAge = row.age;
    const gap = (alt.premium - h.premium) / 1000;
    extraPremiumTotal += gap;
    extraPremiumMaxMonthly = Math.max(extraPremiumMaxMonthly, gap / 12);
    const t = schedule.byAge[row.age]!;
    const { withholding, settlement, ...detail } = t;
    row.tax = { withholding, settlement, detail };
    row.health = {
      premium: h.premium / 1000,
      dependent: h.dependent,
      basis: h.basis,
      grade: health.grade,
      dependentIncome: dependentIncome({ publicPension, privatePension, financialIncome }, health.params) / 1000,
    };
    row.disposable = row.gross - withholding - settlement - row.health.premium;
    row.disposableReal = toReal(row.disposable, row.year, baseYear, effective.inflation);
  }
  if (inputs.spouseEmployed === undefined && ctx.toAge >= inputs.retireAge) {
    warnings.push({ code: "health-unknown", age: inputs.retireAge, message: "배우자 직장가입 여부를 몰라 피부양자를 판정하지 못했다 — 보험료는 지역가입자 기준으로 보수적으로 넣었다" });
  }
  const healthIfPrivateCounted = { dependentLossAge: altLossAge, extraPremiumTotal, extraPremiumMaxMonthly };
  if (!health.params.includePrivate && (extraPremiumTotal > 0 || altLossAge !== dependentLossAge)) {
    const loss = altLossAge !== undefined && altLossAge !== dependentLossAge ? `피부양자를 ${altLossAge}세에 잃고 ` : "";
    warnings.push({
      code: "health-unknown",
      age: altLossAge,
      message: `R-2: 사적연금이 건보 소득에 들어간다면 ${loss}건보료가 월 최대 ${Math.round(extraPremiumMaxMonthly / 10).toLocaleString("ko-KR")}만원 늘어난다 — 조문은 포함으로 읽히고 실무 설명은 미반영이라 공단 확인이 필요하다`,
    });
  }
  if (dependentLossAge !== undefined) {
    warnings.push({ code: "dependent-loss", age: dependentLossAge, message: `${dependentLossAge}세에 피부양자 요건을 넘어 지역가입자가 된다 — 건보료가 새로 붙는다` });
  }
  grades.tax = worstOf(schedule.grade, selfAccounts.length < accounts.length ? "estimated" : schedule.grade);
  grades.health = health.grade;

  const peak = years.reduce((best, r) => (r.gross > best.gross ? r : best), years[0] ?? { age: ctx.fromAge, gross: 0, real: 0 } as YearRow);
  const metrics: Metrics = {
    peakAge: peak.age,
    peakGross: peak.gross,
    cliffs: cliffs.map((c) => ({ age: c.age, dropRatio: c.dropRatio, endedAccountIds: c.endedAccountIds })),
    crevasse: crevasse ? { fromAge: crevasse.fromAge, toAge: crevasse.toAge, depthRatio: crevasse.depthRatio } : undefined,
    lastRealGross: years[years.length - 1]?.real ?? 0,
    accountCount: accounts.length,
    dependentLossAge,
    healthIfPrivateCounted,
  };

  return { rulesVersion: rules.version, baseYear, years, warnings, metrics, grades: propagateGrades({ flow: grades.flow!, tax: grades.tax!, health: grades.health!, ...grades }) };
}
