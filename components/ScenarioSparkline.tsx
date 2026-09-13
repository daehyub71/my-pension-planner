import type { ScenarioMetrics } from "@/src/engine/metrics";
import { eok } from "@/src/format";

const W = 250;
const H = 110;
const X0 = 6;
const X1 = 244;
const Y_AXIS = 96;
const Y_TOP = 12;

type Point = { age: number; value: number };

/** 나이별 값 → 계단선. 연 1행이라 해마다 수평으로 잇고 다음 해에 수직으로 꺾는다 */
function stepPath(points: Point[], x: (age: number) => number, y: (v: number) => number): string {
  return points.map((p, i) => (i === 0 ? `M${x(p.age).toFixed(1)},${y(p.value).toFixed(1)}` : `H${x(p.age).toFixed(1)} V${y(p.value).toFixed(1)}`)).join(" ");
}

export interface ScenarioSparklineProps {
  letter: string;
  name: string;
  color: string;
  metrics: ScenarioMetrics;
  /** 기준(A) 시나리오 — 자기 자신이 기준이면 없다 */
  baseline?: ScenarioMetrics;
  /** 카드끼리 높이를 견줄 수 있게 같은 축 상한을 쓴다 (천원) */
  yMax: number;
  ageRange: [number, number];
}

/** 시나리오 스파크라인 카드 — 실질 연간 가처분 흐름 · 가장 큰 절벽 표시 · 한 줄 요약 */
export function ScenarioSparkline({ letter, name, color, metrics, baseline, yMax, ageRange }: ScenarioSparklineProps) {
  const [a0, a1] = ageRange;
  const x = (age: number) => X0 + ((age - a0) / Math.max(1, a1 - a0)) * (X1 - X0);
  const y = (v: number) => Y_AXIS - (Math.max(0, v) / Math.max(1, yMax)) * (Y_AXIS - Y_TOP);
  const cliff = metrics.worstCliff;
  const beforeCliff = cliff ? metrics.sparkline.find((p) => p.age === cliff.age - 1) : undefined;
  const crevasseResolved = baseline?.crevasse && !metrics.crevasse;
  // 기준보다 낙폭이 작으면 경고색으로 한 단계 낮춘다
  const cliffTone = cliff && baseline?.worstCliff && cliff.dropRatio < baseline.worstCliff.dropRatio ? "text-warn" : "text-danger";
  const reqTone = baseline ? (metrics.requiredAtRetire < baseline.requiredAtRetire ? "text-good" : metrics.requiredAtRetire > baseline.requiredAtRetire ? "text-danger" : "") : "";

  return (
    <li className="flex flex-col gap-2 rounded-[11px] border border-rule bg-surface px-[15px] py-[13px]">
      <div className="flex items-center gap-[7px] text-[13px] font-bold">
        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
        {letter} · {name}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`${letter} ${name} 실질 연간 가처분 흐름 (${a0}~${a1}세)`}>
        <line x1={X0} y1={Y_AXIS} x2={X1} y2={Y_AXIS} stroke="var(--ink-3)" strokeWidth={1} />
        {baseline && <path data-testid="baseline-line" d={stepPath(baseline.sparkline, x, y)} fill="none" stroke="var(--nps)" strokeWidth={1.4} opacity={0.3} />}
        <path d={stepPath(metrics.sparkline, x, y)} fill="none" stroke={color} strokeWidth={2.2} />
        {cliff && beforeCliff && <circle cx={x(cliff.age)} cy={y(beforeCliff.value)} r={3.4} fill="var(--paper)" stroke="var(--danger)" strokeWidth={1.8} />}
        <text x={X0} y={H - 1} fontSize={9} fill="var(--ink-3)">
          {a0}세
        </text>
        <text x={X1} y={H - 1} fontSize={9} fill="var(--ink-3)" textAnchor="end">
          {a1}세
        </text>
      </svg>
      <div className="num text-[12px] text-ink-2">
        {crevasseResolved ? (
          <>
            크레바스 <b className="text-good">해소</b>
          </>
        ) : cliff ? (
          <>
            절벽 <b className={cliffTone}>{`${cliff.age}세 −${Math.round(cliff.dropRatio * 100)}%`}</b>
          </>
        ) : (
          <>
            절벽 <b className="text-good">없음</b>
          </>
        )}
        {" · "}필요 <b className={reqTone}>{eok(metrics.requiredAtRetire)}</b>
      </div>
    </li>
  );
}
