"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ScenarioSparkline } from "@/components/ScenarioSparkline";
import { ScenarioTable, type ScenarioColumn } from "@/components/ScenarioTable";
import { GuidePanel } from "@/components/GuidePanel";
import { ScenarioEditor } from "@/components/ScenarioEditor";
import { useSnapshot, useSimulation } from "@/src/useSession";
import { deleteScenario, loadScenarios, saveScenario, updateScenario } from "@/src/store/scenarios";
import { npsAdjustFactor, scenariosGuide, simulate } from "@/src/engine";
import { presetScenarios } from "@/src/engine/presets";
import { scenarioMetrics } from "@/src/engine/metrics";
import type { Assumptions, Scenario } from "@/src/engine/model";
import { RULES, getRule } from "@/src/rules/loader";

/** 차트(스파크라인)와 비교 열의 상한 (DESIGN 3번 시안) */
const MAX_COMPARED = 3;
const CARD_COLORS = ["var(--nps)", "var(--retire)", "var(--private)"];
const DEFAULT_CHECKED = ["preset:base", "preset:delay", "preset:early"];

interface Item {
  id: string;
  letter: string;
  name: string;
  assumptions: Assumptions;
  preset: boolean;
}

type Draft = { name: string; assumptions: Assumptions };

function letterOf(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `#${i + 1}`;
}

function readSaved(): Scenario[] {
  try {
    return typeof localStorage === "undefined" ? [] : loadScenarios();
  } catch {
    return [];
  }
}

export default function ScenariosPage() {
  const { snapshot } = useSnapshot();
  const sim = useSimulation(snapshot);
  const [saved, setSaved] = useState<Scenario[]>(readSaved);
  const [checked, setChecked] = useState<string[]>(DEFAULT_CHECKED);
  const [selectedId, setSelectedId] = useState<string>("preset:base");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [capNote, setCapNote] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();

  const { base } = sim;
  // 시나리오의 「기본」은 늘 포털 가정이다 — 대시보드에서 바꾼 공유 가정(sim.result)을 쓰지 않는다
  const baseResult = useMemo(() => (snapshot && base ? simulate(snapshot, base, RULES) : undefined), [snapshot, base]);

  const presets = useMemo(() => (snapshot && base && baseResult ? presetScenarios(base, snapshot.inputs, RULES, baseResult) : []), [snapshot, base, baseResult]);

  // 칩 순서: 프리셋 5종 → 저장한 시나리오. 편집 중인 초안이 있으면 그 값으로 비교한다
  const items = useMemo<Item[]>(() => {
    const list = [
      ...presets.map((p) => ({ id: `preset:${p.key}`, name: p.name, assumptions: p.assumptions, preset: true })),
      ...saved.map((s) => ({ id: s.id, name: s.name, assumptions: s.assumptions, preset: false })),
    ];
    return list.map((it, i) => ({ ...it, letter: letterOf(i), ...drafts[it.id] }));
  }, [presets, saved, drafts]);

  // 체크된 시나리오만 계산한다 — 첫 열(칩 순서상 가장 앞)이 기준
  const compared = useMemo(() => {
    if (!snapshot || !base || !baseResult) return [];
    const picked = items.filter((it) => checked.includes(it.id));
    const runs = picked.map((it) => ({ item: it, result: it.id === "preset:base" && !drafts[it.id] ? baseResult : simulate(snapshot, it.assumptions, RULES) }));
    const [first] = runs;
    return runs.map((r, i) => ({
      ...r,
      metrics: scenarioMetrics(snapshot, r.item.assumptions, r.result, RULES, i > 0 && first ? { assumptions: first.item.assumptions, result: first.result } : undefined),
    }));
  }, [snapshot, base, baseResult, items, checked, drafts]);

  if (!snapshot || !base || !baseResult) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <h1 className="font-title text-2xl font-bold">아직 불러온 데이터가 없습니다</h1>
          <p className="max-w-md text-sm text-ink-2">통합연금포털에서 받은 엑셀과 PDF를 넣으면 가정을 바꾼 시나리오를 나란히 놓고 필요 자산·절벽·손익분기를 견줄 수 있습니다.</p>
          <Link href="/data" className="rounded-[10px] bg-navy px-7 py-3 text-[15px] font-bold text-white hover:bg-navy-deep">
            데이터 불러오기
          </Link>
        </div>
      </AppShell>
    );
  }

  const selected = items.find((it) => it.id === selectedId) ?? items[0]!;
  const original = selected.preset ? presets.find((p) => `preset:${p.key}` === selected.id) : saved.find((s) => s.id === selected.id);
  const dirty = Boolean(drafts[selected.id]) && JSON.stringify({ n: original?.name, a: original?.assumptions }) !== JSON.stringify({ n: selected.name, a: selected.assumptions });

  const nameOf = (id: string) => items.find((it) => it.id === id)?.name ?? id;

  const toggle = (id: string) => {
    if (checked.includes(id)) {
      setChecked(checked.filter((c) => c !== id));
      setCapNote(undefined);
      return;
    }
    if (checked.length >= MAX_COMPARED) {
      // 상한을 넘으면 가장 먼저 체크한 것을 푼다
      const [oldest, ...rest] = checked;
      setChecked([...rest, id]);
      setCapNote(`차트는 최대 ${MAX_COMPARED}개 — 「${nameOf(oldest!)}」 체크를 풀었습니다`);
      return;
    }
    setChecked([...checked, id]);
    setCapNote(undefined);
  };

  const select = (id: string) => {
    setSelectedId(id);
    setMessage(undefined);
  };

  const dropDraft = (id: string) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });

  const onSave = () => {
    if (selected.preset) {
      const list = saveScenario(selected.name, selected.assumptions);
      const created = list[list.length - 1]!;
      setSaved(list);
      dropDraft(selected.id);
      // 비교 중이던 프리셋이면 저장한 시나리오로 체크를 옮긴다
      if (checked.includes(selected.id)) setChecked(checked.map((c) => (c === selected.id ? created.id : c)));
      setSelectedId(created.id);
      setMessage(`「${created.name}」 새 시나리오로 저장됨`);
    } else {
      setSaved(updateScenario(selected.id, { name: selected.name, assumptions: selected.assumptions }));
      dropDraft(selected.id);
      setMessage(`「${selected.name}」 저장됨`);
    }
  };

  const onDuplicate = () => {
    // 편집 중인 값 그대로 복제한다 (프리셋도 가능)
    const list = saveScenario(`${selected.name} 사본`, selected.assumptions);
    setSaved(list);
    setSelectedId(list[list.length - 1]!.id);
    setMessage(`「${selected.name} 사본」 만듦`);
  };

  const onDelete = () => {
    if (selected.preset) return;
    setSaved(deleteScenario(selected.id));
    dropDraft(selected.id);
    setChecked(checked.filter((c) => c !== selected.id));
    setSelectedId("preset:base");
    setMessage(undefined);
  };

  const onNew = () => {
    const list = saveScenario(`새 시나리오 ${saved.length + 1}`, base);
    setSaved(list);
    setSelectedId(list[list.length - 1]!.id);
    setMessage(undefined);
  };

  const [minStart, maxStart] = getRule<[number, number]>(RULES, "nps.start_age_range").value;
  const early = getRule<number>(RULES, "nps.early_reduction_per_year").value;
  const defer = getRule<number>(RULES, "nps.deferral_increase_per_year").value;
  const housingPreset = presets.find((p) => p.key === "housing")?.assumptions.housing;
  const housingPlaceholder = getRule<number>(RULES, "housing.preset_monthly_krw").value;

  const cards = compared.slice(0, MAX_COMPARED);
  const baselineMetrics = compared[0]?.metrics;
  const allPoints = cards.flatMap((c) => c.metrics.sparkline);
  const yMax = allPoints.reduce((m, p) => Math.max(m, p.value), 0);
  const ageRange: [number, number] = [Math.min(...allPoints.map((p) => p.age)), Math.max(...allPoints.map((p) => p.age))];

  const columns: ScenarioColumn[] = compared.map((c) => ({
    letter: c.item.letter,
    shortName: c.item.name.replace(/\s*\(.*\)$/, ""),
    monthlySpend: c.item.assumptions.targetMonthlySpend ?? snapshot.inputs.targetMonthlySpend,
    metrics: c.metrics,
  }));

  return (
    <AppShell right={`가처분 · 실질 기준 · 규칙 ${baseResult.rulesVersion}`}>
      <div className="flex flex-1 gap-[18px] px-9 py-5">
        <section className="flex min-w-0 flex-1 flex-col gap-3.5">
          <h1 className="sr-only">시나리오 비교</h1>
          <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="시나리오 목록">
            {items.map((it) => {
              const on = checked.includes(it.id);
              const isFirst = compared[0]?.item.id === it.id;
              const tone = on ? (isFirst ? "border-navy bg-navy text-white" : "border-navy bg-surface text-navy") : "border-rule bg-surface text-ink-3";
              return (
                <span
                  key={it.id}
                  className={`inline-flex items-center overflow-hidden rounded-full border-[1.5px] text-[13px] ${tone} ${selectedId === it.id ? "ring-2 ring-navy/35 ring-offset-2 ring-offset-paper" : ""}`}
                >
                  <button type="button" aria-pressed={on} aria-label={`${it.letter} ${it.name} 비교`} onClick={() => toggle(it.id)} className="flex items-center self-stretch py-[5px] pr-1 pl-3">
                    <span aria-hidden className={`flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border-[1.5px] ${on ? "border-current" : "border-rule"}`}>
                      {on && (
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.8">
                          <path d="M4 10.4l4 4L16 6" />
                        </svg>
                      )}
                    </span>
                  </button>
                  <button type="button" onClick={() => select(it.id)} aria-current={selectedId === it.id ? "true" : undefined} className={`py-[5px] pr-3.5 pl-1.5 ${on ? "font-bold" : "font-medium"}`} title="편집 패널에서 열기">
                    {it.letter} · {it.name}
                    {drafts[it.id] && <span className="ml-1" aria-hidden>*</span>}
                  </button>
                </span>
              );
            })}
            <button type="button" onClick={onNew} className="rounded-full border-[1.5px] border-dashed border-navy px-3.5 py-[5px] text-[13px] font-bold text-navy hover:bg-navy/5">
              + 새 시나리오
            </button>
            <span className="ml-1 text-[12px] text-ink-3">저장 무제한 · 체크한 시나리오만 비교 (차트는 최대 3개)</span>
          </div>
          {capNote && (
            <div role="status" className="text-[12px] text-warn">
              {capNote}
            </div>
          )}

          {cards.length > 0 ? (
            <ul aria-label="시나리오 차트" className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {cards.map((c, i) => (
                <ScenarioSparkline
                  key={c.item.id}
                  letter={c.item.letter}
                  name={c.item.name.replace(/\s*\(.*\)$/, "")}
                  color={CARD_COLORS[i] ?? "var(--ink-2)"}
                  metrics={c.metrics}
                  baseline={i > 0 ? baselineMetrics : undefined}
                  yMax={yMax}
                  ageRange={ageRange}
                />
              ))}
            </ul>
          ) : (
            <ul aria-label="시나리오 차트" className="rounded-xl border border-dashed border-rule px-5 py-8 text-center text-sm text-ink-3">
              비교할 시나리오를 체크하세요
            </ul>
          )}

          {/* 가정을 바꿔도 다시 계산하지 못한 계좌 — 연기·조기 프리셋이 기본과 같게 나오는 이유를 알린다 */}
          {[...new Map(compared.flatMap((c) => c.result.warnings.filter((w) => w.code === "no-balance")).map((w) => [w.message, w])).values()].map((w) => (
            <div key={w.message} role="note" className="rounded-[10px] border border-warn/40 bg-warn-bg px-4 py-2.5 text-[13px] text-warn">
              ⚠ {w.message}
            </div>
          ))}

          <ScenarioTable columns={columns} spouseEmployed={snapshot.inputs.spouseEmployed} dependentLimitWon={getRule<number>(RULES, "health.dependent_income_limit").value} />

          {columns.length > 0 && (
            <GuidePanel
              variant="banner"
              sections={scenariosGuide(columns.map((c) => ({ name: c.shortName, breakeven: c.metrics.breakeven, requiredAtRetire: c.metrics.requiredAtRetire, dependentLossAge: c.metrics.dependentLossAge })))}
            />
          )}
        </section>

        <ScenarioEditor
          key={selected.id}
          label={`${selected.letter} · ${selected.name}`}
          name={selected.name}
          assumptions={selected.assumptions}
          base={base}
          baseMonthlySpend={snapshot.inputs.targetMonthlySpend}
          npsFactor={(age) => npsAdjustFactor(age, base.npsStartAge, early, defer)}
          npsAgeRange={[minStart, maxStart]}
          housingDefault={housingPreset ?? { startAge: getRule<number>(RULES, "housing.preset_default_age").value, monthly: housingPlaceholder }}
          housingPlaceholderWon={housingPlaceholder}
          isPreset={selected.preset}
          dirty={dirty}
          message={message}
          onChange={(name, assumptions) => setDrafts((d) => ({ ...d, [selected.id]: { name, assumptions } }))}
          onSave={onSave}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>
    </AppShell>
  );
}
