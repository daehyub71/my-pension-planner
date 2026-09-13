/**
 * F4·F5 — 포털 산식 재현과 재계산.
 *
 * 실측(2026-09-09)으로 확정한 두 가지:
 *  ① 국민연금 = 월액 앵커 × 12 × (1+물가)^n, 개시 첫 해만 개월 비례 — 26개 값 오차 0으로 재현된다.
 *  ② 사적연금은 지급액이 계좌마다 일정 비율 g 로 커진다(DC 4.50% · IRP 4.49% · 연금저축 5.12% · 보험 0%).
 *     적립금과 그 흐름을 잇는 내재수익률 r 을 현가 일치로 역산하면(각 6.19% · 4.88% · 5.39% · 7.32%),
 *     개시·기간을 바꿔도 같은 g·r 로 적립금을 정확히 소진하는 흐름을 다시 만들 수 있다.
 *
 * 금액 단위는 포털 엑셀과 같은 천원, 연 1행이다. 순수 함수만 둔다.
 */

export const DEFAULT_FROM_AGE = 55;
export const DEFAULT_TO_AGE = 90;

/** 엑셀의 연령 열은 만 나이가 아니라 「그 나이가 되는 달력 연도」다 (1968-07생의 65세 = 2033년). */
export function yearOfAge(birthYearMonth: string, age: number): number {
  const y = Number(birthYearMonth.slice(0, 4));
  if (!Number.isFinite(y)) throw new Error(`생년월이 이상하다: ${birthYearMonth}`);
  return y + age;
}

/** 개시 달부터 그 해 12월까지의 개월 수 (4월 개시 → 9개월). */
export function monthsInFirstYear(startDate: string): number {
  const m = Number(startDate.slice(5, 7));
  if (!Number.isInteger(m) || m < 1 || m > 12) throw new Error(`개시 월이 이상하다: ${startDate}`);
  return 13 - m;
}

function emptyFlow(fromAge: number, toAge: number): Record<number, number> {
  const flow: Record<number, number> = {};
  for (let a = fromAge; a <= toAge; a++) flow[a] = 0;
  return flow;
}

/** 원 단위 금액을 포털과 같은 천원으로 (반올림). */
function toThousand(won: number): number {
  return Math.round(won / 1000);
}

export interface NpsFlowArgs {
  monthlyAmount: number; // 원/월 (포털 "예상연금수령액")
  startDate: string; // YYYY-MM
  startAge: number;
  inflation: number;
  toAge: number;
  fromAge?: number;
}

/** F4 — 국민연금 앵커 산식. 포털이 명목으로 표시하므로 물가율이 곧 증가율이다. */
export function npsFlowFromAnchor({ monthlyAmount, startDate, startAge, inflation, toAge, fromAge = DEFAULT_FROM_AGE }: NpsFlowArgs): Record<number, number> {
  const flow = emptyFlow(fromAge, toAge);
  if (monthlyAmount <= 0) return flow;
  const months = monthsInFirstYear(startDate);
  for (let age = startAge; age <= toAge; age++) {
    const n = age - startAge;
    const monthCount = n === 0 ? months : 12;
    flow[age] = toThousand(monthlyAmount * monthCount * Math.pow(1 + inflation, n));
  }
  return flow;
}

function paymentAges(flow: Record<number, number>): number[] {
  return Object.keys(flow)
    .map(Number)
    .filter((a) => (flow[a] ?? 0) > 0)
    .sort((a, b) => a - b);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * F4 — 원본 흐름에서 지급액 증가율을 읽는다.
 * 첫 전환(부분연도 → 만 1년)은 건너뛰고, 보너스가 섞인 상품(연금보험)을 견디도록 중앙값을 쓴다.
 */
export function deriveGrowthRate(flow: Record<number, number>): number | undefined {
  const ages = paymentAges(flow);
  if (ages.length < 3) return undefined;
  const ratios: number[] = [];
  for (let i = 1; i < ages.length - 1; i++) {
    const prev = flow[ages[i]!]!;
    const next = flow[ages[i + 1]!]!;
    if (prev > 0) ratios.push(next / prev);
  }
  if (ratios.length === 0) return undefined;
  return median(ratios) - 1;
}

export interface ImpliedReturnArgs {
  flow: Record<number, number>;
  balance: number | undefined;
  asOfYear: number; // 소수 연도 (2026-08-31 → 2026 + 8/12)
  birthYearMonth: string;
  firstAge?: number; // 쓰지 않지만 호출부의 의도를 남긴다
}

/** 지급 시점: 그 해 중간으로 잡는다 (연 1행이라 월 분포를 모른다). */
function payTime(birthYearMonth: string, age: number, asOfYear: number): number {
  return yearOfAge(birthYearMonth, age) + 0.5 - asOfYear;
}

/**
 * F4 — 적립금과 지급 흐름을 잇는 내재수익률. 현가가 적립금과 같아지는 r 을 이분법으로 찾는다.
 * 포털이 상품유형별 수익률 가정을 공개하지 않으므로, 흐름 자체에서 되찾는 것이 유일한 길이다.
 */
export function deriveImpliedReturn({ flow, balance, asOfYear, birthYearMonth }: ImpliedReturnArgs): number | undefined {
  if (!balance || balance <= 0) return undefined;
  const ages = paymentAges(flow);
  if (ages.length === 0) return undefined;
  const pv = (r: number): number => ages.reduce((s, a) => s + flow[a]! / Math.pow(1 + r, payTime(birthYearMonth, a, asOfYear)), 0) - balance;
  let lo = -0.5;
  let hi = 1;
  if (pv(lo) * pv(hi) > 0) return undefined; // 구간 안에 해가 없다 — 추정하지 않는다
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pv(lo) * pv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface RegenerateArgs {
  balance: number; // 천원
  asOfYear: number;
  birthYearMonth: string;
  growth: number; // 지급액 증가율 g
  ret: number; // 내재수익률 r
  startAge: number;
  years: number;
  startMonth: number; // 1~12
  fromAge?: number;
  toAge?: number;
}

/**
 * F5 — 가정을 바꿨을 때의 흐름. 적립금을 정확히 소진하는 성장연금을 만든다.
 * 현가 합이 적립금과 같아지도록 첫 지급액을 정하므로, 원래 개시·기간을 그대로 넣으면 원본을 되돌린다.
 */
export function regenerateFlow({ balance, asOfYear, birthYearMonth, growth, ret, startAge, years, startMonth, fromAge = DEFAULT_FROM_AGE, toAge = DEFAULT_TO_AGE }: RegenerateArgs): Record<number, number> {
  const flow = emptyFlow(fromAge, Math.max(toAge, startAge + years - 1));
  if (balance <= 0 || years <= 0) return flow;
  const months = 13 - startMonth;
  const weights: number[] = [];
  for (let i = 0; i < years; i++) {
    const age = startAge + i;
    if (age > toAge) break;
    const partial = i === 0 ? months / 12 : 1;
    weights.push((partial * Math.pow(1 + growth, i)) / Math.pow(1 + ret, payTime(birthYearMonth, age, asOfYear)));
  }
  const denom = weights.reduce((s, v) => s + v, 0);
  if (denom <= 0) return flow;
  const first = balance / denom;
  for (let i = 0; i < weights.length; i++) {
    const age = startAge + i;
    const partial = i === 0 ? months / 12 : 1;
    flow[age] = first * partial * Math.pow(1 + growth, i);
  }
  return flow;
}
