import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { makeSnapshot } from "./realdata.helper";
import { SCENARIO_KEY } from "@/src/store/scenarios";
import { defaultContext, portalAssumptions, scenariosGuide, simulate } from "@/src/engine";
import { presetScenarios } from "@/src/engine/presets";
import { scenarioMetrics } from "@/src/engine/metrics";
import { RULES } from "@/src/rules/loader";

const snapshot = makeSnapshot(55);
const SNAPSHOT_LIST = [snapshot];

vi.mock("next/navigation", () => ({ usePathname: () => "/scenarios", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/store/session", () => ({
  subscribeSession: () => () => {},
  readSession: () => snapshot,
  readServerSession: () => snapshot,
  readSnapshotList: () => SNAPSHOT_LIST,
  readServerSnapshotList: () => SNAPSHOT_LIST,
  writeSession: vi.fn(),
  refreshSession: vi.fn(),
}));

import ScenariosPage from "@/app/scenarios/page";

const toggles = () => screen.getAllByRole("button", { name: / 비교$/ });
const cards = () => within(screen.getByRole("list", { name: "시나리오 차트" })).queryAllByRole("listitem");
const storedCount = () => (JSON.parse(localStorage.getItem(SCENARIO_KEY) ?? "[]") as unknown[]).length;

describe("F11 시나리오 비교", () => {
  beforeEach(() => localStorage.clear());

  it("프리셋 5종 칩을 내고 기본·연기·조기가 체크돼 있다", () => {
    render(<ScenariosPage />);
    expect(toggles()).toHaveLength(5);
    expect(screen.getByRole("button", { name: /^A 기본 \(포털 가정\) 비교$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^B 연기 \d+세 비교$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^C 조기 \d+세 비교$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^D 지출 −50만 비교$/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^E 주택연금 \d+세 비교$/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/저장 무제한 · 체크한 시나리오만 비교 \(차트는 최대 3개\)/)).toBeInTheDocument();
    expect(screen.getByText(/규칙 kr-2026/)).toBeInTheDocument();
  });

  it("기본으로 스파크라인 카드 3장 — 기본 외 카드는 기준선을 흐리게 겹친다", () => {
    render(<ScenariosPage />);
    expect(cards()).toHaveLength(3);
    expect(screen.getAllByTestId("baseline-line")).toHaveLength(2);
    for (const c of cards()) expect(within(c).getByText(/절벽|크레바스/)).toBeInTheDocument();
  });

  it("차트 3개 상한 — 4번째를 체크하면 가장 먼저 체크한 것이 풀린다", () => {
    render(<ScenariosPage />);
    const d = screen.getByRole("button", { name: /^D .* 비교$/ });
    fireEvent.click(d);
    expect(d).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^A .* 비교$/ })).toHaveAttribute("aria-pressed", "false");
    expect(cards()).toHaveLength(3);
    expect(screen.getByText(/차트는 최대 3개 — 「기본 \(포털 가정\)」 체크를 풀었습니다/)).toBeInTheDocument();
  });

  it("체크를 풀면 카드가 줄어든다", () => {
    render(<ScenariosPage />);
    fireEvent.click(screen.getByRole("button", { name: /^C .* 비교$/ }));
    expect(cards()).toHaveLength(2);
  });

  it("지표표 5행과 vs A 비교", () => {
    render(<ScenariosPage />);
    const table = within(screen.getByRole("table"));
    expect(table.getByRole("rowheader", { name: /필요 금융자산 \(월 300만\)/ })).toBeInTheDocument();
    expect(table.getByRole("rowheader", { name: "절벽 나이 · 낙폭" })).toBeInTheDocument();
    expect(table.getByRole("rowheader", { name: /\d+세 실질 연간 가처분/ })).toBeInTheDocument();
    expect(table.getByRole("rowheader", { name: "누적 손익분기 (vs A)" })).toBeInTheDocument();
    expect(table.getByRole("rowheader", { name: /피부양자 \(연 2,000만 경계\)/ })).toBeInTheDocument();
    expect(table.getAllByRole("columnheader", { name: /vs A/ })).toHaveLength(2);
    const be = within(table.getByRole("row", { name: /누적 손익분기/ })).getAllByRole("cell");
    expect(be[0]).toHaveTextContent("—");
    for (const c of be.slice(1)) expect(c.textContent).toMatch(/세부터 우위|세까지 우위|늘 우위|늘 열위|같음/);
    // 합성 K씨는 배우자 직장가입을 입력하지 않았다
    const dep = within(table.getByRole("row", { name: /피부양자/ })).getAllByRole("cell");
    for (const c of dep) expect(c).toHaveTextContent("판정 불가");
  });

  it("읽는 법 배너는 계산된 손익분기로 채운다 — 문장은 엔진 scenariosGuide 가 만든다 (F21)", () => {
    // 화면과 같은 경로로 체크된 기본·연기·조기 열을 엔진에서 직접 만든다
    const ctx = defaultContext(snapshot.inputs.birthYearMonth, snapshot.asOf, snapshot.inputs.retireAge, snapshot.inputs.lifeExpectancy);
    const base = portalAssumptions(snapshot.accounts, ctx);
    const baseResult = simulate(snapshot, base, RULES);
    const picked = presetScenarios(base, snapshot.inputs, RULES, baseResult).filter((p) => ["base", "delay", "early"].includes(p.key));
    const runs = picked.map((p) => ({ p, result: p.key === "base" ? baseResult : simulate(snapshot, p.assumptions, RULES) }));
    const guide = scenariosGuide(
      runs.map((r, i) => {
        const m = scenarioMetrics(snapshot, r.p.assumptions, r.result, RULES, i > 0 ? { assumptions: runs[0]!.p.assumptions, result: runs[0]!.result } : undefined);
        return { name: r.p.name.replace(/\s*\(.*\)$/, ""), breakeven: m.breakeven, requiredAtRetire: m.requiredAtRetire, dependentLossAge: m.dependentLossAge };
      }),
    );

    render(<ScenariosPage />);
    const banner = screen.getByRole("note", { name: "읽는 법" });
    expect(banner).toHaveTextContent(guide[0]!.body);
    expect(banner).toHaveTextContent(/연기 \d+세는 .*조기 \d+세는 /);
    expect(banner).toHaveTextContent(/정답은 없고/);
    // 필요 금융자산·피부양자 문단은 펼쳐야 보인다
    expect(within(banner).queryByText(guide[1]!.body)).not.toBeInTheDocument();
    fireEvent.click(within(banner).getByRole("button", { name: "펼치기 ▾" }));
    expect(within(banner).getByText(guide[1]!.body)).toBeInTheDocument();
    expect(within(banner).getByText(guide[2]!.body)).toBeInTheDocument();
  });

  it("프리셋은 삭제할 수 없다", () => {
    render(<ScenariosPage />);
    expect(screen.getByRole("button", { name: "삭제" })).toBeDisabled();
  });

  it("프리셋을 고르고 저장하면 사용자 시나리오로 저장된다", () => {
    render(<ScenariosPage />);
    fireEvent.click(screen.getByRole("button", { name: /^C · 조기/ }));
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toMatch(/조기/);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(storedCount()).toBe(1);
    expect(toggles()).toHaveLength(6);
    // 저장한 시나리오가 편집 대상이 되고, 이제 삭제할 수 있다
    expect(screen.getByRole("button", { name: "삭제" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(storedCount()).toBe(0);
    expect(toggles()).toHaveLength(5);
  });

  it("+ 새 시나리오와 복제", () => {
    render(<ScenariosPage />);
    fireEvent.click(screen.getByRole("button", { name: "+ 새 시나리오" }));
    expect(storedCount()).toBe(1);
    expect(screen.getByLabelText("이름")).toHaveValue("새 시나리오 1");
    fireEvent.click(screen.getByRole("button", { name: "복제" }));
    expect(storedCount()).toBe(2);
    expect(screen.getByLabelText("이름")).toHaveValue("새 시나리오 1 사본");
  });

  it("편집하면 즉시 표가 다시 계산된다 (N7) — 주택연금 월 수령액 (F13)", () => {
    render(<ScenariosPage />);
    const cellA = () => within(screen.getByRole("row", { name: /실질 연간 가처분/ })).getAllByRole("cell")[0]!.textContent;
    const before = cellA();
    // 편집 대상은 기본 A
    fireEvent.click(screen.getByRole("checkbox", { name: "주택연금" }));
    const on = cellA();
    expect(on).not.toBe(before);
    fireEvent.change(screen.getByLabelText("주택연금 월 수령액 (만원)"), { target: { value: "300" } });
    expect(cellA()).not.toBe(on);
    expect(screen.getByText(/저장 안 한 변경/)).toBeInTheDocument();
  });

  it("월 지출을 바꾸면 필요 금융자산이 바뀐다", () => {
    render(<ScenariosPage />);
    const cellA = () => within(screen.getByRole("row", { name: /필요 금융자산/ })).getAllByRole("cell")[0]!.textContent;
    const before = cellA();
    fireEvent.change(screen.getByLabelText("월 지출"), { target: { value: "500" } });
    expect(cellA()).not.toBe(before);
  });
});
