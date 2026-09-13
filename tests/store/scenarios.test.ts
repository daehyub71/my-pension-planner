import { describe, it, expect } from "vitest";
import { loadScenarios, saveScenario, updateScenario, duplicateScenario, deleteScenario } from "@/src/store/scenarios";
import type { Assumptions } from "@/src/engine/model";
import type { KeyValueStorage } from "@/src/store/snapshots";

function memory(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}
const A: Assumptions = { inflation: 0.031, returnByKind: {}, npsStartAge: 65, privateStart: {} };

describe("M4-1 시나리오 저장소 — 저장·수정·복제·삭제", () => {
  it("수정은 이름·가정을 바꾸고 id 는 그대로", () => {
    const st = memory();
    const [s] = saveScenario("연기", A, st);
    const next = updateScenario(s!.id, { name: "연기 68세", assumptions: { ...A, npsStartAge: 68 } }, st);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: s!.id, name: "연기 68세" });
    expect(loadScenarios(st)[0]!.assumptions.npsStartAge).toBe(68);
  });

  it("복제는 「사본」을 붙여 뒤에 추가한다", () => {
    const st = memory();
    const [s] = saveScenario("조기", A, st);
    const next = duplicateScenario(s!.id, st);
    expect(next.map((x) => x.name)).toEqual(["조기", "조기 사본"]);
    expect(next[1]!.id).not.toBe(s!.id);
    expect(deleteScenario(next[1]!.id, st)).toHaveLength(1);
  });
});
