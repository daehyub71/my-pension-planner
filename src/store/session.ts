/** 화면들이 공유하는 스냅샷 저장소. localStorage 를 외부 저장소로 보고 구독한다. */
import type { Snapshot } from "@/src/engine/model";
import { currentSnapshot, loadSnapshots, saveSnapshot } from "./snapshots";

let cache: Snapshot | undefined;
let list: Snapshot[] = [];
let loaded = false;
const EMPTY: Snapshot[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribeSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 렌더 중에 불린다 — 같은 값이면 같은 참조를 돌려줘야 무한 렌더가 안 난다. */
export function readSession(): Snapshot | undefined {
  if (!loaded) {
    try {
      list = loadSnapshots();
      cache = currentSnapshot();
    } catch {
      list = EMPTY;
      cache = undefined;
    }
    loaded = true;
  }
  return cache;
}

/** 프리렌더(정적 export) 때는 브라우저 저장소가 없다. */
export function readServerSession(): Snapshot | undefined {
  return undefined;
}

/** 저장된 스냅샷 목록. 렌더 중 호출되므로 참조가 안정적이어야 한다. */
export function readSnapshotList(): Snapshot[] {
  readSession();
  return list;
}

export function readServerSnapshotList(): Snapshot[] {
  return EMPTY;
}

export function writeSession(s: Snapshot): void {
  list = saveSnapshot(s);
  cache = s;
  loaded = true;
  emit();
}

export function refreshSession(): void {
  loaded = false;
  emit();
}
