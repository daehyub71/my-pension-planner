/** F18 — 조회기준일이 다른 두 스냅샷 비교 ("작년 대비 +N"). 본인 계좌만 본다. */
import type { Account, AccountKind, Snapshot } from "./model";

export interface AccountChange {
  kind: AccountKind;
  institution: string;
  product: string;
  status: "both" | "added" | "removed";
  balanceDiff?: number; // 원 — 양쪽에 적립금이 있을 때만
  totalFlowDiff: number; // 천원
}

export interface SnapshotComparison {
  fromAsOf: string;
  toAsOf: string;
  years: number; // 소수 한 자리
  totalFlowDiff: number; // 연금 흐름 합계 차이 (천원)
  balanceDiff: number; // 적립금 합계 차이 (원)
  npsMonthlyDiff?: number; // 국민연금 예상 월액 차이 (원)
  accounts: AccountChange[];
}

const keyOf = (a: Account) => `${a.kind}|${a.institution}|${a.product}`;
const flowTotal = (a: Account) => Object.values(a.flowByAge).reduce((s, v) => s + v, 0);

export function compareSnapshots(x: Snapshot, y: Snapshot): SnapshotComparison {
  const [older, newer] = x.asOf <= y.asOf ? [x, y] : [y, x];
  const self = (s: Snapshot) => s.accounts.filter((a) => a.owner === "self");
  const olds = self(older);
  const news = self(newer);
  const oldByKey = new Map(olds.map((a) => [keyOf(a), a]));
  const newByKey = new Map(news.map((a) => [keyOf(a), a]));

  const accounts: AccountChange[] = [];
  for (const n of news) {
    const o = oldByKey.get(keyOf(n));
    accounts.push({
      kind: n.kind,
      institution: n.institution,
      product: n.product,
      status: o ? "both" : "added",
      balanceDiff: o && o.balance !== undefined && n.balance !== undefined ? n.balance - o.balance : undefined,
      totalFlowDiff: flowTotal(n) - (o ? flowTotal(o) : 0),
    });
  }
  for (const o of olds) {
    if (!newByKey.has(keyOf(o))) accounts.push({ kind: o.kind, institution: o.institution, product: o.product, status: "removed", totalFlowDiff: -flowTotal(o) });
  }

  // 국민연금은 상품명이 해마다 조금 달라질 수 있어 종류로 찾는다
  const npsOld = olds.find((a) => a.kind === "national")?.monthlyAmount;
  const npsNew = news.find((a) => a.kind === "national")?.monthlyAmount;
  const days = (Date.parse(newer.asOf) - Date.parse(older.asOf)) / 86_400_000;

  return {
    fromAsOf: older.asOf,
    toAsOf: newer.asOf,
    years: Math.round((days / 365.25) * 10) / 10,
    totalFlowDiff: news.reduce((s, a) => s + flowTotal(a), 0) - olds.reduce((s, a) => s + flowTotal(a), 0),
    balanceDiff: news.reduce((s, a) => s + (a.balance ?? 0), 0) - olds.reduce((s, a) => s + (a.balance ?? 0), 0),
    npsMonthlyDiff: npsOld !== undefined && npsNew !== undefined ? npsNew - npsOld : undefined,
    accounts,
  };
}
