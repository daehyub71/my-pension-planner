import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { makeSnapshot } from "./realdata.helper";
import library from "@/content/law/library.json";
import { RULES } from "@/src/rules/loader";
import { reportSummary, screensUsing } from "@/src/rules/usage";
import { lawSearchUrl } from "@/src/lawSearch";

const snapshot = makeSnapshot(55);
const SNAPSHOT_LIST = [snapshot];

vi.mock("next/navigation", () => ({ usePathname: () => "/rules", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/store/session", () => ({
  subscribeSession: () => () => {},
  readSession: () => snapshot,
  readServerSession: () => snapshot,
  readSnapshotList: () => SNAPSHOT_LIST,
  readServerSnapshotList: () => SNAPSHOT_LIST,
  writeSession: vi.fn(),
  refreshSession: vi.fn(),
}));

import RulesPage from "@/app/rules/page";

const openLibrary = () => fireEvent.click(screen.getByRole("button", { name: "연금 법규 라이브러리" }));

describe("6 규칙 근거 — 검증 리포트 (M5-1)", () => {
  beforeEach(() => localStorage.clear());

  it("머리에 규칙 버전과 최종 확인일, 요약 카드에 대조 수를 낸다", () => {
    const s = reportSummary(RULES);
    render(<RulesPage />);
    expect(screen.getByText(`rules ${RULES.version} · 최종 확인 ${s.lastChecked}`)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "이 계산기는 무엇을 근거로 계산하는가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "검증 리포트" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(`${s.verified} / ${s.total}`)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`그룹 ${s.groups}개 중 ${s.groupsVerified}개`))).toBeInTheDocument();
  });

  it("모든 규칙 이름이 표에 있고, 추정 규칙 행에는 추정 뱃지가 붙는다", () => {
    const { container } = render(<RulesPage />);
    const table = within(screen.getByRole("table"));
    for (const r of RULES.items) expect(table.getAllByText(r.label ?? r.id).length).toBeGreaterThan(0);
    const est = RULES.items.find((r) => r.grade === "estimated")!;
    const row = container.querySelector(`tr[data-rule="${est.id}"]`) as HTMLElement;
    expect(within(row).getByText("추정")).toBeInTheDocument();
    const ver = RULES.items.find((r) => r.grade === "verified")!;
    expect(within(container.querySelector(`tr[data-rule="${ver.id}"]`) as HTMLElement).getByText("조문 대조")).toBeInTheDocument();
  });

  it("비고(note)와 추정 사용 화면 안내를 낸다", () => {
    render(<RulesPage />);
    for (const r of RULES.items.filter((x) => x.note)) expect(screen.getByText(r.note!)).toBeInTheDocument();
    expect(screen.getByText(screensUsing(RULES, "estimated").join(" · "))).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "면책" })).getByText(/세제 단순화 모델 · 투자 권유 아님 · 최종 확인은 포털·공단 원문 기준 · rules kr-2026 버전/)).toBeInTheDocument();
  });
});

describe("6 규칙 근거 — 법규 라이브러리 (M5-2 · M5-3)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("주제 칩이 보이는 조문을 바꾸고, 원문 링크는 JSON 의 url 이다", () => {
    render(<RulesPage />);
    openLibrary();
    const [first, second] = library.topics;
    expect(screen.getByRole("button", { name: first!.label })).toHaveAttribute("aria-pressed", "true");
    const a0 = first!.articles[0]!;
    expect(screen.getByRole("heading", { name: `${a0.law} ${a0.title}` })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: second!.label }));
    expect(screen.getByRole("button", { name: second!.label })).toHaveAttribute("aria-pressed", "true");
    const a1 = second!.articles[0]!;
    const heading = screen.getByRole("heading", { name: `${a1.law} ${a1.title}` });
    const article = heading.closest("article") as HTMLElement;
    const link = within(article).getByRole("link", { name: "법제처 원문 열기" });
    expect(link).toHaveAttribute("href", a1.url);
    expect(link).toHaveAttribute("target", "_blank");
    // 첫 주제에만 있는 조문은 사라진다
    const onlyFirst = first!.articles.find((a) => !second!.articles.some((b) => b.law === a.law && b.ref === a.ref));
    if (onlyFirst) expect(screen.queryByRole("heading", { name: `${onlyFirst.law} ${onlyFirst.title}` })).toBeNull();
    expect(screen.getByText(new RegExp(`빌드 시점 수집\\(정적, ${library.collectedAt}\\)`))).toBeInTheDocument();
  });

  it("키가 없으면 검색은 법제처 링크만 만들고 네트워크를 부르지 않는다", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<RulesPage />);
    openLibrary();
    fireEvent.change(screen.getByLabelText("법령 검색어"), { target: { value: "분할연금" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    const link = screen.getByRole("link", { name: "법제처에서 「분할연금」 전체 검색 →" });
    expect(link).toHaveAttribute("href", `https://www.law.go.kr/lsSc.do?query=${encodeURIComponent("분할연금")}`);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByText(/키는 이 브라우저에만 저장 · 검색할 때만 법제처로 전송/)).toBeInTheDocument();
  });

  it("키를 저장하고 검색을 누르면 DRF 를 한 번 부르고 결과를 보여 준다", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ LawSearch: { law: { 법령명한글: "국민연금법", 법령일련번호: "9", 시행일자: "20260101", 법령상세링크: "/DRF/lawService.do?MST=9" } } }),
    }));
    vi.stubGlobal("fetch", fetchSpy);
    render(<RulesPage />);
    openLibrary();
    fireEvent.change(screen.getByLabelText("법제처 Open API 키 등록"), { target: { value: "mykey" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    expect(screen.getByText("법제처 Open API 키 등록됨")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("법령 검색어"), { target: { value: "분할연금" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    const result = await screen.findByRole("link", { name: "국민연금법" });
    // 응답의 상세 링크(키 포함)가 아니라 공개 법령 주소로 건다
    expect(result).toHaveAttribute("href", `https://www.law.go.kr/법령/${encodeURIComponent("국민연금법")}`);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(lawSearchUrl("분할연금", "mykey"));
  });

  it("검색 오류는 화면 안에 표시한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })));
    localStorage.setItem("mpp.lawOc.v1", "k");
    render(<RulesPage />);
    openLibrary();
    fireEvent.change(screen.getByLabelText("법령 검색어"), { target: { value: "연금" } });
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 401/));
  });
});

describe("법규 검색 — 발췌를 먼저 찾는다 (2026-09-13)", () => {
  it("키가 없어도 모아 둔 발췌에서 「분할연금」을 찾아 보여 주고, 네트워크는 부르지 않는다", () => {
    localStorage.clear();
    const spy = vi.spyOn(globalThis, "fetch");
    render(<RulesPage />);
    fireEvent.click(screen.getByRole("button", { name: "연금 법규 라이브러리" }));
    fireEvent.change(screen.getByLabelText("법령 검색어"), { target: { value: "분할연금" } });
    fireEvent.submit(screen.getByRole("search"));
    const local = within(screen.getByRole("list", { name: "발췌 검색 결과" }));
    expect(local.getByText(/국민연금법 제64조/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
