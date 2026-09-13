/** F2 폴백 — PDF 파싱이 실패했을 때 계좌 4~5개의 적립금·가입일·조회기준일을 손으로 넣는다. */
import type { Account } from "@/src/engine/model";

export interface ManualContractEntry {
  accountId: string;
  balance?: number; // 원
  joinDate?: string; // YYYY-MM-DD
  asOf?: string; // YYYY-MM-DD
  monthlyAmount?: number; // 국민연금 월액(원)
}

export function applyManualContract(accounts: Account[], entries: ManualContractEntry[]): Account[] {
  const out = accounts.map((a) => ({ ...a, flowByAge: { ...a.flowByAge } }));
  for (const e of entries) {
    const a = out.find((x) => x.id === e.accountId);
    if (!a) throw new Error(`없는 계좌 id: ${e.accountId}`);
    if (e.balance !== undefined) a.balance = e.balance;
    if (e.joinDate) a.joinDate = e.joinDate;
    if (e.asOf) a.asOf = e.asOf;
    if (e.monthlyAmount !== undefined) a.monthlyAmount = e.monthlyAmount;
  }
  return out;
}
