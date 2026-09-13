"use client";
import { manwon } from "@/src/format";

export interface CurvePoint {
  age: number;
  /** 월 세전 (천원) */
  gross: number;
  /** 월 가처분 (천원) */
  disposable: number;
}

const W = 640;
const H = 330;
const PAD = { top: 20, right: 16, bottom: 34, left: 52 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

/** 연도별 월 세전 vs 월 가처분 곡선. 고른 나이에 세로선을 긋고, 점을 누르면 그 나이로 옮긴다. */
export function DisposableCurve({ points, selectedAge, onSelect }: { points: CurvePoint[]; selectedAge: number; onSelect: (age: number) => void }) {
  if (points.length === 0) return null;
  const yMax = niceMax(Math.max(1, ...points.map((p) => p.gross)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const minAge = points[0]!.age;
  const span = Math.max(1, points[points.length - 1]!.age - minAge);
  const x = (age: number) => PAD.left + ((age - minAge) / span) * plotW;
  const y = (v: number) => PAD.top + plotH - (Math.max(0, v) / yMax) * plotH;
  const path = (key: "gross" | "disposable") => points.map((p) => `${x(p.age).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const sel = points.find((p) => p.age === selectedAge);

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="연도별 곡선">
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(yMax * f)} y2={y(yMax * f)} stroke="var(--rule)" />
            <text x={PAD.left - 6} y={y(yMax * f) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)" className="num">{manwon(yMax * f)}</text>
          </g>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--ink-3)" />
        {points
          .filter((p) => p.age % 5 === 0)
          .map((p) => (
            <text key={p.age} x={x(p.age)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--ink-3)">{p.age}세</text>
          ))}
        {sel && <line x1={x(sel.age)} x2={x(sel.age)} y1={PAD.top} y2={y(0)} stroke="var(--navy)" strokeDasharray="4 3" />}
        <polyline points={path("gross")} fill="none" stroke="var(--nps)" strokeWidth={2.5} />
        <polyline points={path("disposable")} fill="none" stroke="var(--good)" strokeWidth={2.5} />
        {points.map((p) => (
          <g key={p.age} onClick={() => onSelect(p.age)} className="cursor-pointer">
            <title>{`${p.age}세 · 월 세전 ${manwon(p.gross)} → 가처분 ${manwon(p.disposable)}`}</title>
            <rect x={x(p.age) - plotW / span / 2} y={PAD.top} width={plotW / span} height={plotH} fill="transparent" />
          </g>
        ))}
        {sel && (
          <g>
            <circle cx={x(sel.age)} cy={y(sel.gross)} r={4.5} fill="var(--nps)" />
            <circle cx={x(sel.age)} cy={y(sel.disposable)} r={4.5} fill="var(--good)" />
            <text x={x(sel.age) + 8} y={y(sel.gross) - 8} fontSize={12} fontWeight={700} fill="var(--ink)" className="num">{sel.age}세</text>
          </g>
        )}
      </svg>
      <div className="flex gap-4 text-[12.5px] text-ink-2">
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-nps" />월 세전</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 bg-good" />월 가처분</span>
      </div>
    </div>
  );
}
