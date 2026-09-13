import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { Snapshot } from "@/src/engine/model";
import { makeSnapshot } from "./realdata.helper";

// 세션이 돌려줄 스냅샷을 테스트마다 바꾼다 — 빈 상태까지 한 파일에서 본다
const session = vi.hoisted(() => ({ current: undefined as Snapshot | undefined }));
const writeSession = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/store/session", () => ({
  subscribeSession: () => () => {},
  readSession: () => session.current,
  readServerSession: () => session.current,
  readSnapshotList: () => (session.current ? [session.current] : []),
  readServerSnapshotList: () => (session.current ? [session.current] : []),
  writeSession,
  refreshSession: vi.fn(),
}));

import GoalPage from "@/app/page";

const base = makeSnapshot(55);
const withoutAssets: Snapshot = { ...base, inputs: { ...base.inputs, financialAssets: undefined } };
const withAssets: Snapshot = { ...base, inputs: { ...base.inputs, financialAssets: 30000 } };

const kpis = () => within(screen.getByRole("list", { name: "목표 지표" }));

describe("F12 목표 모드", () => {
  beforeEach(() => {
    localStorage.clear();
    writeSession.mockClear();
    session.current = withoutAssets;
  });

  it("북극성 질문과 헤드라인을 낸다", () => {
    render(<GoalPage />);
    expect(screen.getByText("북극성 질문")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /은퇴 후, 매달 얼마를\s*쓰고 싶으세요\?/ })).toBeInTheDocument();
  });

  it("KPI 3장 — 필요 금융자산에 금액이 붙는다", () => {
    render(<GoalPage />);
    expect(kpis().getAllByRole("listitem")).toHaveLength(3);
    const required = kpis().getByText(/필요 금융자산 \(은퇴 \d+세 시점\)/).closest("[role=listitem]") as HTMLElement;
    expect(within(required).getByText(/^\d[\d,.]*(억|만)$/)).toBeInTheDocument();
    expect(within(required).getByText(/연금 가처분이 채우고 남는 부족분/)).toBeInTheDocument();
  });

  it("가처분 기준이 추정이면 추정 뱃지가 따라온다", () => {
    render(<GoalPage />);
    expect(kpis().getAllByText("추정").length).toBeGreaterThan(0);
  });

  it("가정 요약 — 연수익률 · 물가 · 기대수명 · 가정 바꾸기 링크", () => {
    render(<GoalPage />);
    expect(screen.getByText(/연수익률 \d+\.\d%/)).toBeInTheDocument();
    expect(screen.getByText(/물가상승률 \d+\.\d%/)).toBeInTheDocument();
    expect(screen.getByText(`${base.inputs.lifeExpectancy}세까지`)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "가정 바꾸기" })).toHaveAttribute("href", "/dashboard");
  });

  it("금융자산을 모르면 보유·갭은 판정 불가, 입력 링크는 /data", () => {
    render(<GoalPage />);
    expect(kpis().getAllByText("판정 불가")).toHaveLength(2);
    expect(kpis().getByRole("link", { name: "금융자산 입력하기" })).toHaveAttribute("href", "/data");
    expect(kpis().queryByText(/소진|유지/)).not.toBeInTheDocument();
  });

  it("금융자산이 있으면 갭 카드가 소진 나이나 유지를 말한다", () => {
    session.current = withAssets;
    render(<GoalPage />);
    expect(kpis().queryByText("판정 불가")).not.toBeInTheDocument();
    expect(kpis().getByText("3억")).toBeInTheDocument();
    const gap = kpis().getByText("갭").closest("[role=listitem]") as HTMLElement;
    expect(within(gap).getByText(/자산 소진|까지 유지/)).toBeInTheDocument();
    expect(within(gap).getByText(/^[−+]/)).toBeInTheDocument();
  });

  it("월 지출을 바꾸면 검증 뒤 스냅샷에 쓴다", () => {
    render(<GoalPage />);
    fireEvent.change(screen.getByLabelText("은퇴 후 월 지출 (만원)"), { target: { value: "450" } });
    expect(writeSession).toHaveBeenCalledTimes(1);
    const written = writeSession.mock.calls[0]![0] as Snapshot;
    expect(written.inputs.targetMonthlySpend).toBe(450);
    expect(written.inputs.retireAge).toBe(base.inputs.retireAge);
    expect(written.accounts).toBe(base.accounts);
  });

  it("은퇴 나이가 범위를 벗어나면 오류를 보이고 쓰지 않는다", () => {
    render(<GoalPage />);
    fireEvent.change(screen.getByLabelText("소득이 끊기는 나이 (세)"), { target: { value: "30" } });
    expect(screen.getByRole("alert")).toHaveTextContent(/40~80세/);
    expect(writeSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText("소득이 끊기는 나이 (세)")).toHaveValue(30);
  });

  it("CTA — 갭 메우는 방법은 /scenarios, 데이터 불러오기는 /data", () => {
    render(<GoalPage />);
    expect(screen.getByRole("link", { name: "갭 메우는 방법 보기" })).toHaveAttribute("href", "/scenarios");
    expect(screen.getByRole("link", { name: "내 연금 데이터 불러오기" })).toHaveAttribute("href", "/data");
  });

  it("스냅샷이 없으면 합성 K씨 데모로 채우고 「데모 모드」 뱃지를 단다 (F19)", () => {
    session.current = undefined;
    render(<GoalPage />);
    expect(screen.getByRole("heading", { name: /쓰고 싶으세요/ })).toBeInTheDocument();
    expect(screen.getByText(/데모 모드 — 가상 사례 K씨/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "목표 지표" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "내 연금 데이터 불러오기" })).toHaveAttribute("href", "/data");
  });
});

describe("필요 금융자산의 뜻 — 연금 수령액을 뺀 금액, 보유에는 연금계좌 적립금 제외 (2026-09-13)", () => {
  it("카드에 안내 문구가 붙는다", () => {
    session.current = withAssets;
    render(<GoalPage />);
    expect(screen.getByText(/연금 수령액은 이미 뺐습니다/)).toBeInTheDocument();
    expect(screen.getAllByText(/연금계좌 적립금 제외/).length).toBeGreaterThan(0);
  });
});
