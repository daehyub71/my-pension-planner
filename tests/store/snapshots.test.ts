import { describe, it, expect, beforeEach } from "vitest";
import type { Snapshot } from "@/src/engine/model";
import { loadSnapshots, saveSnapshot, deleteSnapshot, clearSnapshots, parseSnapshotJson, serializeSnapshot, currentSnapshot, SNAPSHOT_LIMIT, type KeyValueStorage } from "@/src/store/snapshots";

function fakeStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

function snap(asOf: string): Snapshot {
  return {
    asOf,
    accounts: [{ id: "national-1", kind: "national", owner: "self", institution: "국민연금", product: "노령연금", startDate: "2033-08", flowByAge: { 65: 6750 } }],
    inputs: { birthYearMonth: "1968-07", retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 95 },
    rulesVersion: "kr-2026",
    warnings: [],
  };
}

describe("F18 snapshots store", () => {
  let st: KeyValueStorage;
  beforeEach(() => {
    st = fakeStorage();
  });

  it("비어 있으면 빈 배열", () => {
    expect(loadSnapshots(st)).toEqual([]);
    expect(currentSnapshot(st)).toBeUndefined();
  });

  it("저장·조회·삭제, 최신이 앞", () => {
    saveSnapshot(snap("2025-08-31"), st);
    saveSnapshot(snap("2026-08-31"), st);
    expect(loadSnapshots(st).map((s) => s.asOf)).toEqual(["2026-08-31", "2025-08-31"]);
    expect(currentSnapshot(st)?.asOf).toBe("2026-08-31");
    deleteSnapshot("2026-08-31", st);
    expect(loadSnapshots(st).map((s) => s.asOf)).toEqual(["2025-08-31"]);
    clearSnapshots(st);
    expect(loadSnapshots(st)).toEqual([]);
  });

  it("같은 asOf 는 덮어쓴다", () => {
    saveSnapshot(snap("2026-08-31"), st);
    const s2 = snap("2026-08-31");
    s2.inputs.retireAge = 62;
    saveSnapshot(s2, st);
    expect(loadSnapshots(st)).toHaveLength(1);
    expect(loadSnapshots(st)[0]?.inputs.retireAge).toBe(62);
  });

  it("상한을 넘으면 가장 오래된 것부터 지운다", () => {
    for (let i = 0; i < SNAPSHOT_LIMIT + 3; i++) saveSnapshot(snap(`2000-01-${String(i + 1).padStart(2, "0")}`), st);
    const all = loadSnapshots(st);
    expect(all).toHaveLength(SNAPSHOT_LIMIT);
    expect(all.at(-1)?.asOf).toBe("2000-01-04");
  });

  it("JSON 내보내기 → 가져오기 왕복", () => {
    const s = snap("2026-08-31");
    expect(parseSnapshotJson(serializeSnapshot(s))).toEqual(s);
  });

  it("모양이 틀린 JSON 은 거부한다", () => {
    expect(() => parseSnapshotJson("nope")).toThrow(/JSON/);
    expect(() => parseSnapshotJson(JSON.stringify({ asOf: "2026-08-31" }))).toThrow(/accounts/);
    expect(() => parseSnapshotJson(JSON.stringify({ ...snap("2026-08-31"), accounts: [{ nope: 1 }] }))).toThrow(/계좌/);
  });

  it("저장소의 깨진 항목은 버리고 나머지를 살린다", () => {
    st.setItem("mpp.snapshots.v1", JSON.stringify([snap("2026-08-31"), { garbage: true }]));
    expect(loadSnapshots(st)).toHaveLength(1);
  });
});
