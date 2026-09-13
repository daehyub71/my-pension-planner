"use client";
import type { Assumptions, HousingAssumption } from "@/src/engine/model";
import { Slider } from "@/components/Slider";
import { GradeBadge, Chip } from "@/components/Badge";
import { percent } from "@/src/format";

export interface ScenarioEditorProps {
  label: string; // "C · 조기 60세"
  name: string;
  assumptions: Assumptions;
  /** 포털 가정 — 「바뀜」 표시와 국민연금 증감 기준 */
  base: Assumptions;
  baseMonthlySpend: number; // 만원 (Inputs)
  /** 국민연금 개시 나이에 따른 수령액 배율 — 엔진 함수로 계산해 넘긴다 */
  npsFactor: (startAge: number) => number;
  npsAgeRange: [number, number];
  /** 주택연금을 켤 때 채울 값 (프리셋 값) */
  housingDefault: HousingAssumption;
  /** 규칙의 자리표시 월액(원) — 이 값 그대로면 추정 뱃지 */
  housingPlaceholderWon: number;
  isPreset: boolean;
  dirty: boolean;
  message?: string;
  onChange: (name: string, assumptions: Assumptions) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** 시나리오 편집 패널 — 바꾸는 즉시 부모가 다시 계산한다 (N7) */
export function ScenarioEditor(p: ScenarioEditorProps) {
  const { assumptions: a, base } = p;
  const set = (patch: Partial<Assumptions>) => p.onChange(p.name, { ...a, ...patch });
  const retireYears = a.privateStart.dc?.years ?? a.privateStart.irp?.years ?? 20;
  const factor = p.npsFactor(a.npsStartAge);
  const spend = a.targetMonthlySpend ?? p.baseMonthlySpend;
  const housing = a.housing;
  const setHousing = (h: Partial<HousingAssumption>) => housing && set({ housing: { ...housing, ...h } });

  return (
    <aside aria-label="시나리오 편집" className="flex w-[290px] shrink-0 flex-col gap-[13px] rounded-xl border-[1.5px] border-navy bg-surface px-5 py-[18px]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-title text-base font-semibold">시나리오 편집</h2>
        <span className="truncate text-[12px] text-ink-3">{p.label}</span>
      </div>
      {p.dirty && (
        <div>
          <Chip tone="warn">저장 안 한 변경</Chip>
        </div>
      )}

      <label className="flex flex-col gap-[5px] text-[13px]">
        <span className="text-ink-2">이름</span>
        <input
          type="text"
          value={p.name}
          onChange={(e) => p.onChange(e.target.value, a)}
          className="rounded-lg border border-rule bg-paper px-3 py-[7px] font-bold text-ink focus:border-navy focus:outline-none"
        />
      </label>

      <Slider
        label="국민연금 개시"
        min={p.npsAgeRange[0]}
        max={p.npsAgeRange[1]}
        step={1}
        value={a.npsStartAge}
        display={`${a.npsStartAge}세${factor !== 1 ? ` (${factor > 1 ? "+" : "−"}${Math.round(Math.abs(factor - 1) * 1000) / 10}%)` : ""}`}
        changed={a.npsStartAge !== base.npsStartAge}
        onChange={(v) => set({ npsStartAge: v })}
      />

      <Slider
        label="퇴직연금 수령 기간"
        min={5}
        max={40}
        step={1}
        value={retireYears}
        display={`${retireYears}년`}
        changed={!same(a.privateStart.dc, base.privateStart.dc) || !same(a.privateStart.irp, base.privateStart.irp)}
        onChange={(v) =>
          set({
            privateStart: {
              ...a.privateStart,
              ...(base.privateStart.dc ? { dc: { age: a.privateStart.dc?.age ?? base.privateStart.dc.age, years: v } } : {}),
              ...(base.privateStart.irp ? { irp: { age: a.privateStart.irp?.age ?? base.privateStart.irp.age, years: v } } : {}),
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
        value={Number(((a.returnByKind.dc ?? 0) * 100).toFixed(1))}
        display={a.returnByKind.dc !== undefined ? percent(a.returnByKind.dc) : "—"}
        changed={a.returnByKind.dc !== base.returnByKind.dc}
        onChange={(v) => set({ returnByKind: { ...a.returnByKind, dc: v / 100 } })}
      />

      <Slider
        label="물가상승률"
        min={0}
        max={6}
        step={0.1}
        value={Number((a.inflation * 100).toFixed(1))}
        display={percent(a.inflation)}
        changed={a.inflation !== base.inflation}
        onChange={(v) => set({ inflation: v / 100 })}
      />

      <Slider
        label="월 지출"
        min={50}
        max={1000}
        step={10}
        value={spend}
        display={`${spend.toLocaleString("ko-KR")}만`}
        changed={spend !== p.baseMonthlySpend}
        onChange={(v) => set({ targetMonthlySpend: v === p.baseMonthlySpend ? undefined : v })}
        note="지금 돈 가치 · 필요 금융자산 계산에 쓰입니다"
      />

      <fieldset className="flex flex-col gap-2 rounded-[9px] border border-rule px-3 py-2.5 text-[13px]">
        <legend className="px-1">
          <label className="inline-flex items-center gap-1.5 font-medium text-ink-2">
            <input
              type="checkbox"
              checked={Boolean(housing)}
              aria-label="주택연금"
              onChange={(e) => set({ housing: e.target.checked ? { ...p.housingDefault } : undefined })}
              className="accent-navy"
            />
            주택연금
          </label>
        </legend>
        {housing ? (
          <>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-[12px] text-ink-2">
                개시 나이
                <input
                  type="number"
                  min={55}
                  max={100}
                  value={housing.startAge}
                  aria-label="주택연금 개시 나이"
                  onChange={(e) => e.target.value !== "" && setHousing({ startAge: Number(e.target.value) })}
                  className="num rounded-md border border-rule bg-paper px-2 py-1 text-[13px] font-bold text-ink"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[12px] text-ink-2">
                월 수령액(만원)
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={Math.round(housing.monthly / 10_000)}
                  aria-label="주택연금 월 수령액 (만원)"
                  onChange={(e) => e.target.value !== "" && setHousing({ monthly: Math.max(0, Number(e.target.value)) * 10_000 })}
                  className="num rounded-md border border-rule bg-paper px-2 py-1 text-[13px] font-bold text-ink"
                />
              </label>
            </div>
            {housing.monthly === p.housingPlaceholderWon && (
              <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
                <GradeBadge grade="estimated" />
                자리표시 월액 — 한국주택금융공사 조회액으로 바꾸세요
              </div>
            )}
          </>
        ) : (
          <div className="text-[11.5px] text-ink-3">켜면 개시 나이부터 월 수령액이 가처분에 더해집니다</div>
        )}
      </fieldset>

      <div className="border-t border-dashed border-rule pt-2.5 text-[12px] text-ink-3">
        바꾸는 즉시 왼쪽 차트·표가 갱신됩니다. 대시보드의 「시나리오로 저장」으로도 만들 수 있습니다.
        {p.isPreset && " 프리셋을 저장하면 새 시나리오로 저장됩니다."}
      </div>

      {p.message && <div className="text-[12px] text-good">{p.message}</div>}

      <div className="mt-auto flex gap-2">
        <button type="button" onClick={p.onSave} className="flex-1 rounded-[9px] bg-navy py-2.5 text-[13.5px] font-bold text-white hover:bg-navy-deep">
          저장
        </button>
        <button type="button" onClick={p.onDuplicate} className="rounded-[9px] border-[1.5px] border-rule px-3.5 py-2 text-[13.5px] font-medium text-ink-2 hover:bg-inset">
          복제
        </button>
        <button
          type="button"
          onClick={p.onDelete}
          disabled={p.isPreset}
          title={p.isPreset ? "프리셋은 지울 수 없습니다" : undefined}
          className="rounded-[9px] border-[1.5px] border-rule px-3.5 py-2 text-[13.5px] font-medium text-danger hover:bg-danger-bg disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          삭제
        </button>
      </div>
    </aside>
  );
}
