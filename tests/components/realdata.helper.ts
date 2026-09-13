/** 실데이터가 있으면 그것으로, 없으면 합성 K씨로 스냅샷을 만든다. 화면 테스트가 공유한다. */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@/src/engine/model";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { buildSnapshot } from "@/src/importers/normalize";
import { RULES } from "@/src/rules/loader";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

const PRIVATE_DIR = join(__dirname, "..", "..", "data", "private");
const privateXlsx = existsSync(PRIVATE_DIR) ? readdirSync(PRIVATE_DIR).find((f) => /^100lifeplan_.*\.xlsx$/.test(f)) : undefined;

export const hasRealData = Boolean(privateXlsx);

/** 실데이터 엑셀 + (합성 PDF 대신) 손으로 넣은 적립금 — PDF 는 브라우저 전용 코드라 여기서는 엑셀만 쓴다 */
export function makeSnapshot(retireAge = 55): Snapshot {
  if (privateXlsx) {
    const excel = parsePortalExcel(readFileSync(join(PRIVATE_DIR, privateXlsx)));
    return buildSnapshot({ excel, inputs: { retireAge, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: RULES.version, today: "2026-08-31" });
  }
  const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
  const pdf = parseContractItems(items as TextItem[]);
  return buildSnapshot({ excel, pdf, inputs: { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 90 }, rulesVersion: RULES.version });
}
