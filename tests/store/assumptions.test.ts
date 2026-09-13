import { describe, it, expect, beforeEach } from "vitest";
import { readSavedAssumptions, writeAssumptionOverrides, ASSUMPTIONS_KEY } from "@/src/store/assumptions";

describe("가정 공유 — 화면 사이에 세션 단위로 (2026-09-13 사용자 결정)", () => {
  beforeEach(() => localStorage.clear());

  it("쓴 가정을 조회기준일과 함께 읽는다", () => {
    writeAssumptionOverrides("2026-08-31", { npsStartAge: 68 });
    expect(readSavedAssumptions()).toEqual({ asOf: "2026-08-31", overrides: { npsStartAge: 68 } });
    expect(JSON.parse(localStorage.getItem(ASSUMPTIONS_KEY)!).asOf).toBe("2026-08-31");
  });

  it("바뀌지 않았으면 같은 참조를 돌려준다 — useSyncExternalStore 무한 렌더 방지", () => {
    writeAssumptionOverrides("2026-08-31", { inflation: 0.02 });
    expect(readSavedAssumptions()).toBe(readSavedAssumptions());
  });

  it("되돌리면 지운다", () => {
    writeAssumptionOverrides("2026-08-31", { inflation: 0.02 });
    writeAssumptionOverrides("2026-08-31", undefined);
    expect(readSavedAssumptions()).toBeUndefined();
  });
});
