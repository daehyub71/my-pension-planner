import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// useSyncExternalStore 는 렌더마다 같은 참조를 받아야 한다 — 새 배열을 돌려주면 무한 렌더가 난다
const { writeSession, EMPTY, session } = vi.hoisted(() => ({
  writeSession: vi.fn(),
  EMPTY: [] as never[],
  // 테스트마다 현재 스냅샷·목록을 바꾼다 — 참조는 테스트 안에서 고정
  session: { current: undefined as import("@/src/engine/model").Snapshot | undefined, list: [] as import("@/src/engine/model").Snapshot[] },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/data", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/src/store/session", () => ({
  subscribeSession: () => () => {},
  readSession: () => session.current,
  readServerSession: () => undefined,
  readSnapshotList: () => (session.list.length ? session.list : EMPTY),
  readServerSnapshotList: () => EMPTY,
  writeSession,
  refreshSession: vi.fn(),
}));
// pdfjs 는 브라우저 전용 — 화면 테스트에서는 부르지 않는다
vi.mock("@/src/importers/pdf", async () => {
  const actual = await vi.importActual<typeof import("@/src/importers/pdf")>("@/src/importers/pdf");
  return { ...actual, extractTextItems: vi.fn(async () => []) };
});

import DataPage from "@/app/data/page";
import { parsePortalExcel } from "@/src/importers/xlsx";
import type { Snapshot } from "@/src/engine/model";
import { buildSnapshot } from "@/src/importers/normalize";
import { parseContractItems, type TextItem } from "@/src/importers/pdf";
import pdfItems from "@/tests/fixtures/demo-k/demo-k.pdf.items.json";

function buildSnapshotForTest(excel: ReturnType<typeof parsePortalExcel>): Snapshot {
  return buildSnapshot({ excel, pdf: parseContractItems(pdfItems as TextItem[]), inputs: { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 95 }, rulesVersion: "kr-2026" });
}

const PRIVATE_DIR = join(__dirname, "..", "..", "data", "private");
const privateXlsx = existsSync(PRIVATE_DIR) ? readdirSync(PRIVATE_DIR).find((f) => /^100lifeplan_.*\.xlsx$/.test(f)) : undefined;
const fixturePath = privateXlsx ? join(PRIVATE_DIR, privateXlsx) : join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx");

function xlsxFile(): File {
  const buf = readFileSync(fixturePath);
  return new File([new Uint8Array(buf)], "100lifeplan.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

describe("F1·F3 데이터 화면", () => {
  it("로컬 우선 원칙을 화면에 적는다", () => {
    render(<DataPage />);
    expect(screen.getByText(/이 브라우저 안에서만 읽힙니다/)).toBeInTheDocument();
  });

  it("엑셀을 넣으면 검증 결과와 계좌 목록을 보여 준다", async () => {
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("연금 파일 선택"), { target: { files: [xlsxFile()] } });
    await waitFor(() => expect(screen.getByText(/합계 검증 일치/)).toBeInTheDocument());
    expect(screen.getAllByText("국민연금").length).toBeGreaterThan(0);
    // 계좌 표와 원천 구성 입력(M4-8) 양쪽에 유형이 나온다
    expect(screen.getAllByText(/퇴직연금 DC/).length).toBeGreaterThan(0);
  });

  it("적립금이 없는 계좌는 손으로 넣을 자리를 준다 (F2 폴백)", async () => {
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("연금 파일 선택"), { target: { files: [xlsxFile()] } });
    await waitFor(() => expect(screen.getByText(/합계 검증 일치/)).toBeInTheDocument());
    const inputs = screen.getAllByPlaceholderText("만원 직접 입력");
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("은퇴 나이가 없으면 시작할 수 없다", async () => {
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("연금 파일 선택"), { target: { files: [xlsxFile()] } });
    await waitFor(() => expect(screen.getByText(/합계 검증 일치/)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("소득이 끊기는 나이"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "이 데이터로 시뮬레이션 시작" })).toBeDisabled();
    expect(screen.getByText(/소득이 끊기는 나이는 필수다/)).toBeInTheDocument();
  });

  it("시작을 누르면 스냅샷을 저장한다", async () => {
    writeSession.mockClear();
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("연금 파일 선택"), { target: { files: [xlsxFile()] } });
    await waitFor(() => expect(screen.getByText(/합계 검증 일치/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "이 데이터로 시뮬레이션 시작" }));
    expect(writeSession).toHaveBeenCalledTimes(1);
    const saved = writeSession.mock.calls[0]![0] as { accounts: unknown[]; inputs: { retireAge: number } };
    expect(saved.inputs.retireAge).toBe(60);
    expect(saved.accounts.length).toBeGreaterThan(0);
  });

  it("파일 없이 시작할 수 없다", () => {
    render(<DataPage />);
    expect(screen.getByRole("button", { name: "이 데이터로 시뮬레이션 시작" })).toBeDisabled();
  });
});

describe("M4-8 원천 구성 · 국민연금 과세대상 비율 입력", () => {
  const parsed = parsePortalExcel(new Uint8Array(readFileSync(fixturePath)));
  const mixTargets = parsed.accounts.filter((a) => a.owner === "self" && ["dc", "irp", "savings"].includes(a.kind));
  const nonTargets = parsed.accounts.filter((a) => !(a.owner === "self" && ["dc", "irp", "savings"].includes(a.kind)));
  const target = mixTargets[0];

  async function loaded() {
    writeSession.mockClear();
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("연금 파일 선택"), { target: { files: [xlsxFile()] } });
    await waitFor(() => expect(screen.getByText(/합계 검증 일치/)).toBeInTheDocument());
  }
  const startButton = () => screen.getByRole("button", { name: "이 데이터로 시뮬레이션 시작" });
  const savedSnapshot = () => writeSession.mock.calls[0]![0] as Snapshot;

  it("과세대상 비율 30% 는 스냅샷에 0.3 으로 저장된다", async () => {
    await loaded();
    expect(screen.getByText(/연말정산 모의계산/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("국민연금 과세대상 비율"), { target: { value: "30" } });
    fireEvent.click(startButton());
    expect(savedSnapshot().inputs.npsTaxableRatio).toBeCloseTo(0.3);
  });

  it("비율을 비우면 npsTaxableRatio 는 없다", async () => {
    await loaded();
    fireEvent.click(startButton());
    expect(savedSnapshot().inputs.npsTaxableRatio).toBeUndefined();
  });

  it("원천 구성 입력은 dc·irp·연금저축 계좌에만 나온다", async () => {
    await loaded();
    expect(mixTargets.length).toBeGreaterThan(0);
    for (const a of mixTargets) expect(screen.getByTestId(`mix-${a.id}`)).toBeInTheDocument();
    expect(nonTargets.length).toBeGreaterThan(0);
    for (const a of nonTargets) expect(screen.queryByTestId(`mix-${a.id}`)).toBeNull();
  });

  it("입력한 값은 해당 계좌의 sourceMix(원)로 저장된다", async () => {
    await loaded();
    const box = within(screen.getByTestId(`mix-${target!.id}`));
    fireEvent.change(box.getByLabelText(/비과세 납입액$/), { target: { value: "500" } });
    fireEvent.change(box.getByLabelText(/이연퇴직소득$/), { target: { value: "1000" } });
    fireEvent.change(box.getByLabelText(/이연퇴직소득세$/), { target: { value: "30" } });
    fireEvent.click(startButton());
    const snap = savedSnapshot();
    const acc = snap.accounts.find((a) => a.id === target!.id)!;
    expect(acc.sourceMix).toMatchObject({ exempt: 5_000_000, deferredSeverance: 10_000_000, deferredSeveranceTax: 300_000 });
    const expectedTaxable = acc.balance !== undefined ? Math.max(0, acc.balance - 15_000_000) : 0;
    expect(acc.sourceMix!.taxable).toBe(expectedTaxable);
    // 입력하지 않은 계좌에는 sourceMix 가 붙지 않는다
    for (const a of snap.accounts.filter((x) => x.id !== target!.id)) expect(a.sourceMix).toBeUndefined();
  });

  it("비과세+이연퇴직이 적립금을 넘으면 오류를 보이고 시작을 막는다", async () => {
    await loaded();
    // 적립금을 모르면 손으로 넣는다 (엑셀만으로는 적립금이 비어 있다)
    if (target!.balance === undefined) {
      const manualInput = screen.getAllByLabelText(`${target!.product} 적립금(만원)`)[0]!;
      fireEvent.change(manualInput, { target: { value: "1000" } });
    }
    const balanceManwon = target!.balance !== undefined ? target!.balance / 10000 : 1000;
    const box = within(screen.getByTestId(`mix-${target!.id}`));
    fireEvent.change(box.getByLabelText(/비과세 납입액$/), { target: { value: String(Math.ceil(balanceManwon) + 1) } });
    expect(box.getByText(/적립금을 넘습니다/)).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
    fireEvent.change(box.getByLabelText(/비과세 납입액$/), { target: { value: "" } });
    expect(startButton()).toBeEnabled();
  });

  it("이연퇴직소득만 넣고 세액을 비우면 안내를 보인다 (막지는 않는다)", async () => {
    await loaded();
    const box = within(screen.getByTestId(`mix-${target!.id}`));
    fireEvent.change(box.getByLabelText(/이연퇴직소득$/), { target: { value: "1" } });
    expect(box.getByText("이연퇴직소득세를 비우면 이연퇴직분도 연금소득세로 계산됩니다")).toBeInTheDocument();
    expect(startButton()).toBeEnabled();
    fireEvent.change(box.getByLabelText(/이연퇴직소득세$/), { target: { value: "0" } });
    expect(box.queryByText(/이연퇴직분도 연금소득세로/)).toBeNull();
  });
});

describe("현재 금융자산 안내 (2026-09-13)", () => {
  it("연금계좌 적립금은 빼고 넣으라고 알려 준다", () => {
    render(<DataPage />);
    expect(screen.getByText(/연금계좌\(DC·IRP·연금저축·연금보험\) 적립금은 제외/)).toBeInTheDocument();
  });
});

describe("추가 입력 불러오기·저장 (2026-09-13 사용자 결정)", () => {
  const base = makeSnapshotForData();
  const current: Snapshot = { ...base, inputs: { ...base.inputs, financialAssets: 100000, spouseEmployed: false, propertyTaxBase: 0 } };

  afterEach(() => {
    session.current = undefined;
    session.list = [];
    writeSession.mockClear();
  });

  it("화면을 열면 현재 스냅샷의 추가 입력으로 채운다", () => {
    session.current = current;
    session.list = [current];
    render(<DataPage />);
    expect((screen.getByLabelText("현재 금융자산") as HTMLInputElement).value).toBe("100000");
    expect(screen.getByRole("button", { name: "아니오" })).toHaveAttribute("aria-pressed", "true");
  });

  it("파일 없이 「추가 입력 저장」으로 현재 스냅샷에 반영한다 — 계좌는 그대로", () => {
    session.current = current;
    session.list = [current];
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("현재 금융자산"), { target: { value: "25000" } });
    fireEvent.click(screen.getByRole("button", { name: "추가 입력 저장" }));
    expect(writeSession).toHaveBeenCalledTimes(1);
    const saved = writeSession.mock.calls[0]![0] as Snapshot;
    expect(saved.inputs.financialAssets).toBe(25000);
    expect(saved.asOf).toBe(current.asOf);
    expect(saved.accounts.map((a) => a.id)).toEqual(current.accounts.map((a) => a.id));
    expect(screen.getByText(/저장했습니다/)).toBeInTheDocument();
  });

  it("입력이 틀리면 저장할 수 없다", () => {
    session.current = current;
    session.list = [current];
    render(<DataPage />);
    fireEvent.change(screen.getByLabelText("소득이 끊기는 나이"), { target: { value: "30" } });
    expect(screen.getByRole("button", { name: "추가 입력 저장" })).toBeDisabled();
  });

  it("저장된 스냅샷이 없으면 저장 버튼이 없다", () => {
    render(<DataPage />);
    expect(screen.queryByRole("button", { name: "추가 입력 저장" })).not.toBeInTheDocument();
  });

  it("원천 구성도 현재 스냅샷 계좌에서 불러와 저장한다", () => {
    const acc = current.accounts.find((a) => a.owner === "self" && ["dc", "irp", "savings"].includes(a.kind))!;
    const withMix: Snapshot = { ...current, accounts: current.accounts.map((a) => (a.id === acc.id ? { ...a, sourceMix: { exempt: 10_000_000, deferredSeverance: 0, taxable: 0 } } : a)) };
    session.current = withMix;
    session.list = [withMix];
    render(<DataPage />);
    expect((screen.getByLabelText(`${acc.product} 비과세 납입액`) as HTMLInputElement).value).toBe("1000");
    fireEvent.change(screen.getByLabelText(`${acc.product} 비과세 납입액`), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "추가 입력 저장" }));
    const saved = writeSession.mock.calls[0]![0] as Snapshot;
    expect(saved.accounts.find((a) => a.id === acc.id)!.sourceMix!.exempt).toBe(20_000_000);
  });
});

describe("F18 스냅샷 연도 비교 (M5-4)", () => {
  afterEach(() => {
    session.current = undefined;
    session.list = [];
  });

  it("조회기준일이 다른 스냅샷이 둘 이상이면 직전 대비 변화를 보인다", () => {
    const newer = makeSnapshotForData();
    const older: Snapshot = { ...newer, asOf: "2025-08-31", accounts: newer.accounts.map((a) => (a.balance !== undefined ? { ...a, balance: a.balance - 1_000_000 } : a)) };
    session.current = newer;
    session.list = [newer, older];
    render(<DataPage />);
    const box = screen.getByRole("region", { name: "스냅샷 비교" });
    expect(within(box).getByText(/2025-08-31 대비/)).toBeInTheDocument();
    expect(within(box).getByText(/적립금/)).toBeInTheDocument();
  });
});

function makeSnapshotForData(): Snapshot {
  const excel = parsePortalExcel(readFileSync(join(__dirname, "..", "fixtures", "demo-k", "demo-k.xlsx")));
  return buildSnapshotForTest(excel);
}
