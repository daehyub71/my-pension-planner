"use client";
import { useMemo, useState } from "react";
import type { Account, Metrics, YearRow } from "@/src/engine/model";
import { LAYER_COLOR, LAYER_LABEL, layerOf, manwon, type Layer } from "@/src/format";

const LAYERS: Layer[] = ["national", "retire", "private"];
const W = 900;
const H = 380;
const PAD = { top: 34, right: 20, bottom: 34, left: 56 };

export interface ChartProps {
  years: YearRow[];
  accounts: Account[];
  metrics: Metrics;
  mode: "nominal" | "real";
  /** 가처분이면 세금·건보료를 뺀 값. 계좌별로 나누지 않으므로 층을 같은 비율로 줄여 그린다 */
  basis?: "gross" | "disposable";
  /** 월 환산 — 연간 금액 ÷ 12. 개시 첫해는 부분 개월이라 실제 월액보다 작게 보인다 */
  perMonth?: boolean;
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  return Math.ceil(v / (mag / 2)) * (mag / 2);
}

export function PensionChart({ years, accounts, metrics, mode, basis = "gross", perMonth = false }: ChartProps) {
  const [hover, setHover] = useState<number | undefined>(undefined);
  const layerByAccount = useMemo(() => new Map(accounts.map((a) => [a.id, layerOf(a.kind)])), [accounts]);

  const rows = useMemo(
    () =>
      years.map((r) => {
        const div = perMonth ? 12 : 1;
        const gross = (mode === "real" ? r.real : r.gross) / div;
        const disposable = mode === "real" ? r.disposableReal : r.disposable;
        const total = basis === "disposable" && disposable !== undefined ? Math.max(0, disposable) / div : gross;
        const scale = r.gross > 0 ? total / r.gross : 1;
        const byLayer: Record<Layer, number> = { national: 0, retire: 0, private: 0 };
        for (const [id, v] of Object.entries(r.byAccount)) byLayer[layerByAccount.get(id) ?? "private"] += v * scale;
        return { age: r.age, year: r.year, total, deducted: basis === "disposable" ? gross - total : 0, byLayer };
      }),
    [years, mode, basis, perMonth, layerByAccount],
  );

  const yMax = niceMax(Math.max(1, ...rows.map((r) => r.total)));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const step = plotW / Math.max(1, rows.length);
  const barW = Math.max(3, step * 0.72);
  const x = (i: number) => PAD.left + i * step + (step - barW) / 2;
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;
  const indexOfAge = (age: number) => rows.findIndex((r) => r.age === age);

  const gridValues = [0.25, 0.5, 0.75, 1].map((f) => yMax * f);
  const hovered = hover !== undefined ? rows[hover] : undefined;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="연령별 연금 수령액">
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={PAD.left} y1={y(v)} x2={W - PAD.right} y2={y(v)} stroke="var(--rule)" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--ink-3)">
              {perMonth ? "월 " : ""}
              {manwon(v)}
            </text>
          </g>
        ))}
        <line x1={PAD.left} y1={y(0)} x2={W - PAD.right} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} />

        {metrics.crevasse && indexOfAge(metrics.crevasse.fromAge) >= 0 && (
          <g>
            <rect
              x={x(indexOfAge(metrics.crevasse.fromAge)) - (step - barW) / 2}
              y={PAD.top}
              width={(indexOfAge(metrics.crevasse.toAge) - indexOfAge(metrics.crevasse.fromAge) + 1) * step}
              height={plotH}
              fill="var(--warn)"
              opacity={0.08}
            />
            <text
              x={x(indexOfAge(metrics.crevasse.fromAge)) + ((indexOfAge(metrics.crevasse.toAge) - indexOfAge(metrics.crevasse.fromAge) + 1) * step) / 2}
              y={PAD.top - 10}
              textAnchor="middle"
              fontSize={12}
              fontWeight={700}
              fill="var(--warn)"
            >
              크레바스 {metrics.crevasse.fromAge}~{metrics.crevasse.toAge}세
            </text>
          </g>
        )}

        {rows.map((r, i) => {
          let acc = 0;
          return (
            <g key={r.age}>
              {LAYERS.map((L) => {
                const v = r.byLayer[L];
                if (v <= 0) return null;
                const yTop = y(acc + v);
                const h = y(acc) - yTop;
                acc += v;
                return <rect key={L} x={x(i)} y={yTop} width={barW} height={h} fill={LAYER_COLOR[L]} rx={1.5} />;
              })}
            </g>
          );
        })}

        {metrics.cliffs.map((c, k) => {
          const i = indexOfAge(c.age);
          if (i < 0) return null;
          const cx = x(i) - (step - barW) / 2;
          // 가까운 절벽끼리는 라벨이 겹친다 — 앞 절벽과 5년 안쪽이면 한 줄 아래로 내린다
          const prev = metrics.cliffs[k - 1];
          const lower = prev !== undefined && c.age - prev.age < 6 && k % 2 === 1;
          const labelY = PAD.top + 2 + (lower ? 16 : 0);
          return (
            <g key={c.age}>
              <line x1={cx} y1={labelY + 4} x2={cx} y2={y(0)} stroke="var(--danger)" strokeWidth={2} strokeDasharray="5 4" />
              <text x={cx + 6} y={labelY} fontSize={12} fontWeight={700} fill="var(--danger)">
                {c.age}세 절벽 −{Math.round(c.dropRatio * 100)}%
              </text>
            </g>
          );
        })}

        {rows.map((r, i) =>
          r.age % 5 === 0 ? (
            <text key={r.age} x={x(i) + barW / 2} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--ink-2)">
              {r.age}세
            </text>
          ) : null,
        )}

        {rows.map((r, i) => (
          <rect
            key={`hit-${r.age}`}
            x={PAD.left + i * step}
            y={PAD.top}
            width={step}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(undefined)}
          />
        ))}
        {hovered && <line x1={x(hover!) + barW / 2} y1={PAD.top} x2={x(hover!) + barW / 2} y2={y(0)} stroke="var(--ink-3)" strokeWidth={1} opacity={0.5} />}
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: `${((PAD.left + (hover! + 0.5) * step) / W) * 100}%`, transform: "translateX(-50%)" }}
          role="status"
        >
          <div className="font-bold">
            {hovered.age}세 · {hovered.year}년{perMonth ? " · 월 환산" : ""}
          </div>
          {LAYERS.filter((L) => hovered.byLayer[L] > 0).map((L) => (
            <div key={L} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: LAYER_COLOR[L] }} />
              <span className="text-ink-2">{LAYER_LABEL[L]}</span>
              <span className="num ml-auto font-medium">{manwon(hovered.byLayer[L])}</span>
            </div>
          ))}
          {hovered.deducted > 0 && (
            <div className="flex items-center gap-1.5 text-danger">
              <span>세금·건보료</span>
              <span className="num ml-auto font-medium">−{manwon(hovered.deducted)}</span>
            </div>
          )}
          <div className="mt-1 border-t border-rule pt-1 font-bold">
            {basis === "disposable" ? "가처분" : "합계"} <span className="num">{manwon(hovered.total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="flex gap-3.5 text-[13px] text-ink-2">
      {LAYERS.map((L) => (
        <span key={L} className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LAYER_COLOR[L] }} />
          {LAYER_LABEL[L]}
        </span>
      ))}
    </div>
  );
}
