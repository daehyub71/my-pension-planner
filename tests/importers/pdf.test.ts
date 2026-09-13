// @vitest-environment node
import { REAL, hasRealExpected } from "../private.helper";
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const PRIVATE_DIR = join(__dirname, "..", "..", "data", "private");
const privatePdf = existsSync(PRIVATE_DIR) ? readdirSync(PRIVATE_DIR).find((f) => /\.pdf$/.test(f)) : undefined;

describe("F2 parseContractItems — 합성 K씨 텍스트 조각", () => {
  const parsed = parseContractItems(items as TextItem[]);

  it("국민연금 예상 월액과 개시년도를 읽는다", () => {
    expect(parsed.national).toEqual({ monthlyAmount: 1350000, startYear: 2033 });
  });

  it("퇴직·개인 계좌 4건을 재조립한다 — 줄바꿈으로 쪼개진 숫자·날짜·기관명", () => {
    expect(parsed.accounts).toHaveLength(4);
    const [dc, irp, sav, ins] = parsed.accounts;
    expect(dc).toMatchObject({ kind: "dc", institution: "가나증권", joinDate: "2022-05-10", startDate: "2028-07-20", balance: 150000000, asOf: "2026-08-31" });
    expect(irp).toMatchObject({ kind: "irp", institution: "가나증권", balance: 40000000 });
    expect(sav).toMatchObject({ kind: "savings", institution: "다라자산운용", joinDate: "2010-01-26", balance: 120000000 });
    expect(ins).toMatchObject({ kind: "insurance", institution: "마바생명보험", joinDate: "2003-05-20", balance: 30000000 });
  });

  it("페이지 경계에서 잘린 셀 조각을 앞 행에 이어 붙인다", () => {
    expect(parsed.accounts[2]?.product.replace(/\s/g, "")).toBe("다라평생연금저축");
    expect(parsed.accounts[3]?.product.replace(/\s/g, "")).toBe("마바연금보험");
  });

  it("페이지 장식(이동경로)은 셀 조각으로 오인하지 않는다 — 열 x 가 어긋난다", () => {
    for (const a of parsed.accounts) {
      expect(a.institution).not.toMatch(/홈|내연금조회/);
      expect(a.productType).not.toMatch(/홈|내연금조회/);
      expect(a.product).not.toMatch(/홈|내연금조회/);
    }
    expect(parsed.accounts[2]?.institution).toBe("다라자산운용");
    expect(parsed.accounts[2]?.productType).toBe("연금저축펀드");
  });

  it("DB 껍데기(퇴직금정보 미입력)는 계좌가 아니라 경고다", () => {
    expect(parsed.dbShells).toBe(1);
    expect(parsed.warnings.some((w) => w.code === "db-shell")).toBe(true);
  });

  it("조회기준일을 뽑는다", () => {
    expect(parsed.asOf).toBe("2026-08-31");
  });

  it("표가 하나도 없으면 빈 결과 + 경고", () => {
    const r = parseContractItems([{ str: "아무 문서", x: 10, y: 10, page: 1 }]);
    expect(r.accounts).toEqual([]);
    expect(r.national).toBeUndefined();
    expect(r.warnings.some((w) => w.code === "pdf-unmatched")).toBe(true);
  });
});

describe.skipIf(!privatePdf || !hasRealExpected)("F2 — 실데이터 PDF (로컬에만 있음, 기대값은 data/private/expected-real.json)", () => {
  it("국민연금 월액 · 계좌별 적립금 · DB 껍데기 · 조회기준일", async () => {
    const { extractTextItems } = await import("@/src/importers/pdf");
    const data = new Uint8Array(readFileSync(join(PRIVATE_DIR, privatePdf!)));
    const parsed = parseContractItems(await extractTextItems(data));
    const e = REAL.pdf;
    expect(parsed.national).toEqual(e.national);
    expect(parsed.accounts.map((a) => [a.kind, a.balance])).toEqual(e.balances);
    expect(parsed.accounts[0]?.joinDate).toBe(e.dcJoinDate);
    expect(parsed.accounts[0]?.startDate).toBe(e.dcStartDate);
    expect(parsed.accounts[2]?.product.replace(/\s/g, "")).toBe(e.savingsProductCompact);
    expect(parsed.dbShells).toBe(e.dbShells);
    expect(parsed.asOf).toBe(e.asOf);
  });
});
