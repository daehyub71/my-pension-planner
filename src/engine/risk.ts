/**
 * F7 — 위험 구간. 실측에서 절벽은 76세(−24%)와 80세(−55%) 두 곳이었다.
 * 그래서 나이를 박지 않고 임계치 규칙으로 찾는다. 크레바스는 은퇴 나이 없이는 정의되지 않는다.
 */
import type { Account } from "./model";

export interface Cliff {
  age: number;
  dropRatio: number; // 전년 대비 낙폭 (0.55 = −55%)
  before: number;
  after: number;
  endedAccountIds: string[];
}

export interface Crevasse {
  fromAge: number;
  toAge: number;
  depthRatio: number; // 구간 평균 ÷ 본궤도 평균
  mainlineFromAge: number;
}

export function totalByAge(accounts: Account[], fromAge: number, toAge: number): Record<number, number> {
  const total: Record<number, number> = {};
  for (let a = fromAge; a <= toAge; a++) total[a] = accounts.reduce((s, acc) => s + (acc.flowByAge[a] ?? 0), 0);
  return total;
}

function sortedAges(total: Record<number, number>): number[] {
  return Object.keys(total)
    .map(Number)
    .sort((a, b) => a - b);
}

/** 전년 대비 낙폭이 임계치 이상인 나이를 전부 찾는다. accounts 를 주면 그 해에 끝난 계좌를 원인으로 붙인다. */
export function findCliffs(total: Record<number, number>, threshold: number, accounts?: Account[]): Cliff[] {
  const ages = sortedAges(total);
  const cliffs: Cliff[] = [];
  for (let i = 1; i < ages.length; i++) {
    const age = ages[i]!;
    const before = total[ages[i - 1]!] ?? 0;
    const after = total[age] ?? 0;
    if (before <= 0) continue;
    const dropRatio = 1 - after / before;
    if (dropRatio < threshold) continue;
    const endedAccountIds = (accounts ?? [])
      .filter((acc) => (acc.flowByAge[ages[i - 1]!] ?? 0) > 0 && (acc.flowByAge[age] ?? 0) === 0)
      .map((acc) => acc.id);
    cliffs.push({ age, dropRatio, before, after, endedAccountIds });
  }
  return cliffs;
}

function average(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}

/**
 * 은퇴 나이부터 「본궤도」(전 구간 최대치의 mainlineRatio 이상) 직전까지가 크레바스다.
 * 은퇴가 이미 본궤도 안이면 크레바스는 없다.
 */
export function findCrevasse(total: Record<number, number>, retireAge: number, mainlineRatio: number): Crevasse | undefined {
  const ages = sortedAges(total);
  if (ages.length === 0) return undefined;
  const peak = Math.max(...ages.map((a) => total[a] ?? 0));
  if (peak <= 0) return undefined;
  const threshold = peak * mainlineRatio;
  const mainlineFromAge = ages.find((a) => a >= retireAge && (total[a] ?? 0) >= threshold);
  if (mainlineFromAge === undefined) return undefined;
  const toAge = mainlineFromAge - 1;
  if (toAge < retireAge) return undefined;
  const inCrevasse = ages.filter((a) => a >= retireAge && a <= toAge).map((a) => total[a] ?? 0);
  const inMainline = ages.filter((a) => a >= mainlineFromAge).map((a) => total[a] ?? 0);
  return { fromAge: retireAge, toAge, depthRatio: average(inMainline) > 0 ? average(inCrevasse) / average(inMainline) : 0, mainlineFromAge };
}
