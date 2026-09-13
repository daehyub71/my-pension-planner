"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Toggle } from "@/components/Toggle";
import { GradeBadge, Chip } from "@/components/Badge";
import { DisposableWaterfall } from "@/components/DisposableWaterfall";
import { DisposableCurve } from "@/components/DisposableCurve";
import { ThresholdCard, MayCard, DependentBanner } from "@/components/DisposableCards";
import { useSnapshot, useSimulation } from "@/src/useSession";
import { RULES, getRule } from "@/src/rules/loader";
import { manwon, percent } from "@/src/format";
import type { YearRow } from "@/src/engine/model";
import { delayDependentLoss, thresholdYearsLever } from "@/src/engine";

export default function DisposablePage() {
  const { snapshot } = useSnapshot();
  const sim = useSimulation(snapshot);
  // 사용자는 월 실질 금액을 선호한다 (대시보드와 같은 기본값)
  const [mode, setMode] = useState<"nominal" | "real">("real");
  const [view, setView] = useState<"curve" | "year">("year");
  const [picked, setPicked] = useState<number | undefined>(undefined);

  const result = sim.result;
  if (!snapshot || !result) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-title text-2xl font-bold">아직 불러온 데이터가 없습니다</h1>
          <p className="max-w-md text-sm text-ink-2">통합연금포털에서 받은 엑셀과 PDF를 넣으면 한 해의 세금·건보료·가처분을 해부해 보여 드립니다.</p>
          <Link href="/data" className="rounded-[10px] bg-navy px-7 py-3 text-[15px] font-bold text-white hover:bg-navy-deep">
            데이터 불러오기
          </Link>
        </div>
      </AppShell>
    );
  }

  const rows = result.years.filter((r) => r.age >= snapshot.inputs.retireAge && r.gross > 0);
  if (rows.length === 0) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center p-10 text-sm text-ink-2">은퇴 나이 이후 수령액이 없어 해부할 해가 없습니다.</div>
      </AppShell>
    );
  }
  const defaultRow = rows.reduce((b, r) => (r.gross > b.gross ? r : b), rows[0]!);
  const row = rows.find((r) => r.age === picked) ?? defaultRow;

  // 실질 = 명목 × (실질 세전 / 명목 세전) — 엔진이 낸 비율을 금액에 옮기기만 한다
  const factorOf = (r: YearRow) => (mode === "real" ? r.real / r.gross : 1);
  const f = factorOf(row);
  const withholding = row.tax?.withholding ?? 0;
  const settlement = row.tax?.settlement ?? 0;
  const premium = row.health?.premium ?? 0;
  const disposableOf = (r: YearRow) => (mode === "real" ? (r.disposableReal ?? r.real) : (r.disposable ?? r.gross));
  const healthGrade = row.health?.grade ?? result.grades.health;
  const healthEstimated = result.grades.health === "estimated";

  // 안내 문구 재료는 엔진이 역산한다 (2026-09-13 사용자 결정) — 화면은 표시만
  const lever = sim.assumptions ? thresholdYearsLever(snapshot, sim.assumptions, RULES, row.age) : undefined;
  const delayLoss = sim.assumptions && snapshot.inputs.spouseEmployed ? delayDependentLoss(snapshot, sim.assumptions, RULES, result) : undefined;
  const threshold = getRule<number>(RULES, "private.separate_tax_threshold").value / 1000;
  const depLimit = getRule<number>(RULES, "health.dependent_income_limit").value / 1000;

  const gross = row.gross * f;
  const disposable = disposableOf(row);
  const burden = row.gross > 0 ? (withholding + settlement + premium) / row.gross : 0;

  return (
    <AppShell
      right={
        <span className="flex items-center gap-3">
          {`조회기준 ${snapshot.asOf} · 규칙 ${result.rulesVersion}`}
          {healthEstimated && <Chip tone="warn">건보료 추정 — 사적연금 반영 여부(R-2) 확인 전</Chip>}
        </span>
      }
    >
      <div className="flex flex-1 flex-col gap-4 p-6 px-9">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="font-title text-[22px] font-semibold">진짜 손에 쥐는 돈 — {row.age}세 한 해의 해부</h1>
          <div className="text-[13.5px] text-ink-3">세전 − 원천징수 − 5월 정산 − 건보료 = 가처분</div>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
              <label htmlFor="disposable-age">나이</label>
              <select
                id="disposable-age"
                value={row.age}
                onChange={(e) => setPicked(Number(e.target.value))}
                className="num rounded-lg border-[1.5px] border-rule bg-surface px-2 py-1 text-[13px] text-ink"
              >
                {rows.map((r) => (
                  <option key={r.age} value={r.age}>
                    {r.age}세
                  </option>
                ))}
              </select>
            </div>
            <Toggle
              value={mode}
              onChange={setMode}
              options={[
                { value: "nominal", label: "명목" },
                { value: "real", label: "실질" },
              ]}
            />
            <Toggle
              tone="muted"
              value={view}
              onChange={setView}
              options={[
                { value: "curve", label: "연도별 곡선" },
                { value: "year", label: "한 해 해부" },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="flex-[1.4] rounded-xl border border-rule bg-surface p-6">
            {view === "year" ? (
              <DisposableWaterfall
                v={{
                  gross,
                  withholding: withholding * f,
                  settlement: settlement * f,
                  premium: premium * f,
                  disposable,
                  premiumEstimated: healthGrade === "estimated",
                }}
              />
            ) : (
              <DisposableCurve
                points={rows.map((r) => ({ age: r.age, gross: (r.gross * factorOf(r)) / 12, disposable: disposableOf(r) / 12 }))}
                selectedAge={row.age}
                onSelect={setPicked}
              />
            )}
            <div className="mt-2 flex justify-between border-t border-dashed border-rule pt-3 text-[13px] text-ink-2">
              <span>
                월 기준 세전 <b className="num text-ink">{manwon(gross / 12)}</b> → 가처분 <b className="num text-good">{manwon(disposable / 12)}</b>
                <span className="ml-1.5 text-ink-3">({mode === "real" ? "실질" : "명목"})</span>
              </span>
              <span>
                실효 부담률 <b className="num text-ink">{percent(burden)}</b>
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3.5">
            <ThresholdCard row={row} threshold={threshold} lever={lever} />
            <MayCard row={row} />
            <DependentBanner row={row} metrics={result.metrics} limit={depLimit} delayLoss={delayLoss && delayLoss.startAge !== sim.assumptions?.npsStartAge ? delayLoss : undefined} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-[12.5px] text-ink-3">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <circle cx="8" cy="8" r="6.2" />
            <path d="M8 7.2v4" />
            <circle cx="8" cy="4.8" r="0.6" fill="currentColor" />
          </svg>
          {result.grades.tax && (
            <span className="flex items-center gap-1">
              세금 <GradeBadge grade={result.grades.tax} />
            </span>
          )}
          {result.grades.health && (
            <span className="flex items-center gap-1">
              건보료 <GradeBadge grade={result.grades.health} />
            </span>
          )}
          {result.grades.disposable && (
            <span className="flex items-center gap-1">
              가처분 <GradeBadge grade={result.grades.disposable} />
            </span>
          )}
          <span>
            ·{" "}
            <Link href="/rules" className="text-navy underline">
              근거는 규칙 근거 페이지에서
            </Link>
          </span>
        </div>
      </div>
    </AppShell>
  );
}
