import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { makeSnapshot, hasRealData } from "./realdata.helper";
import { REAL, hasRealExpected } from "../private.helper";
import { defaultContext, portalAssumptions, simulate } from "@/src/engine";
import { RULES } from "@/src/rules/loader";

const snapshot = makeSnapshot(55);
const SNAPSHOT_LIST = [snapshot];

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/store/session", () => ({
  subscribeSession: () => () => {},
  readSession: () => snapshot,
  readServerSession: () => snapshot,
  readSnapshotList: () => SNAPSHOT_LIST,
  readServerSnapshotList: () => SNAPSHOT_LIST,
  writeSession: vi.fn(),
  refreshSession: vi.fn(),
}));

import DashboardPage from "@/app/dashboard/page";

describe("F14 대시보드", () => {
  beforeEach(() => localStorage.clear());

  it("조회기준일과 규칙 버전을 머리에 단다", () => {
    render(<DashboardPage />);
    expect(screen.getByText(new RegExp(`조회기준 ${snapshot.asOf}`))).toBeInTheDocument();
    expect(screen.getByText(/규칙 kr-2026/)).toBeInTheDocument();
  });

  it("기본은 월 실질 · 세전이다 — 연간 금액은 체감이 어렵다", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "연령별 월 연금 수령액" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "실질" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "세전" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/최대 월 수령 \(실질/)).toBeInTheDocument();
  });

  it("가처분으로 바꾸면 등급 뱃지와 추정 안내가 따라온다 (M2)", () => {
    render(<DashboardPage />);
    const btn = screen.getByRole("button", { name: "가처분" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText("추정").length).toBeGreaterThan(0);
    expect(screen.getByText(/같은 비율로 줄여 그렸습니다/)).toBeInTheDocument();
  });

  it("명목으로 바꾸면 눌린 쪽과 KPI 기준이 바뀐다", () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "명목" }));
    expect(screen.getByRole("button", { name: "명목" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "실질" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/최대 월 수령 \(명목/)).toBeInTheDocument();
  });

  it("KPI 4장을 낸다", () => {
    render(<DashboardPage />);
    const kpis = within(screen.getByRole("list", { name: "요약 지표" }));
    expect(kpis.getAllByRole("listitem")).toHaveLength(4);
    expect(kpis.getByText(/절벽/)).toBeInTheDocument();
    expect(kpis.getByText(/크레바스/)).toBeInTheDocument();
    expect(kpis.getByText(/최대 월 수령/)).toBeInTheDocument();
    expect(kpis.getByText(/계좌$/)).toBeInTheDocument();
  });

  it("슬라이더를 움직이면 즉시 다시 계산한다 (N7)", () => {
    render(<DashboardPage />);
    const slider = screen.getByLabelText("국민연금 개시") as HTMLInputElement;
    const before = slider.value;
    fireEvent.change(slider, { target: { value: String(Number(before) + 3) } });
    expect(screen.getByText(/바꾼 값 있음/)).toBeInTheDocument();
    expect(screen.getByText(/\+21\.6%/)).toBeInTheDocument();
  });

  it("기본값 버튼이 되돌린다", () => {
    render(<DashboardPage />);
    const slider = screen.getByLabelText("물가상승률") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "5" } });
    expect(screen.getByText(/바꾼 값 있음/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "기본값" }));
    expect(screen.queryByText(/바꾼 값 있음/)).not.toBeInTheDocument();
  });

  it("시나리오로 저장하면 알려 준다", () => {
    render(<DashboardPage />);
    fireEvent.click(screen.getByRole("button", { name: "시나리오로 저장" }));
    expect(screen.getByText(/저장됨/)).toBeInTheDocument();
  });

  it("포털의 만 60세 가정을 알려 준다", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/만 60세 가정/)).toBeInTheDocument();
  });

  it("연금보험 역산값은 추정으로 표시한다", () => {
    render(<DashboardPage />);
    expect(screen.getByText("연금보험 수익률")).toBeInTheDocument();
    expect(screen.getAllByText("추정").length).toBeGreaterThan(0);
  });

  it("이 화면 읽는 법 — 펼치면 절벽 문단이 엔진이 찾은 가장 큰 절벽 나이를 말한다 (F21)", () => {
    const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, snapshot.inputs.retireAge, snapshot.inputs.lifeExpectancy);
    const result = simulate(snapshot, portalAssumptions(snapshot.accounts, ctx), RULES);
    render(<DashboardPage />);
    const btn = screen.getByRole("button", { name: /이 화면 읽는 법/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    const cliff = screen.getByText("절벽").nextElementSibling!;
    const worst = result.metrics.cliffs.reduce<(typeof result.metrics.cliffs)[number] | undefined>((w, c) => (!w || c.dropRatio > w.dropRatio ? c : w), undefined);
    if (worst) expect(cliff).toHaveTextContent(`${worst.age}세`);
    else expect(cliff).toHaveTextContent(/절벽은 없습니다/);
    expect(screen.getByText("크레바스")).toBeInTheDocument();
    expect(screen.getByText("명목과 실질")).toBeInTheDocument();
  });

  it.skipIf(!hasRealData || !hasRealExpected)("실데이터: 가장 큰 절벽과 최대 수령 나이가 KPI 에 뜬다 (기대값은 data/private)", () => {
    render(<DashboardPage />);
    const kpis = within(screen.getByRole("list", { name: "요약 지표" }));
    expect(kpis.getByText(REAL.dashboard.worstCliffKpi)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "명목" }));
    expect(kpis.getByText(new RegExp(`최대 월 수령 \\(명목, ${REAL.dashboard.peakNominalAge}세\\)`))).toBeInTheDocument();
    expect(kpis.getByText(new RegExp(`절벽 ${REAL.dashboard.cliffCount}곳`))).toBeInTheDocument();
  });
});
