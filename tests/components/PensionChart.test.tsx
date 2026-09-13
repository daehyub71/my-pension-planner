import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PensionChart } from "@/components/PensionChart";
import { simulate } from "@/src/engine";
import { RULES } from "@/src/rules/loader";
import { makeSnapshot, hasRealData } from "./realdata.helper";
import { REAL, hasRealExpected } from "../private.helper";

const snapshot = makeSnapshot(55);
const result = simulate(snapshot, undefined, RULES);
const accounts = snapshot.accounts.filter((a) => a.owner === "self");

describe("F14 연령별 3층 막대", () => {
  it("나이마다 막대를 그린다", () => {
    const { container } = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" />);
    const bars = container.querySelectorAll("rect[rx='1.5']");
    expect(bars.length).toBeGreaterThan(result.years.filter((y) => y.gross > 0).length);
  });

  it("절벽을 나이·낙폭과 함께 표시한다", () => {
    render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" />);
    for (const c of result.metrics.cliffs) {
      expect(screen.getByText(`${c.age}세 절벽 −${Math.round(c.dropRatio * 100)}%`)).toBeInTheDocument();
    }
  });

  it("크레바스 구간을 나이와 함께 표시한다", () => {
    render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" />);
    const c = result.metrics.crevasse!;
    expect(screen.getByText(`크레바스 ${c.fromAge}~${c.toAge}세`)).toBeInTheDocument();
  });

  it("실질 모드는 눈금이 명목보다 작다 — 착시를 벗긴다", () => {
    const nominal = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" />);
    const topNominal = nominal.container.querySelectorAll("text")[1]?.textContent ?? "";
    nominal.unmount();
    const real = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="real" />);
    const topReal = real.container.querySelectorAll("text")[1]?.textContent ?? "";
    const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
    expect(num(topReal)).toBeLessThan(num(topNominal));
  });

  it("가처분 모드는 막대가 세전보다 낮고, 툴팁에 세금·건보료가 빠진 몫을 보여 준다 (M2)", () => {
    const peak = result.years.reduce((b, r) => (r.gross > b.gross ? r : b));
    const i = result.years.indexOf(peak);
    const gross = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" />);
    const topGross = gross.container.querySelectorAll("text")[1]?.textContent ?? "";
    gross.unmount();
    const disp = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" basis="disposable" />);
    const topDisp = disp.container.querySelectorAll("text")[1]?.textContent ?? "";
    const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
    expect(num(topDisp)).toBeLessThanOrEqual(num(topGross));
    const hoverTargets = disp.container.querySelectorAll("rect[fill='transparent']");
    fireEvent.mouseEnter(hoverTargets[i]!);
    expect(screen.getByRole("status")).toHaveTextContent(/세금·건보료/);
    expect(screen.getByRole("status")).toHaveTextContent(/가처분/);
  });

  it("월 환산은 눈금이 연간의 1/12 이고 「월」을 붙인다", () => {
    const yearly = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="real" />);
    const topYear = yearly.container.querySelectorAll("text")[3]?.textContent ?? "";
    yearly.unmount();
    const monthly = render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="real" perMonth />);
    const topMonth = monthly.container.querySelectorAll("text")[3]?.textContent ?? "";
    const num = (s: string) => Number(s.replace(/[^\d]/g, ""));
    expect(topMonth).toMatch(/^월 /);
    expect(num(topMonth)).toBeLessThan(num(topYear) / 6);
  });

  it.skipIf(!hasRealData || !hasRealExpected)("실데이터: 절벽 나이들이 화면에 뜬다 (기대값은 data/private)", () => {
    render(<PensionChart years={result.years} accounts={accounts} metrics={result.metrics} mode="nominal" />);
    for (const age of REAL.simulate.cliffs) expect(screen.getByText(new RegExp(`${age}세 절벽`))).toBeInTheDocument();
  });
});
