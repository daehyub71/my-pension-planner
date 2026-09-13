/** F11 — 시나리오 저장소. 대시보드의 「시나리오로 저장」과 시나리오 화면의 편집 패널이 쓴다. */
import type { Assumptions, Scenario } from "@/src/engine/model";
import type { KeyValueStorage } from "./snapshots";

export const SCENARIO_KEY = "mpp.scenarios.v1";

function storageOf(s?: KeyValueStorage): KeyValueStorage {
  if (s) return s;
  if (typeof localStorage === "undefined") throw new Error("localStorage 를 쓸 수 없다");
  return localStorage;
}

export function loadScenarios(storage?: KeyValueStorage): Scenario[] {
  const raw = storageOf(storage).getItem(SCENARIO_KEY);
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s): s is Scenario => typeof s === "object" && s !== null && typeof (s as Scenario).id === "string" && typeof (s as Scenario).name === "string");
  } catch {
    return [];
  }
}

export function saveScenario(name: string, assumptions: Assumptions, storage?: KeyValueStorage): Scenario[] {
  const st = storageOf(storage);
  const list = loadScenarios(st);
  const scenario: Scenario = { id: `s-${Date.now()}-${list.length}`, name, assumptions, createdAt: new Date().toISOString() };
  const next = [...list, scenario];
  st.setItem(SCENARIO_KEY, JSON.stringify(next));
  return next;
}

export function deleteScenario(id: string, storage?: KeyValueStorage): Scenario[] {
  const st = storageOf(storage);
  const next = loadScenarios(st).filter((s) => s.id !== id);
  st.setItem(SCENARIO_KEY, JSON.stringify(next));
  return next;
}

export function updateScenario(id: string, patch: Partial<Pick<Scenario, "name" | "assumptions">>, storage?: KeyValueStorage): Scenario[] {
  const st = storageOf(storage);
  const next = loadScenarios(st).map((s) => (s.id === id ? { ...s, ...patch } : s));
  st.setItem(SCENARIO_KEY, JSON.stringify(next));
  return next;
}

export function duplicateScenario(id: string, storage?: KeyValueStorage): Scenario[] {
  const st = storageOf(storage);
  const source = loadScenarios(st).find((s) => s.id === id);
  if (!source) return loadScenarios(st);
  return saveScenario(`${source.name} 사본`, source.assumptions, st);
}
