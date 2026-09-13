/**
 * 화면 사이에 공유하는 가정 변경분 (2026-09-13 사용자 결정 — 세션 단위 공유).
 * 대시보드에서 바꾼 가정을 목표·가처분 화면도 같이 쓴다. 조회기준일이 다른 스냅샷에는 적용하지 않는다.
 */
import type { Assumptions } from "@/src/engine/model";

export const ASSUMPTIONS_KEY = "mpp.assumptions.v1";

export interface SavedAssumptions {
  asOf: string;
  overrides: Partial<Assumptions>;
}

const listeners = new Set<() => void>();
let lastRaw: string | null = null;
let lastParsed: SavedAssumptions | undefined;

export function subscribeAssumptions(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 렌더 중에 불린다 — 원문이 같으면 같은 참조를 돌려준다 */
export function readSavedAssumptions(): SavedAssumptions | undefined {
  let raw: string | null;
  try {
    raw = typeof localStorage === "undefined" ? null : localStorage.getItem(ASSUMPTIONS_KEY);
  } catch {
    raw = null;
  }
  if (raw === lastRaw) return lastParsed;
  lastRaw = raw;
  try {
    const v = raw ? (JSON.parse(raw) as SavedAssumptions) : undefined;
    lastParsed = v && typeof v.asOf === "string" && typeof v.overrides === "object" ? v : undefined;
  } catch {
    lastParsed = undefined;
  }
  return lastParsed;
}

export function readServerAssumptions(): SavedAssumptions | undefined {
  return undefined;
}

export function writeAssumptionOverrides(asOf: string, overrides: Partial<Assumptions> | undefined): void {
  try {
    if (overrides === undefined) localStorage.removeItem(ASSUMPTIONS_KEY);
    else localStorage.setItem(ASSUMPTIONS_KEY, JSON.stringify({ asOf, overrides }));
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 유지되지 않는다 — 계산은 기본 가정으로 계속한다
  }
  for (const l of listeners) l();
}
