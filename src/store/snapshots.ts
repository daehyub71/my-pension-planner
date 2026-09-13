/** F18 — 스냅샷 저장. localStorage 에만 쓴다 (SPEC N1). 상한 20개 (PLAN 리스크 7). */
import type { Snapshot } from "@/src/engine/model";

export const SNAPSHOT_KEY = "mpp.snapshots.v1";
export const SNAPSHOT_LIMIT = 20;

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageOf(s?: KeyValueStorage): KeyValueStorage {
  if (s) return s;
  if (typeof localStorage === "undefined") throw new Error("localStorage 를 쓸 수 없다");
  return localStorage;
}

export function parseSnapshotJson(text: string): Snapshot {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("JSON 이 아니다");
  }
  if (typeof obj !== "object" || obj === null) throw new Error("스냅샷 객체가 아니다");
  const s = obj as Partial<Snapshot>;
  if (typeof s.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.asOf)) throw new Error("asOf(YYYY-MM-DD) 가 없다");
  if (!Array.isArray(s.accounts)) throw new Error("accounts 가 없다");
  if (typeof s.inputs !== "object" || s.inputs === null) throw new Error("inputs 가 없다");
  if (typeof s.rulesVersion !== "string") throw new Error("rulesVersion 이 없다");
  for (const a of s.accounts) {
    if (typeof a !== "object" || a === null || typeof (a as { id?: unknown }).id !== "string" || typeof (a as { flowByAge?: unknown }).flowByAge !== "object")
      throw new Error("계좌 모양이 틀렸다");
  }
  return { asOf: s.asOf, accounts: s.accounts, inputs: s.inputs, rulesVersion: s.rulesVersion, warnings: Array.isArray(s.warnings) ? s.warnings : [] };
}

export function serializeSnapshot(s: Snapshot): string {
  return JSON.stringify(s, null, 2);
}

/** 저장된 스냅샷 전부, asOf 내림차순 */
export function loadSnapshots(storage?: KeyValueStorage): Snapshot[] {
  const raw = storageOf(storage).getItem(SNAPSHOT_KEY);
  if (!raw) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  const out: Snapshot[] = [];
  for (const item of arr) {
    try {
      out.push(parseSnapshotJson(JSON.stringify(item)));
    } catch {
      // 깨진 항목은 버린다 — 나머지를 살린다
    }
  }
  return out.sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0));
}

/** 같은 asOf 는 덮어쓴다. 상한을 넘으면 가장 오래된 것부터 지운다 */
export function saveSnapshot(snapshot: Snapshot, storage?: KeyValueStorage): Snapshot[] {
  const st = storageOf(storage);
  const rest = loadSnapshots(st).filter((s) => s.asOf !== snapshot.asOf);
  const next = [snapshot, ...rest].sort((a, b) => (a.asOf < b.asOf ? 1 : a.asOf > b.asOf ? -1 : 0)).slice(0, SNAPSHOT_LIMIT);
  st.setItem(SNAPSHOT_KEY, JSON.stringify(next));
  return next;
}

export function deleteSnapshot(asOf: string, storage?: KeyValueStorage): Snapshot[] {
  const st = storageOf(storage);
  const next = loadSnapshots(st).filter((s) => s.asOf !== asOf);
  st.setItem(SNAPSHOT_KEY, JSON.stringify(next));
  return next;
}

export function clearSnapshots(storage?: KeyValueStorage): void {
  storageOf(storage).removeItem(SNAPSHOT_KEY);
}

export function currentSnapshot(storage?: KeyValueStorage): Snapshot | undefined {
  return loadSnapshots(storage)[0];
}
