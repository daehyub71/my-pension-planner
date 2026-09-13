import { REAL, hasRealExpected } from "../private.helper";
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import { parsePortalExcel } from "@/src/importers/xlsx";
import expected from "@/tests/fixtures/demo-k/expected.json";

const FIXTURE = join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx");
const PRIVATE_DIR = join(__dirname, "..", "..", "data", "private");
const privateXlsx = existsSync(PRIVATE_DIR) ? readdirSync(PRIVATE_DIR).find((f) => /^100lifeplan_.*\.xlsx$/.test(f)) : undefined;

describe("F1 parsePortalExcel — 합성 K씨 (inlineStr 실물 형식)", () => {
  const parsed = parsePortalExcel(readFileSync(FIXTURE));

  it("생년월을 row 1 에서 읽는다", () => {
    expect(parsed.birthYearMonth).toBe(expected.birthYearMonth);
  });

  it("상품 1행 = 계좌 1개, 합계 행은 계좌가 아니다", () => {
    expect(parsed.accounts).toHaveLength(expected.accountCount);
    expect(parsed.accounts.filter((a) => a.owner === "self")).toHaveLength(expected.selfCount);
    expect(parsed.accounts.filter((a) => a.owner === "family")).toHaveLength(expected.familyCount);
  });

  it("숨김 A열 유형코드를 읽고 상품명으로 세분한다", () => {
    expect(parsed.accounts.map((a) => a.kind)).toEqual(["national", "dc", "irp", "savings", "insurance", "national"]);
  });

  it("기관명의 전각공백 패딩을 지운다", () => {
    for (const a of parsed.accounts) {
      expect(a.institution).not.toMatch(/　/);
      expect(a.institution).toBe(a.institution.trim());
    }
    expect(parsed.accounts[0]?.institution).toBe("국민연금");
  });

  it("개시 시점 두 형식을 YYYY-MM 으로 — 월이 없으면 01 + 경고", () => {
    expect(parsed.accounts[0]?.startDate).toBe("2033-08");
    expect(parsed.accounts[1]?.startDate).toBe("2028-01");
    const w = parsed.warnings.filter((x) => x.code === "start-month-missing");
    expect(w.map((x) => x.accountId)).toContain(parsed.accounts[1]?.id);
  });

  it("연령별 흐름(천원)을 그대로 옮긴다 — 국민연금 65세는 5개월치", () => {
    const nps = parsed.accounts[0]!;
    expect(nps.flowByAge[64]).toBe(0);
    expect(nps.flowByAge[65]).toBe(6750);
    expect(nps.flowByAge[66]).toBe(Math.round(1350 * 12 * 1.031));
    expect(Object.keys(nps.flowByAge)).toHaveLength(36);
  });

  it("계좌 소계와 합계 행이 기대값과 일치한다", () => {
    parsed.accounts.forEach((a, i) => {
      const sub = Object.values(a.flowByAge).reduce((s, v) => s + v, 0);
      expect(sub).toBe(expected.accounts[i]!.subtotal);
    });
    expect(parsed.totalByAge).toEqual(Object.fromEntries(Object.entries(expected.totalByAge).map(([k, v]) => [Number(k), v])));
  });

  it("가족 행은 받아들이되 알려 준다", () => {
    expect(parsed.warnings.some((w) => w.code === "family-row")).toBe(true);
  });
});

describe("F1 parsePortalExcel — 검증 실패", () => {
  it("상품 합과 합계 행이 다르면 임포트를 거부한다", () => {
    const wb = XLSX.read(readFileSync(FIXTURE), { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    ws["F3"] = { t: "n", v: 999 }; // 국민연금 55세를 손댄다
    const tampered = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => parsePortalExcel(tampered)).toThrow(/합계/);
  });

  it("헤더(연령) 행이 없으면 거부한다", () => {
    const ws = XLSX.utils.aoa_to_sheet([["a", "b"], [1, 2]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "x");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    expect(() => parsePortalExcel(buf)).toThrow(/연령/);
  });
});

describe.skipIf(!privateXlsx || !hasRealExpected)("F1 parsePortalExcel — 실데이터 (로컬에만 있음, 기대값은 data/private/expected-real.json)", () => {
  it("계좌 구성 · 합계 · 국민연금 첫해 값", () => {
    const parsed = parsePortalExcel(readFileSync(join(PRIVATE_DIR, privateXlsx!)));
    const e = REAL.xlsx;
    expect(parsed.birthYearMonth).toBe(e.birthYearMonth);
    expect(parsed.accounts).toHaveLength(e.accountCount);
    expect(parsed.accounts.map((a) => a.kind)).toEqual(e.kinds);
    expect(parsed.accounts[0]?.flowByAge[65]).toBe(e.nationalFlow65);
    expect(parsed.accounts[0]?.startDate).toBe(e.nationalStart);
    expect(parsed.accounts[1]?.institution).toBe(e.dcInstitution);
    const grand = Object.values(parsed.totalByAge).reduce((s, v) => s + v, 0);
    expect(grand).toBe(e.grandTotal);
  });
});
