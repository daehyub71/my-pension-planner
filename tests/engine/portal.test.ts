import { describe, it, expect } from "vitest";
import { yearOfAge, npsFlowFromAnchor, monthsInFirstYear, deriveGrowthRate, deriveImpliedReturn, regenerateFlow } from "@/src/engine/portal";

describe("F4 yearOfAge — 연령 열은 만 나이가 아니라 그 나이가 되는 달력 연도", () => {
  it("1968-07생의 65세는 2033년 (실데이터로 확인한 규칙)", () => {
    expect(yearOfAge("1968-07", 65)).toBe(2033);
    expect(yearOfAge("1968-07", 55)).toBe(2023);
  });
});

describe("F4 monthsInFirstYear", () => {
  it("4월 개시면 9개월", () => {
    expect(monthsInFirstYear("2036-04")).toBe(9);
  });
  it("1월 개시면 12개월", () => {
    expect(monthsInFirstYear("2031-01")).toBe(12);
  });
  it("12월 개시면 1개월", () => {
    expect(monthsInFirstYear("2030-12")).toBe(1);
  });
});

describe("F4 npsFlowFromAnchor — 포털 국민연금 산식 재현 (골든)", () => {
  // 합성 K씨: 월 1,350,000원 · 2033-08 개시 · 물가 3.1% · 1968-07생 (실데이터 26개 값도 오차 0 — 로컬 검증)
  const flow = npsFlowFromAnchor({ monthlyAmount: 1350000, startDate: "2033-08", startAge: 65, inflation: 0.031, toAge: 90 });

  it("개시 첫 해는 개월 비례", () => {
    expect(flow[65]).toBe(6750); // 1,350,000 × 5 = 6,750,000원 → 6,750천원
  });

  it("이후 매년 물가율 복리", () => {
    expect(flow[66]).toBe(16702);
    expect(flow[67]).toBe(17220);
    expect(flow[68]).toBe(17754);
    expect(flow[69]).toBe(18304);
    expect(flow[70]).toBe(18872);
    expect(flow[90]).toBe(34752);
  });

  it("합계가 포털 형식 픽스처의 소계와 같다", () => {
    const sum = Object.values(flow).reduce((s, v) => s + v, 0);
    expect(sum).toBe(623759);
  });

  it("개시 전 나이는 0", () => {
    expect(flow[64]).toBe(0);
    expect(flow[55]).toBe(0);
  });
});

describe("F4 deriveGrowthRate — 원본 흐름에서 지급액 증가율을 읽는다", () => {
  it("일정 비율로 커지는 흐름 (DC 4.5%)", () => {
    const flow: Record<number, number> = {};
    for (let a = 55; a <= 90; a++) flow[a] = 0;
    for (let i = 0; i < 20; i++) flow[60 + i] = Math.round(12000 * Math.pow(1.045, i));
    expect(deriveGrowthRate(flow)).toBeCloseTo(0.045, 4);
  });

  it("명목 고정 상품은 0 — 보너스가 섞여도 중앙값으로 버틴다", () => {
    const flow: Record<number, number> = {};
    for (let a = 60; a <= 90; a++) flow[a] = 1800;
    flow[65] = 2700;
    flow[70] = 3000;
    expect(deriveGrowthRate(flow)).toBeCloseTo(0, 6);
  });

  it("지급이 없으면 판단하지 않는다", () => {
    expect(deriveGrowthRate({ 60: 0, 61: 0 })).toBeUndefined();
  });
});

describe("F4 deriveImpliedReturn — 적립금과 지급 흐름을 잇는 내재수익률", () => {
  it("왕복: 알려진 r 로 만든 흐름에서 그 r 을 되찾는다", () => {
    const args = { balance: 200000, asOfYear: 2026 + 8 / 12, birthYearMonth: "1968-07", growth: 0.045, ret: 0.0619, startMonth: 3, startAge: 60, years: 20 };
    const flow = regenerateFlow(args);
    const got = deriveImpliedReturn({ flow, balance: args.balance, asOfYear: args.asOfYear, birthYearMonth: args.birthYearMonth });
    expect(got).toBeCloseTo(0.0619, 6);
  });

  it("적립금이 없으면 역산하지 않는다 — 추정하지 않는다", () => {
    expect(deriveImpliedReturn({ flow: { 60: 100 }, balance: undefined, asOfYear: 2026.5, birthYearMonth: "1968-07" })).toBeUndefined();
    expect(deriveImpliedReturn({ flow: { 60: 0 }, balance: 1000, asOfYear: 2026.5, birthYearMonth: "1968-07" })).toBeUndefined();
  });
});

describe("F5 regenerateFlow — 개시·기간을 바꾸면 적립금을 정확히 소진한다", () => {
  const base = { balance: 200000, asOfYear: 2026 + 8 / 12, birthYearMonth: "1968-07", growth: 0.045, ret: 0.06, startMonth: 3 };

  it("현가 합이 적립금과 같다", () => {
    const flow = regenerateFlow({ ...base, startAge: 60, years: 20 });
    let pv = 0;
    for (const [age, v] of Object.entries(flow)) {
      const t = 1968 + Number(age) + 0.5 - base.asOfYear;
      pv += v / Math.pow(1 + base.ret, t);
    }
    expect(pv).toBeCloseTo(200000, 0);
  });

  it("기간을 늘리면 연 지급액이 줄고 명목 총액은 는다", () => {
    const a = regenerateFlow({ ...base, startAge: 60, years: 20 });
    const b = regenerateFlow({ ...base, startAge: 60, years: 30 });
    expect(b[60]!).toBeLessThan(a[60]!);
    const sum = (f: Record<number, number>) => Object.values(f).reduce((s, v) => s + v, 0);
    expect(sum(b)).toBeGreaterThan(sum(a));
  });

  it("개시를 늦추면 연 지급액이 는다 — 더 오래 굴린다", () => {
    const a = regenerateFlow({ ...base, startAge: 60, years: 20 });
    const b = regenerateFlow({ ...base, startAge: 65, years: 20 });
    expect(b[65]!).toBeGreaterThan(a[60]!);
    expect(a[60]! > 0 && b[60] === 0).toBe(true);
  });

  it("개시 첫 해는 개월 비례", () => {
    const full = regenerateFlow({ ...base, startAge: 60, years: 20, startMonth: 1 });
    const partial = regenerateFlow({ ...base, startAge: 60, years: 20, startMonth: 7 });
    expect(partial[60]! / full[60]!).toBeCloseTo(0.5, 1);
  });
});
