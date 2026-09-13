import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSimulation } from "@/src/useSession";
import { makeSnapshot } from "./realdata.helper";

const snapshot = makeSnapshot(55);

describe("useSimulation — 한 화면에서 바꾼 가정이 다른 화면에도 보인다", () => {
  beforeEach(() => localStorage.clear());

  it("대시보드가 바꾼 국민연금 개시 나이를 목표 화면의 훅도 받는다", () => {
    const dashboard = renderHook(() => useSimulation(snapshot));
    const goal = renderHook(() => useSimulation(snapshot));
    act(() => dashboard.result.current.setAssumptions({ ...dashboard.result.current.assumptions!, npsStartAge: 68 }));
    goal.rerender();
    expect(goal.result.current.assumptions!.npsStartAge).toBe(68);
    expect(goal.result.current.dirty).toBe(true);
    act(() => goal.result.current.reset());
    dashboard.rerender();
    expect(dashboard.result.current.dirty).toBe(false);
  });

  it("다른 조회기준일의 스냅샷에는 남은 가정을 쓰지 않는다", () => {
    const first = renderHook(() => useSimulation(snapshot));
    act(() => first.result.current.setAssumptions({ ...first.result.current.assumptions!, inflation: 0.05 }));
    const other = renderHook(() => useSimulation({ ...snapshot, asOf: "2025-12-31" }));
    expect(other.result.current.dirty).toBe(false);
  });
});
