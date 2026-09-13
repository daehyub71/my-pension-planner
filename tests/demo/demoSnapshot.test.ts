// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RULES } from "@/src/rules/loader";
import { parsePortalExcel } from "@/src/importers/xlsx";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import { buildSnapshot } from "@/src/importers/normalize";
import items from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";
import { DEMO_INPUTS, DEMO_SNAPSHOT } from "@/src/demo";

const JSON_PATH = join(__dirname, "..", "..", "src", "demo", "demo-k.snapshot.json");

/** F19 — 데모 스냅샷은 합성 픽스처에서 만든다. 픽스처가 바뀌면 이 테스트가 JSON 을 다시 쓰라고 알린다 (UPDATE_DEMO=1) */
describe("F19 데모 K씨 스냅샷", () => {
  const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
  const built = { ...buildSnapshot({ excel, pdf: parseContractItems(items as TextItem[]), inputs: DEMO_INPUTS, rulesVersion: RULES.version }), demo: true };

  it("번들된 JSON 이 픽스처에서 만든 것과 같다", () => {
    if (process.env.UPDATE_DEMO) writeFileSync(JSON_PATH, JSON.stringify(built, null, 2) + "\n");
    expect(JSON.parse(readFileSync(JSON_PATH, "utf8"))).toEqual(built);
    expect(DEMO_SNAPSHOT.demo).toBe(true);
  });

  it("실데이터가 아니다 — 합성 K씨 (1968-07생)", () => {
    expect(DEMO_SNAPSHOT.inputs.birthYearMonth).toBe("1968-07");
  });
});
