import type { Breakeven, ScenarioMetrics } from "@/src/engine/metrics";
import { GradeBadge } from "@/components/Badge";
import { eok, manwon } from "@/src/format";

export interface ScenarioColumn {
  letter: string;
  shortName: string;
  monthlySpend: number; // 만원
  metrics: ScenarioMetrics;
}

export interface ScenarioTableProps {
  columns: ScenarioColumn[];
  /** 배우자 직장가입 여부 — 모르면 피부양자 판정 불가 */
  spouseEmployed?: boolean;
  /** 피부양자 소득 경계 (원, 규칙값) */
  dependentLimitWon: number;
}

/** 차이 표기 — 줄어드는 게 좋은 지표(lowerIsBetter)면 음수를 초록으로 */
function Delta({ diff, fmt, lowerIsBetter }: { diff: number; fmt: (n: number) => string; lowerIsBetter?: boolean }) {
  if (Math.round(diff / 10) === 0) return <span className="ml-1 text-[12px] font-medium text-ink-3">±0</span>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span className={`ml-1 text-[12px] ${good ? "text-good" : "text-danger"}`}>
      {diff > 0 ? "+" : "−"}
      {fmt(Math.abs(diff))}
    </span>
  );
}

export function breakevenText(b: Breakeven | undefined): string {
  if (!b) return "—";
  switch (b.kind) {
    case "ahead-from":
      return `${b.age.toFixed(1)}세부터 우위`;
    case "ahead-until":
      return `${b.age.toFixed(1)}세까지 우위`;
    case "always-ahead":
      return "늘 우위";
    case "always-behind":
      return "늘 열위";
    case "same":
      return "같음";
  }
}

const ROW = "border-t border-rule";
const TH_ROW = "px-5 py-[9px] text-left font-normal text-ink-2";
const TD = "px-3 py-[9px] font-bold";

/** F11 지표표 5행. 첫 열이 기준(보통 A)이고 나머지는 A 대비 차이를 붙인다. 값은 전부 엔진 결과다. */
export function ScenarioTable({ columns, spouseEmployed, dependentLimitWon }: ScenarioTableProps) {
  const [a] = columns;
  if (!a) return null;
  const estimated = columns.some((c) => c.metrics.grade === "estimated");
  const spendDiffers = columns.some((c) => c.monthlySpend !== a.monthlySpend);

  return (
    <div className="overflow-x-auto rounded-xl border border-rule bg-surface">
      <table className="num w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="bg-inset text-[12.5px] font-bold text-ink-2">
            <th scope="col" className="px-5 py-[9px] text-left">
              <span className="inline-flex items-center gap-2">
                지표 {estimated && <GradeBadge grade="estimated" />}
              </span>
            </th>
            {columns.map((c, i) => (
              <th key={c.letter} scope="col" className="px-3 py-[9px] text-left">
                {c.letter} · {c.shortName}
                {i > 0 && ` (vs ${a.letter})`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className={ROW}>
            <th scope="row" className={TH_ROW}>
              필요 금융자산 (월 {a.monthlySpend.toLocaleString("ko-KR")}만)
            </th>
            {columns.map((c, i) => (
              <td key={c.letter} className={TD}>
                {eok(c.metrics.requiredAtRetire)}
                {i > 0 && <Delta diff={c.metrics.requiredAtRetire - a.metrics.requiredAtRetire} fmt={eok} lowerIsBetter />}
                {spendDiffers && c.monthlySpend !== a.monthlySpend && <span className="ml-1 text-[11.5px] font-normal text-ink-3">(월 {c.monthlySpend.toLocaleString("ko-KR")}만)</span>}
              </td>
            ))}
          </tr>
          <tr className={ROW}>
            <th scope="row" className={TH_ROW}>
              절벽 나이 · 낙폭
            </th>
            {columns.map((c, i) => {
              const w = c.metrics.worstCliff;
              const milder = i > 0 && w && a.metrics.worstCliff && w.dropRatio < a.metrics.worstCliff.dropRatio;
              return (
                <td key={c.letter} className={`${TD} ${w ? (milder ? "text-warn" : "text-danger") : "text-good"}`}>
                  {w ? `${w.age}세 −${Math.round(w.dropRatio * 100)}%` : "없음"}
                </td>
              );
            })}
          </tr>
          <tr className={ROW}>
            <th scope="row" className={TH_ROW}>
              {a.metrics.realDisposableAt.age}세 실질 연간 가처분
            </th>
            {columns.map((c, i) => (
              <td key={c.letter} className={TD}>
                {manwon(c.metrics.realDisposableAt.value)}
                {i > 0 && <Delta diff={c.metrics.realDisposableAt.value - a.metrics.realDisposableAt.value} fmt={manwon} />}
              </td>
            ))}
          </tr>
          <tr className={ROW}>
            <th scope="row" className={TH_ROW}>
              누적 손익분기 (vs {a.letter})
            </th>
            {columns.map((c, i) => (
              <td key={c.letter} className={i === 0 ? "px-3 py-[9px] text-ink-3" : TD}>
                {i === 0 ? "—" : breakevenText(c.metrics.breakeven)}
              </td>
            ))}
          </tr>
          <tr className={ROW}>
            <th scope="row" className={TH_ROW}>
              피부양자 (연 {manwon(dependentLimitWon / 1000)} 경계)
            </th>
            {columns.map((c) => (
              <td key={c.letter} className={TD}>
                {spouseEmployed === undefined ? (
                  <span className="font-medium text-ink-3" title="데이터 화면에서 배우자 직장가입 여부를 넣으면 판정합니다">
                    판정 불가
                  </span>
                ) : !spouseEmployed ? (
                  <span className="font-medium text-ink-3">해당 없음</span>
                ) : c.metrics.dependentLossAge !== undefined ? (
                  <span className="inline-flex items-center gap-[5px] text-danger">
                    <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M8 2 L15 14 H1 Z" />
                      <path d="M8 6.5v3.5" />
                    </svg>
                    {c.metrics.dependentLossAge}세 탈락
                  </span>
                ) : (
                  <span className="text-good">유지</span>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
