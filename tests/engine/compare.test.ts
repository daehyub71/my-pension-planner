import { describe, it, expect } from "vitest";
import { compareSnapshots } from "@/src/engine/compare";
import type { Account, Snapshot } from "@/src/engine/model";

function acc(over: Partial<Account> & Pick<Account, "id" | "kind">): Account {
  return { owner: "self", institution: "가나", product: "상품", startDate: "2030-01", flowByAge: {}, ...over };
}
function snap(asOf: string, accounts: Account[]): Snapshot {
  return { asOf, accounts, inputs: { birthYearMonth: "1970-01", retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: "kr-2026", warnings: [] };
}

describe("F18 스냅샷 연도 비교 — 「작년 대비 +N」", () => {
  const older = snap("2025-08-31", [
    acc({ id: "n", kind: "national", institution: "국민연금", product: "노령연금", monthlyAmount: 1_700_000, flowByAge: { 65: 10_000, 66: 20_000 } }),
    acc({ id: "d", kind: "dc", balance: 100_000_000, flowByAge: { 60: 5_000 } }),
    acc({ id: "f", kind: "savings", owner: "family", balance: 10_000_000, flowByAge: { 60: 1_000 } }),
  ]);
  const newer = snap("2026-08-31", [
    acc({ id: "n2", kind: "national", institution: "국민연금", product: "노령연금", monthlyAmount: 1_800_000, flowByAge: { 65: 11_000, 66: 21_000 } }),
    acc({ id: "d2", kind: "dc", balance: 120_000_000, flowByAge: { 60: 6_000 } }),
    acc({ id: "s2", kind: "irp", institution: "다라", product: "새 IRP", balance: 5_000_000, flowByAge: { 60: 500 } }),
  ]);

  it("기간·합계 수령액·적립금·국민연금 월액 차이 (본인 계좌만)", () => {
    const c = compareSnapshots(older, newer);
    expect(c).toMatchObject({ fromAsOf: "2025-08-31", toAsOf: "2026-08-31", years: 1 });
    expect(c.totalFlowDiff).toBe(11_000 + 21_000 + 6_000 + 500 - (10_000 + 20_000 + 5_000));
    expect(c.balanceDiff).toBe(120_000_000 + 5_000_000 - 100_000_000);
    expect(c.npsMonthlyDiff).toBe(100_000);
  });

  it("계좌를 기관·종류·상품으로 짝짓고, 새로 생긴 계좌를 따로 표시한다", () => {
    const c = compareSnapshots(older, newer);
    expect(c.accounts.find((a) => a.kind === "dc")).toMatchObject({ status: "both", balanceDiff: 20_000_000 });
    expect(c.accounts.find((a) => a.kind === "irp")).toMatchObject({ status: "added" });
  });

  it("순서를 거꾸로 줘도 옛것 → 새것으로 비교한다", () => {
    expect(compareSnapshots(newer, older).fromAsOf).toBe("2025-08-31");
  });
});
