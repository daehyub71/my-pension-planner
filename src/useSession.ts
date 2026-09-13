"use client";
/** 화면이 공유하는 상태 — 현재 스냅샷과 가정. 저장은 localStorage 뿐이다 (SPEC N1). */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Assumptions, Snapshot } from "@/src/engine/model";
import { readSession, readServerSession, subscribeSession, writeSession } from "@/src/store/session";
import { readSavedAssumptions, readServerAssumptions, subscribeAssumptions, writeAssumptionOverrides } from "@/src/store/assumptions";
import { defaultContext, portalAssumptions, simulate } from "@/src/engine";
import { RULES } from "@/src/rules/loader";
import { DEMO_SNAPSHOT } from "@/src/demo";

/**
 * 현재 스냅샷. 저장된 것이 없으면 합성 K씨 데모로 채운다 (F19) — demo 가 true 면 화면에 「데모」 뱃지.
 * 데모에서 입력을 고쳐 저장하면 사용자 스냅샷이 되므로 demo 표시를 뗀다.
 */
export function useSnapshot(): { snapshot?: Snapshot; store: (s: Snapshot) => void; demo: boolean } {
  const stored = useSyncExternalStore(subscribeSession, readSession, readServerSession);
  const snapshot = stored ?? DEMO_SNAPSHOT;
  const store = useCallback((s: Snapshot) => writeSession(s.demo ? { ...s, demo: undefined } : s), []);
  return { snapshot, store, demo: snapshot.demo === true };
}

export interface Simulation {
  base?: Assumptions;
  assumptions?: Assumptions;
  setAssumptions: (a: Assumptions) => void;
  reset: () => void;
  result?: ReturnType<typeof simulate>;
  dirty: boolean;
  ctx?: ReturnType<typeof defaultContext>;
  selfAccounts: Snapshot["accounts"];
}

/**
 * 스냅샷에서 「포털 가정」을 만들고, 사용자가 바꾼 값만 덮어쓴다.
 * 덮어쓰기를 따로 두는 이유: 기준이 바뀔 때 상태를 이펙트로 동기화하지 않아도 된다.
 * 덮어쓰기는 localStorage 에 두어 화면끼리 공유한다 (2026-09-13). 조회기준일이 같을 때만 쓴다.
 */
export function useSimulation(snapshot?: Snapshot): Simulation {
  const saved = useSyncExternalStore(subscribeAssumptions, readSavedAssumptions, readServerAssumptions);
  const overrides = snapshot && saved?.asOf === snapshot.asOf ? saved.overrides : undefined;
  const asOf = snapshot?.asOf;
  const selfAccounts = useMemo(() => (snapshot ? snapshot.accounts.filter((a) => a.owner === "self") : []), [snapshot]);
  const ctx = useMemo(
    () => (snapshot ? defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, snapshot.inputs.retireAge, snapshot.inputs.lifeExpectancy) : undefined),
    [snapshot],
  );
  const base = useMemo(() => (snapshot && ctx ? portalAssumptions(selfAccounts, ctx) : undefined), [snapshot, ctx, selfAccounts]);
  const assumptions = useMemo(() => (base ? { ...base, ...overrides } : undefined), [base, overrides]);
  const result = useMemo(() => (snapshot && assumptions ? simulate(snapshot, assumptions, RULES) : undefined), [snapshot, assumptions]);
  const dirty = useMemo(() => (base && assumptions ? JSON.stringify(assumptions) !== JSON.stringify(base) : false), [assumptions, base]);
  return {
    base,
    assumptions,
    setAssumptions: useCallback((a: Assumptions) => asOf && writeAssumptionOverrides(asOf, a), [asOf]),
    reset: useCallback(() => asOf && writeAssumptionOverrides(asOf, undefined), [asOf]),
    result,
    dirty,
    ctx,
    selfAccounts,
  };
}
