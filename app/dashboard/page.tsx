"use client";
import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PensionChart, ChartLegend } from "@/components/PensionChart";
import { Toggle } from "@/components/Toggle";
import { Slider } from "@/components/Slider";
import { KpiCard } from "@/components/Kpi";
import { GradeBadge, Chip } from "@/components/Badge";
import { useSnapshot, useSimulation } from "@/src/useSession";
import { saveScenario } from "@/src/store/scenarios";
import { manwon, percent, KIND_LABEL } from "@/src/format";
import { deriveBase, dashboardGuide } from "@/src/engine";
import { GuidePanel } from "@/components/GuidePanel";

export default function DashboardPage() {
  const { snapshot } = useSnapshot();
  const sim = useSimulation(snapshot);
  // 연간 금액은 체감이 어렵다 — 월 실질 수령액을 기본으로 보여 준다 (DESIGN 2번 v3, 2026-09-13)
  const [mode, setMode] = useState<"nominal" | "real">("real");
  const [taxMode, setTaxMode] = useState<"gross" | "disposable">("gross");
  const [saved, setSaved] = useState<string | undefined>();

  if (!snapshot || !sim.result || !sim.assumptions || !sim.base || !sim.ctx) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-title text-2xl font-bold">아직 불러온 데이터가 없습니다</h1>
          <p className="max-w-md text-sm text-ink-2">통합연금포털에서 받은 엑셀과 PDF를 넣으면 여기에 연령별 수령액과 위험 구간이 그려집니다.</p>
          <Link href="/data" className="rounded-[10px] bg-navy px-7 py-3 text-[15px] font-bold text-white hover:bg-navy-deep">
            데이터 불러오기
          </Link>
        </div>
      </AppShell>
    );
  }

  const { result, assumptions, base, ctx, selfAccounts } = sim;
  const npsAccount = selfAccounts.find((a) => a.kind === "national");
  const dcBase = selfAccounts.find((a) => a.kind === "dc");
  const dcModel = dcBase ? deriveBase(dcBase, ctx) : undefined;
  const insurance = selfAccounts.find((a) => a.kind === "insurance");
  const worstCliff = result.metrics.cliffs.reduce<(typeof result.metrics.cliffs)[number] | undefined>((w, c) => (!w || c.dropRatio > w.dropRatio ? c : w), undefined);
  // KPI 도 차트와 같은 기준(명목/실질 · 세전/가처분)의 월 환산 최대치
  const monthlyOf = (r: (typeof result.years)[number]): number => {
    const gross = mode === "real" ? r.real : r.gross;
    const disp = mode === "real" ? r.disposableReal : r.disposable;
    return (taxMode === "disposable" && disp !== undefined ? disp : gross) / 12;
  };
  const peakMonthly = result.years.reduce((b, r) => (monthlyOf(r) > monthlyOf(b) ? r : b), result.years[0]!);
  const retireYears = assumptions.privateStart.dc?.years ?? assumptions.privateStart.irp?.years ?? 20;

  const set = (patch: Partial<typeof assumptions>) => sim.setAssumptions({ ...assumptions, ...patch });
  const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

  return (
    <AppShell right={`조회기준 ${snapshot.asOf} · 규칙 ${result.rulesVersion}`}>
      <div className="flex flex-1 gap-5 p-6 px-9">
        <section className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3.5">
            <h1 className="font-title text-[22px] font-semibold">연령별 월 연금 수령액</h1>
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
              value={taxMode}
              onChange={setTaxMode}
              options={[
                { value: "gross", label: "세전" },
                { value: "disposable", label: "가처분", title: "세금·건보료를 뺀 금액 (추정 포함)" },
              ]}
            />
            {taxMode === "disposable" && result.grades.disposable && <GradeBadge grade={result.grades.disposable} />}
            <div className="ml-auto">
              <ChartLegend />
            </div>
          </div>

          <div className="rounded-xl border border-rule bg-surface p-5">
            <PensionChart years={result.years} accounts={selfAccounts} metrics={result.metrics} mode={mode} basis={taxMode} perMonth />
          </div>

          <div className="grid grid-cols-4 gap-3.5" role="list" aria-label="요약 지표">
            <KpiCard
              tone={worstCliff ? "danger" : "good"}
              value={worstCliff ? `${worstCliff.age}세 · −${Math.round(worstCliff.dropRatio * 100)}%` : "없음"}
              label={result.metrics.cliffs.length > 1 ? `절벽 ${result.metrics.cliffs.length}곳 (가장 큰 낙폭)` : "절벽 (전년 대비 낙폭)"}
            />
            <KpiCard
              tone={result.metrics.crevasse ? "warn" : "good"}
              value={result.metrics.crevasse ? `×${result.metrics.crevasse.depthRatio.toFixed(2)}` : "없음"}
              label={result.metrics.crevasse ? `크레바스 ${result.metrics.crevasse.fromAge}~${result.metrics.crevasse.toAge}세 (본궤도 대비)` : "크레바스"}
            />
            <KpiCard value={`월 ${manwon(monthlyOf(peakMonthly))}`} label={`최대 월 수령 (${mode === "real" ? "실질" : "명목"}${taxMode === "disposable" ? " 가처분" : ""}, ${peakMonthly.age}세)`} />
            <KpiCard
              value={`${result.metrics.accountCount}계좌`}
              label={Object.entries(
                selfAccounts.reduce<Record<string, number>>((m, a) => ({ ...m, [a.kind]: (m[a.kind] ?? 0) + 1 }), {}),
              )
                .map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`)
                .join(" · ")}
            />
          </div>

          {taxMode === "disposable" && (
            <div className="rounded-[10px] border border-rule bg-inset px-4 py-2.5 text-[13px] leading-relaxed text-ink-2">
              세금·건보료는 계좌별로 나누지 않고 층을 같은 비율로 줄여 그렸습니다.
              {result.warnings.some((w) => w.code === "tax-assumption" || w.code === "health-unknown") && " 원천 구성·국민연금 과세대상 비율·배우자 직장가입 여부를 몰라 보수적으로 추정한 값이 섞여 있습니다."}
            </div>
          )}

          {result.warnings.filter((w) => w.code === "no-balance" || w.code === "data-ends" || w.code === "model-mismatch" || w.code === "withdrawal-limit" || w.code === "dependent-loss" || (w.code === "health-unknown" && w.message.startsWith("R-2"))).map((w, i) => (
            <div key={i} className="rounded-[10px] border border-warn/40 bg-warn-bg px-4 py-2.5 text-[13px] text-warn">
              ⚠ {w.message}
            </div>
          ))}
        </section>

        <aside className="flex w-[290px] flex-col gap-4 rounded-xl border border-rule bg-surface px-5 py-5">
          <div className="flex items-center justify-between">
            <h2 className="font-title text-[17px] font-semibold">가정</h2>
            {sim.dirty && <Chip tone="warn">바꾼 값 있음</Chip>}
          </div>

          <Slider
            label="물가상승률"
            min={0}
            max={6}
            step={0.1}
            value={Number((assumptions.inflation * 100).toFixed(1))}
            display={percent(assumptions.inflation)}
            changed={changed(assumptions.inflation, base.inflation)}
            onChange={(v) => set({ inflation: v / 100 })}
            note="포털 실측값 3.1% — 국민연금 명목 증가와 실질 환산에 쓰입니다"
          />

          <Slider
            label="국민연금 개시"
            min={60}
            max={70}
            step={1}
            value={assumptions.npsStartAge}
            display={`${assumptions.npsStartAge}세${assumptions.npsStartAge !== base.npsStartAge ? ` (${assumptions.npsStartAge < base.npsStartAge ? "−" : "+"}${Math.abs(assumptions.npsStartAge - base.npsStartAge) * (assumptions.npsStartAge < base.npsStartAge ? 6 : 7.2)}%)` : ""}`}
            changed={assumptions.npsStartAge !== base.npsStartAge}
            onChange={(v) => set({ npsStartAge: v })}
            note={npsAccount ? `기준 ${base.npsStartAge}세 · 조기 연 −6% / 연기 연 +7.2%` : "국민연금 계좌가 없습니다"}
          />

          <Slider
            label="퇴직연금 수령 기간"
            min={5}
            max={40}
            step={1}
            value={retireYears}
            display={`${retireYears}년`}
            changed={changed(assumptions.privateStart.dc, base.privateStart.dc)}
            onChange={(v) =>
              set({
                privateStart: {
                  ...assumptions.privateStart,
                  ...(base.privateStart.dc ? { dc: { age: assumptions.privateStart.dc?.age ?? base.privateStart.dc.age, years: v } } : {}),
                  ...(base.privateStart.irp ? { irp: { age: assumptions.privateStart.irp?.age ?? base.privateStart.irp.age, years: v } } : {}),
                },
              })
            }
            note="DC·IRP 에 함께 적용됩니다"
          />

          <Slider
            label="DC 운용수익률"
            min={0}
            max={12}
            step={0.1}
            value={Number(((assumptions.returnByKind.dc ?? 0) * 100).toFixed(1))}
            display={assumptions.returnByKind.dc !== undefined ? percent(assumptions.returnByKind.dc) : "—"}
            changed={changed(assumptions.returnByKind.dc, base.returnByKind.dc)}
            onChange={(v) => set({ returnByKind: { ...assumptions.returnByKind, dc: v / 100 } })}
            note={dcModel?.ret !== undefined ? `포털 흐름에서 역산한 값 ${percent(dcModel.ret)}` : "적립금이 없어 역산하지 못했습니다"}
          />

          <div className="flex flex-col gap-2 border-t border-dashed border-rule pt-3.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const list = saveScenario(`시나리오 ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`, assumptions);
                  setSaved(list[list.length - 1]?.name);
                }}
                className="flex-1 rounded-[9px] border-[1.5px] border-navy py-2 text-sm font-bold text-navy hover:bg-navy/5"
              >
                시나리오로 저장
              </button>
              <button type="button" onClick={sim.reset} className="rounded-[9px] border-[1.5px] border-rule px-3.5 py-2 text-sm font-medium text-ink-2 hover:bg-inset">
                기본값
              </button>
            </div>
            {saved && (
              <div className="text-[12px] text-good">
                「{saved}」 저장됨 —{" "}
                <Link href="/scenarios" className="font-bold underline">
                  시나리오에서 비교
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-[9px] bg-warn-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
            개시예정일은 포털의 <b>만 60세 가정</b>입니다 — 확정이 아니라 바꿀 수 있는 값입니다.
          </div>

          {insurance && (
            <div className="flex flex-col gap-1.5 rounded-[9px] border border-rule px-3.5 py-2.5 text-[12px] leading-relaxed text-ink-2">
              <div className="flex items-center gap-2">
                <GradeBadge grade="estimated" />
                <b className="text-ink">연금보험 수익률</b>
              </div>
              명목 고정 지급에 5년마다 보너스가 붙는 구조라, 적립금을 흐름에 맞추는 이 방식의 역산값을 액면대로 쓰지 않습니다.
            </div>
          )}

          <GuidePanel sections={dashboardGuide(snapshot, result)} intro="절벽·크레바스가 무엇이고, 이 숫자들이 포털 엑셀의 어디서 왔는지 — 내 수치를 채워 풀어 씁니다." />
        </aside>
      </div>
    </AppShell>
  );
}
