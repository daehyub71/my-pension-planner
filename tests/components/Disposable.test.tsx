import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { makeSnapshot } from "./realdata.helper";
import type { Snapshot } from "@/src/engine/model";
import { defaultContext, portalAssumptions, simulate } from "@/src/engine";
import { RULES } from "@/src/rules/loader";
import { manwon } from "@/src/format";

const snapshot = makeSnapshot(55);
const state: { current: Snapshot | undefined } = { current: snapshot };

vi.mock("next/navigation", () => ({ usePathname: () => "/disposable", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/store/session", () => ({
  subscribeSession: () => () => {},
  readSession: () => state.current,
  readServerSession: () => state.current,
  readSnapshotList: () => (state.current ? [state.current] : []),
  readServerSnapshotList: () => (state.current ? [state.current] : []),
  writeSession: vi.fn(),
  refreshSession: vi.fn(),
}));

import DisposablePage from "@/app/disposable/page";

// 화면과 같은 경로(포털 가정)로 엔진을 돌려 기대값을 만든다 — 실데이터·합성 K씨 어느 쪽이든 통과해야 한다
const self = snapshot.accounts.filter((a) => a.owner === "self");
const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, snapshot.inputs.retireAge, snapshot.inputs.lifeExpectancy);
const result = simulate(snapshot, portalAssumptions(self, ctx), RULES);
const rows = result.years.filter((r) => r.age >= snapshot.inputs.retireAge && r.gross > 0);
const defaultRow = rows.reduce((b, r) => (r.gross > b.gross ? r : b), rows[0]!);
const otherRow = rows.find((r) => r.age !== defaultRow.age && Math.round(r.real / 10) !== Math.round(defaultRow.real / 10))!;

const title = (age: number) => screen.getByRole("heading", { name: `진짜 손에 쥐는 돈 — ${age}세 한 해의 해부` });

describe("F10 가처분 — 한 해 해부", () => {
  it("기본 나이는 세전 수령이 가장 큰 해다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    expect(title(defaultRow.age)).toBeInTheDocument();
    expect((screen.getByLabelText("나이") as HTMLSelectElement).value).toBe(String(defaultRow.age));
    expect(screen.getByRole("button", { name: "한 해 해부" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "실질" })).toHaveAttribute("aria-pressed", "true");
  });

  it("나이 선택지는 은퇴 나이 이후 수령이 있는 해만이다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    const options = within(screen.getByLabelText("나이")).getAllByRole("option");
    expect(options).toHaveLength(rows.length);
    expect(options[0]).toHaveValue(String(rows[0]!.age));
  });

  it("폭포에 다섯 단계 이름과 실질 세전 금액이 뜬다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    const svg = within(screen.getByRole("img", { name: "한 해 해부 폭포" }));
    for (const label of ["세전 수령", "원천징수", /5월 정산/, "건보료", "가처분"]) expect(svg.getByText(label)).toBeInTheDocument();
    expect(svg.getByText(manwon(defaultRow.real))).toBeInTheDocument();
    expect(screen.getByText(/실효 부담률/)).toBeInTheDocument();
    expect(screen.getByText(/월 기준 세전/)).toBeInTheDocument();
  });

  it("나이를 바꾸면 제목과 금액이 바뀐다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    fireEvent.change(screen.getByLabelText("나이"), { target: { value: String(otherRow.age) } });
    expect(title(otherRow.age)).toBeInTheDocument();
    const svg = within(screen.getByRole("img", { name: "한 해 해부 폭포" }));
    expect(svg.getAllByText(manwon(otherRow.real)).length).toBeGreaterThan(0);
  });

  it("명목으로 바꾸면 명목 세전 금액을 그린다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    fireEvent.click(screen.getByRole("button", { name: "명목" }));
    const svg = within(screen.getByRole("img", { name: "한 해 해부 폭포" }));
    expect(svg.getByText(manwon(defaultRow.gross))).toBeInTheDocument();
  });

  it("연도별 곡선으로 바꾸면 곡선 화면이 뜬다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    fireEvent.click(screen.getByRole("button", { name: "연도별 곡선" }));
    expect(screen.getByRole("img", { name: "연도별 곡선" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "한 해 해부 폭포" })).not.toBeInTheDocument();
  });

  it("1,500만 카드는 그 해 overThreshold 에 맞춰 여유/초과를 말한다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    for (const r of [defaultRow, rows[0]!, rows[rows.length - 1]!]) {
      fireEvent.change(screen.getByLabelText("나이"), { target: { value: String(r.age) } });
      const card = within(screen.getByLabelText("1,500만원 기준선"));
      if (r.tax?.detail.overThreshold) expect(card.getByText(/전액이 종합\/분리 선택 대상/)).toBeInTheDocument();
      else expect(card.getByText(/여유/)).toBeInTheDocument();
    }
  });

  it("5월 박스는 엔진의 판정 방식을 문장으로 옮긴다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    const text = { low: "저율 분리과세로 종결", separate: "분리과세(16.5%)가 유리", comprehensive: "종합과세가 유리" };
    for (const r of [defaultRow, rows[rows.length - 1]!]) {
      fireEvent.change(screen.getByLabelText("나이"), { target: { value: String(r.age) } });
      const box = within(screen.getByLabelText("5월에 생기는 일"));
      expect(box.getByText(text[r.tax!.detail.method])).toBeInTheDocument();
    }
  });

  it("배우자 직장가입 여부를 모르면 피부양자 판정 불가를 알린다", () => {
    expect(snapshot.inputs.spouseEmployed).toBeUndefined();
    state.current = snapshot;
    render(<DisposablePage />);
    expect(within(screen.getByLabelText("피부양자")).getByText(/판정 불가/)).toBeInTheDocument();
  });

  it("등급 뱃지와 규칙 근거 링크, 건보료 추정 칩을 단다", () => {
    state.current = snapshot;
    render(<DisposablePage />);
    expect(screen.getByRole("link", { name: "근거는 규칙 근거 페이지에서" })).toHaveAttribute("href", "/rules");
    if (result.grades.health === "estimated") expect(screen.getByText(/건보료 추정 — 사적연금 반영 여부\(R-2\) 확인 전/)).toBeInTheDocument();
  });

  it("스냅샷이 없으면 데모 K씨로 해부를 보여 준다 (F19)", () => {
    state.current = undefined;
    render(<DisposablePage />);
    expect(screen.getByText(/데모 모드 — 가상 사례 K씨/)).toBeInTheDocument();
    expect(screen.getByText(/한 해의 해부/)).toBeInTheDocument();
  });
});

describe("엔진이 역산한 안내 문구 (2026-09-13 사용자 결정)", () => {
  it("1,500만 카드 — 여유면 「N년 줄이면 넘어갑니다」, 초과면 「N년 늘리면 내려옵니다」", async () => {
    const { ThresholdCard } = await import("@/components/DisposableCards");
    const { simulate } = await import("@/src/engine");
    const { RULES } = await import("@/src/rules/loader");
    const rows = simulate(snapshot, undefined, RULES).years.filter((r) => r.tax && r.tax.detail.privateTaxable > 0);
    const under = rows.find((r) => !r.tax!.detail.overThreshold);
    const over = rows.find((r) => r.tax!.detail.overThreshold);
    if (under) {
      const { unmount } = render(<ThresholdCard row={under} threshold={15000} lever={{ direction: "shorten", years: 3, kinds: ["dc"] }} />);
      expect(screen.getByText(/3년 줄이면/)).toBeInTheDocument();
      unmount();
    }
    if (over) {
      render(<ThresholdCard row={over} threshold={15000} lever={{ direction: "lengthen", years: 4, kinds: ["dc"] }} />);
      expect(screen.getByText(/4년 늘리면/)).toBeInTheDocument();
    }
    expect(Boolean(under || over)).toBe(true);
  });

  it("피부양자 배너 — 연기 시나리오의 탈락 나이를 덧붙인다", async () => {
    const { DependentBanner } = await import("@/components/DisposableCards");
    const { simulate } = await import("@/src/engine");
    const { RULES } = await import("@/src/rules/loader");
    const dep = { ...snapshot, inputs: { ...snapshot.inputs, spouseEmployed: true } };
    const sim = simulate(dep, undefined, RULES);
    const row = sim.years.find((r) => r.health?.basis === "dependent");
    if (!row) return; // 이 데이터에 피부양자 해가 없으면 해당 없음
    render(<DependentBanner row={row} metrics={{ ...sim.metrics, dependentLossAge: undefined }} limit={20000} delayLoss={{ startAge: 68, dependentLossAge: 73 }} />);
    expect(screen.getByText(/연기\(68세\) 시나리오에서는/)).toBeInTheDocument();
    expect(screen.getByText(/73세 탈락/)).toBeInTheDocument();
  });
});
