/**
 * F5 — 가정을 흐름에 반영한다.
 *
 * 규칙 하나: **가정이 원본과 같으면 원본을 그대로 통과시킨다.** 포털의 사적연금 지급 산식은 공개돼 있지 않아
 * 근사 모델로 덮으면 「포털 가정」시나리오가 포털과 어긋난다. 사용자가 바꾼 계좌만 다시 만든다.
 */
import type { Account, AccountKind, Assumptions } from "./model";
import { deriveGrowthRate, deriveImpliedReturn, npsFlowFromAnchor, regenerateFlow, yearOfAge, DEFAULT_FROM_AGE } from "./portal";

export interface AccountBase {
  startAge: number;
  startMonth: number;
  years: number;
  growth?: number;
  ret?: number;
}

export interface ProjectContext {
  birthYearMonth: string;
  asOfYear: number; // 소수 연도
  fromAge: number;
  toAge: number;
}

function paymentAges(flow: Record<number, number>): number[] {
  return Object.keys(flow)
    .map(Number)
    .filter((a) => (flow[a] ?? 0) > 0)
    .sort((a, b) => a - b);
}

/** 원본 흐름과 적립금에서 계좌의 기준 모델을 읽는다. 못 읽는 값은 undefined 로 남긴다. */
export function deriveBase(account: Account, ctx: ProjectContext): AccountBase | undefined {
  const ages = paymentAges(account.flowByAge);
  if (ages.length === 0) return undefined;
  const startAge = ages[0]!;
  const startMonth = Number(account.startDate.slice(5, 7)) || 1;
  return {
    startAge,
    startMonth,
    years: ages[ages.length - 1]! - startAge + 1,
    growth: deriveGrowthRate(account.flowByAge),
    ret: deriveImpliedReturn({ flow: account.flowByAge, balance: account.balance !== undefined ? account.balance / 1000 : undefined, asOfYear: ctx.asOfYear, birthYearMonth: ctx.birthYearMonth }),
  };
}

/** 국민연금 조기·연기 계수. 기준 개시 연령은 원본 흐름이 알려 준다 (출생연도마다 다르다). */
export function npsAdjustFactor(startAge: number, baseStartAge: number, earlyPerYear: number, deferPerYear: number): number {
  if (startAge < baseStartAge) return Math.max(0, 1 - earlyPerYear * (baseStartAge - startAge));
  if (startAge > baseStartAge) return 1 + deferPerYear * (startAge - baseStartAge);
  return 1;
}

export interface ProjectRules {
  earlyPerYear: number;
  deferPerYear: number;
}

export interface ProjectedAccount {
  accountId: string;
  flow: Record<number, number>;
  changed: boolean;
  note?: "no-balance" | "data-ends" | "model-mismatch";
}

/** 한 계좌의 흐름. 가정이 기준과 같으면 원본을 그대로 돌려준다. */
export function projectAccount(account: Account, assumptions: Assumptions, ctx: ProjectContext, rules: ProjectRules): ProjectedAccount {
  const base = deriveBase(account, ctx);
  const passthrough = (note?: ProjectedAccount["note"]): ProjectedAccount => ({ accountId: account.id, flow: extend(account.flowByAge, ctx), changed: false, note });
  if (!base) return passthrough();

  if (account.kind === "national") {
    // 가족 행은 대시보드 범위 밖이라 손대지 않는다
    if (account.owner !== "self" || account.monthlyAmount === undefined) {
      return passthrough(account.owner === "self" ? "no-balance" : undefined);
    }
    const startAge = assumptions.npsStartAge;
    const inflationSame = Math.abs(assumptions.inflation - inflationOf(account.flowByAge)) < 1e-9;
    if (startAge === base.startAge && inflationSame) {
      // 포털 엑셀은 90세에서 끝나지만 국민연금은 종신이다 — 원본이 없는 나이만 앵커 산식으로 잇는다 (오차 0 산식)
      const lastPortalAge = base.startAge + base.years - 1;
      const kept = passthrough();
      if (ctx.toAge <= lastPortalAge) return kept;
      const startDate = `${yearOfAge(ctx.birthYearMonth, base.startAge)}-${String(base.startMonth).padStart(2, "0")}`;
      const anchor = npsFlowFromAnchor({ monthlyAmount: account.monthlyAmount, startDate, startAge: base.startAge, inflation: assumptions.inflation, toAge: ctx.toAge, fromAge: ctx.fromAge });
      for (let age = lastPortalAge + 1; age <= ctx.toAge; age++) kept.flow[age] = anchor[age] ?? 0;
      return kept;
    }
    // 포털 월액은 원래 개시 해의 명목 금액이다 — 개시를 옮기면 그 사이 물가 반영(연금액 재평가)도 함께 옮긴다
    const factor = npsAdjustFactor(startAge, base.startAge, rules.earlyPerYear, rules.deferPerYear) * Math.pow(1 + assumptions.inflation, startAge - base.startAge);
    const startDate = `${yearOfAge(ctx.birthYearMonth, startAge)}-${String(base.startMonth).padStart(2, "0")}`;
    return {
      accountId: account.id,
      flow: npsFlowFromAnchor({ monthlyAmount: account.monthlyAmount * factor, startDate, startAge, inflation: assumptions.inflation, toAge: ctx.toAge, fromAge: ctx.fromAge }),
      changed: true,
    };
  }

  const override = assumptions.privateStart[account.kind];
  const retOverride = assumptions.returnByKind[account.kind];
  const startAge = override?.age ?? base.startAge;
  const years = override?.years ?? base.years;
  const ret = retOverride ?? base.ret;
  const growth = base.growth;
  // 「같은 값을 다시 준 것」과 「바꾼 것」을 구별한다 — portalAssumptions 는 파생값을 그대로 담아 돌려주므로
  // undefined 여부로 판정하면 포털 시나리오가 통째로 재계산돼 원본과 어긋난다.
  const retChanged = retOverride !== undefined && (base.ret === undefined || Math.abs(retOverride - base.ret) > 1e-12);
  if (startAge === base.startAge && years === base.years && !retChanged) return passthrough();
  // 물가는 사적연금 흐름에 쓰지 않는다 — 포털에서 사적연금은 상품별 증가율 g 로 커지고,
  // 물가는 국민연금의 명목 증가와 실질가치 환산(F6)에만 관여한다.
  if (account.balance === undefined) return passthrough("no-balance"); // 적립금이 없으면 다시 만들 수 없다
  if (ret === undefined || growth === undefined) return passthrough("no-balance");
  return {
    accountId: account.id,
    // 연금보험은 명목 고정 + 주기적 보너스라 성장연금 모델이 맞지 않는다 — 다시 만들되 등급을 내린다
    note: account.kind === "insurance" ? "model-mismatch" : undefined,
    flow: regenerateFlow({
      balance: account.balance / 1000,
      asOfYear: ctx.asOfYear,
      birthYearMonth: ctx.birthYearMonth,
      growth,
      ret,
      startAge,
      years,
      startMonth: base.startMonth,
      fromAge: ctx.fromAge,
      toAge: ctx.toAge,
    }),
    changed: true,
  };
}

/** 원본 흐름을 요청한 나이 범위에 맞춘다. 데이터가 없는 나이는 0 — 지어내지 않는다. */
function extend(flow: Record<number, number>, ctx: ProjectContext): Record<number, number> {
  const out: Record<number, number> = {};
  for (let a = ctx.fromAge; a <= ctx.toAge; a++) out[a] = flow[a] ?? 0;
  return out;
}

/** 원본 흐름에 박혀 있는 증가율 (국민연금은 이것이 포털의 물가 가정이다). */
function inflationOf(flow: Record<number, number>): number {
  return deriveGrowthRate(flow) ?? 0;
}

export function defaultContext(birthYearMonth: string, asOf: string, retireAge: number, lifeExpectancy: number): ProjectContext {
  const y = Number(asOf.slice(0, 4));
  const m = Number(asOf.slice(5, 7)) || 1;
  return {
    birthYearMonth,
    asOfYear: y + (m - 0.5) / 12,
    fromAge: Math.min(DEFAULT_FROM_AGE, retireAge),
    toAge: lifeExpectancy,
  };
}

/** 「포털 가정」 — 원본을 그대로 되살리는 가정 묶음. 여기서 출발해 사용자가 하나씩 바꾼다. */
export function portalAssumptions(accounts: Account[], ctx: ProjectContext): Assumptions {
  const self = accounts.filter((a) => a.owner === "self");
  const nps = self.find((a) => a.kind === "national");
  const npsBase = nps ? deriveBase(nps, ctx) : undefined;
  const returnByKind: Partial<Record<AccountKind, number>> = {};
  const privateStart: Assumptions["privateStart"] = {};
  for (const a of self) {
    if (a.kind === "national") continue;
    const b = deriveBase(a, ctx);
    if (!b) continue;
    if (b.ret !== undefined) returnByKind[a.kind] = b.ret;
    privateStart[a.kind] = { age: b.startAge, years: b.years };
  }
  return {
    inflation: nps ? inflationOf(nps.flowByAge) : 0.031,
    returnByKind,
    npsStartAge: npsBase?.startAge ?? 65,
    privateStart,
  };
}
