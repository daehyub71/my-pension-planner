"use client";
import { manwon } from "@/src/format";

/** 폭포에 그릴 한 해 금액 (천원, 명목 또는 실질로 이미 환산된 값) */
export interface WaterfallValues {
  gross: number;
  withholding: number;
  /** 5월 정산 — 음수면 환급 */
  settlement: number;
  premium: number;
  disposable: number;
  premiumEstimated: boolean;
}

const BOTTOM = 282;
const HEIGHT = 252;

/** 세전 → 원천징수 → 5월 정산 → 건보료 → 가처분. 엔진이 낸 금액을 막대로 옮길 뿐 계산하지 않는다. */
export function DisposableWaterfall({ v }: { v: WaterfallValues }) {
  const l0 = v.gross;
  const l1 = l0 - v.withholding;
  const l2 = l1 - v.settlement;
  const l3 = v.disposable;
  const top = Math.max(1, l0, l1, l2, l3);
  const y = (level: number) => BOTTOM - (Math.max(0, level) / top) * HEIGHT;
  const refund = v.settlement < 0;

  // 두 수준 사이의 떠 있는 막대
  const step = (from: number, to: number) => {
    const a = y(from);
    const b = y(to);
    return { y: Math.min(a, b), h: Math.max(1.5, Math.abs(a - b)) };
  };
  const wh = step(l0, l1);
  const st = step(l1, l2);
  const pr = step(l2, l3);
  const disTop = y(l3);

  return (
    <svg viewBox="0 0 640 330" className="block w-full" role="img" aria-label="한 해 해부 폭포">
      <rect x={40} y={y(l0)} width={120} height={BOTTOM - y(l0)} fill="var(--nps)" rx={3} />
      <text x={100} y={300} textAnchor="middle" fontSize={13} fill="var(--ink-2)">세전 수령</text>
      <text x={100} y={y(l0) - 8} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink)" className="num">{manwon(v.gross)}</text>

      <rect x={200} y={wh.y} width={90} height={wh.h} fill="var(--danger)" rx={3} />
      <text x={245} y={wh.y + wh.h + 18} textAnchor="middle" fontSize={12.5} fill="var(--ink-2)">원천징수</text>
      <text x={245} y={wh.y - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--danger)" className="num">−{manwon(v.withholding)}</text>

      <rect x={310} y={st.y} width={90} height={st.h} fill={refund ? "var(--good)" : "var(--danger)"} opacity={0.8} rx={3} />
      <text x={355} y={st.y + st.h + 18} textAnchor="middle" fontSize={12.5} fill="var(--ink-2)">{refund ? "5월 정산 (환급)" : "5월 정산"}</text>
      <text x={355} y={st.y - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill={refund ? "var(--good)" : "var(--danger)"} className="num">
        {refund ? `+${manwon(-v.settlement)}` : `−${manwon(v.settlement)}`}
      </text>

      <rect x={420} y={pr.y} width={90} height={pr.h} fill="var(--warn)" opacity={0.85} rx={3} />
      <text x={465} y={pr.y + pr.h + 18} textAnchor="middle" fontSize={12.5} fill="var(--ink-2)">건보료</text>
      <text x={465} y={pr.y - 6} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--warn)" className="num">
        −{manwon(v.premium)}
        {v.premiumEstimated && <tspan fontSize={11}> (추정)</tspan>}
      </text>

      <rect x={530} y={disTop} width={100} height={Math.max(1.5, BOTTOM - disTop)} fill="var(--good)" rx={3} />
      <text x={580} y={300} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink)">가처분</text>
      <text x={580} y={disTop - 8} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--good)" className="num">{manwon(v.disposable)}</text>

      {/* 단계 사이 연결선 */}
      <line x1={160} y1={y(l0)} x2={200} y2={y(l0)} stroke="var(--ink-3)" strokeDasharray="3 3" />
      <line x1={290} y1={y(l1)} x2={310} y2={y(l1)} stroke="var(--ink-3)" strokeDasharray="3 3" />
      <line x1={400} y1={y(l2)} x2={420} y2={y(l2)} stroke="var(--ink-3)" strokeDasharray="3 3" />
      <line x1={510} y1={y(l3)} x2={530} y2={y(l3)} stroke="var(--ink-3)" strokeDasharray="3 3" />
    </svg>
  );
}
