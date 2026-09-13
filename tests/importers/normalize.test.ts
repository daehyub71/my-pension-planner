import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { mergeContract, buildSnapshot } from "@/src/importers/normalize";
import { applyManualContract } from "@/src/importers/manual";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
const pdf = parseContractItems(items as TextItem[]);

describe("F2 mergeContract — 엑셀 계좌에 PDF 적립금·가입일을 붙인다", () => {
  const { accounts, warnings } = mergeContract(excel.accounts, pdf);

  it("기관·유형으로 짝을 맞춘다", () => {
    const dc = accounts.find((a) => a.kind === "dc")!;
    expect(dc.balance).toBe(150000000);
    expect(dc.joinDate).toBe("2022-05-10");
    expect(dc.asOf).toBe("2026-08-31");
    expect(accounts.find((a) => a.kind === "irp")?.balance).toBe(40000000);
    expect(accounts.find((a) => a.kind === "savings")?.balance).toBe(120000000);
    expect(accounts.find((a) => a.kind === "insurance")?.balance).toBe(30000000);
  });

  it("국민연금 월액을 앵커로 붙인다 (본인 행만)", () => {
    const nps = accounts.filter((a) => a.kind === "national");
    expect(nps.find((a) => a.owner === "self")?.monthlyAmount).toBe(1350000);
    expect(nps.find((a) => a.owner === "family")?.monthlyAmount).toBeUndefined();
  });

  it("엑셀 개시월은 지키고, PDF 는 확인만 한다", () => {
    expect(accounts.find((a) => a.kind === "dc")?.startDate).toBe("2028-01");
  });

  it("짝이 없는 PDF 계좌는 경고", () => {
    const extra = { ...pdf, accounts: [...pdf.accounts, { kind: "dc" as const, institution: "없는증권", productType: "DC", product: "x", balance: 1 }] };
    const r = mergeContract(excel.accounts, extra);
    expect(r.warnings.some((w) => w.code === "pdf-unmatched" && w.message.includes("없는증권"))).toBe(true);
  });

  it("DB 껍데기 경고를 넘긴다", () => {
    expect(warnings.some((w) => w.code === "db-shell")).toBe(true);
  });
});

describe("F2 applyManualContract — PDF 폴백 수동 입력", () => {
  it("계좌 id 로 적립금·가입일·조회기준일을 넣는다", () => {
    const dcId = excel.accounts.find((a) => a.kind === "dc")!.id;
    const out = applyManualContract(excel.accounts, [{ accountId: dcId, balance: 99, joinDate: "2020-01-01", asOf: "2026-08-31" }]);
    expect(out.find((a) => a.id === dcId)).toMatchObject({ balance: 99, joinDate: "2020-01-01", asOf: "2026-08-31" });
    expect(out.find((a) => a.kind === "irp")?.balance).toBeUndefined();
  });

  it("없는 id 는 예외", () => {
    expect(() => applyManualContract(excel.accounts, [{ accountId: "nope", balance: 1 }])).toThrow(/nope/);
  });
});

describe("buildSnapshot", () => {
  it("엑셀 + PDF + 입력 → Snapshot, asOf 는 PDF 조회기준일", () => {
    const s = buildSnapshot({ excel, pdf, inputs: { retireAge: 60, targetMonthlySpend: 300 }, rulesVersion: "kr-2026" });
    expect(s.asOf).toBe("2026-08-31");
    expect(s.inputs.birthYearMonth).toBe("1968-07");
    expect(s.inputs.lifeExpectancy).toBe(95);
    expect(s.accounts).toHaveLength(6);
    expect(s.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["start-month-missing", "family-row", "db-shell"]));
  });

  it("PDF 없이도 만들 수 있다 — asOf 는 오늘, 적립금은 비어 있다", () => {
    const s = buildSnapshot({ excel, inputs: { retireAge: 60, targetMonthlySpend: 300 }, rulesVersion: "kr-2026", today: "2026-09-09" });
    expect(s.asOf).toBe("2026-09-09");
    expect(s.accounts.every((a) => a.balance === undefined)).toBe(true);
  });

  it("입력이 틀리면 예외", () => {
    expect(() => buildSnapshot({ excel, inputs: { targetMonthlySpend: 300 }, rulesVersion: "kr-2026" })).toThrow(/은퇴|끊기는/);
  });
});

describe("연금계좌 분류 — 「연금저축」 명칭만 연금계좌다 (소득세법 시행령 제40조의2 ①)", () => {
  it("연금저축보험은 연금저축(savings), 일반연금보험은 보험(insurance)", async () => {
    const { kindOfProductType } = await import("@/src/importers/pdf");
    const { classifyKind } = await import("@/src/importers/xlsx");
    expect(kindOfProductType("연금저축보험")).toBe("savings");
    expect(kindOfProductType("일반연금보험")).toBe("insurance");
    expect(kindOfProductType("연금저축펀드")).toBe("savings");
    expect(classifyKind("1", "행복연금저축보험")).toBe("savings");
    expect(classifyKind("1", "마바연금보험")).toBe("insurance");
  });
});
