"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { GoalCards } from "@/components/GoalCards";
import { useSnapshot, useSimulation } from "@/src/useSession";
import { computeGoal, validateInputs } from "@/src/engine";
import type { Inputs } from "@/src/engine/model";
import { INPUT_LIMITS } from "@/src/engine/inputs";
import { RULES } from "@/src/rules/loader";
import { percent } from "@/src/format";

type EditableField = "targetMonthlySpend" | "retireAge";

function Headline() {
  return (
    <div className="flex flex-col gap-2.5 text-center">
      <div className="text-[13px] font-medium tracking-[0.14em] text-ink-3">북극성 질문</div>
      <h1 className="font-title text-[44px] font-bold leading-tight">
        은퇴 후, 매달 얼마를
        <br />
        쓰고 싶으세요?
      </h1>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="inline-block size-2.25 rounded-full bg-navy" />;
}

export default function GoalPage() {
  const { snapshot, store } = useSnapshot();
  const sim = useSimulation(snapshot);
  // 입력 중인 글자 — 검증을 통과해야 스냅샷에 쓴다. 통과 못 한 값도 칸에는 그대로 보여 준다.
  const [draft, setDraft] = useState<Partial<Record<EditableField, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<EditableField, string>>>({});

  const goal = useMemo(
    () => (snapshot && sim.assumptions && sim.result ? computeGoal(snapshot, sim.assumptions, sim.result, RULES) : undefined),
    [snapshot, sim.assumptions, sim.result],
  );

  if (!snapshot || !sim.assumptions || !goal) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 p-10 text-center">
          <Headline />
          <p className="max-w-lg text-sm text-ink-2">
            통합연금포털 엑셀과 계약정보 PDF를 불러오면, 월 지출과 소득이 끊기는 나이로 필요 금융자산과 갭을 계산합니다.
          </p>
          <Link href="/data" className="rounded-[10px] bg-navy px-7 py-3 text-[15px] font-bold text-white hover:bg-navy-deep">
            내 연금 데이터 불러오기
          </Link>
        </div>
      </AppShell>
    );
  }

  const { assumptions } = sim;

  const edit = (field: EditableField, text: string) => {
    setDraft((d) => ({ ...d, [field]: text }));
    const value = text.trim() === "" ? undefined : Number(text);
    const next: Partial<Inputs> = { ...snapshot.inputs, [field]: value };
    const checked = validateInputs(next);
    if (!checked.ok) {
      // 이 칸의 오류를 우선 보여 주고, 다른 칸 때문에 막혔으면 그 메시지를 보여 준다
      const own = checked.errors.find((e) => e.field === field) ?? checked.errors[0];
      setErrors((e) => ({ ...e, [field]: own?.message }));
      return;
    }
    setErrors((e) => ({ ...e, [field]: undefined }));
    store({ ...snapshot, inputs: checked.inputs });
  };

  const valueOf = (field: EditableField) => draft[field] ?? String(snapshot.inputs[field]);

  return (
    <AppShell right={`조회기준 ${snapshot.asOf}`}>
      <div className="flex flex-1 flex-col items-center justify-center gap-8.5 px-15 py-10">
        <Headline />

        <div className="flex flex-wrap items-stretch justify-center gap-4">
          <div className="flex flex-col justify-center gap-1 rounded-2xl border-[1.5px] border-rule bg-surface px-11 py-6.5">
            <label className="flex items-baseline gap-3.5">
              <span className="text-xl text-ink-2">월</span>
              <input
                type="number"
                inputMode="numeric"
                aria-label="은퇴 후 월 지출 (만원)"
                min={INPUT_LIMITS.targetMonthlySpend.min}
                max={INPUT_LIMITS.targetMonthlySpend.max}
                value={valueOf("targetMonthlySpend")}
                onChange={(e) => edit("targetMonthlySpend", e.target.value)}
                aria-invalid={Boolean(errors.targetMonthlySpend)}
                className="num w-[5ch] border-b-[3px] border-navy bg-transparent px-2.5 text-center font-title text-[56px] font-bold text-navy outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-xl text-ink-2">
                만원 <span className="text-sm text-ink-3">(지금 돈 가치)</span>
              </span>
            </label>
            {errors.targetMonthlySpend && (
              <div role="alert" className="text-[12.5px] text-danger">
                {errors.targetMonthlySpend}
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center gap-1 rounded-2xl border-[1.5px] border-rule bg-surface px-7 py-4.5">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-2">
                소득이 끊기는 나이 <span className="font-bold text-danger">필수</span>
              </span>
              <span className="flex items-baseline gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="소득이 끊기는 나이 (세)"
                  min={INPUT_LIMITS.retireAge.min}
                  max={INPUT_LIMITS.retireAge.max}
                  value={valueOf("retireAge")}
                  onChange={(e) => edit("retireAge", e.target.value)}
                  aria-invalid={Boolean(errors.retireAge)}
                  className="num w-[3ch] border-b-[3px] border-navy bg-transparent px-2 text-center font-title text-4xl font-bold text-navy outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-lg text-ink-2">세</span>
              </span>
            </label>
            {errors.retireAge ? (
              <div role="alert" className="text-xs text-danger">
                {errors.retireAge}
              </div>
            ) : (
              <div className="text-xs text-ink-3">크레바스가 여기서 시작됩니다</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-6.5 text-[13.5px] text-ink-2" aria-label="가정 요약">
          <span className="flex items-center gap-1.75">
            <Dot />
            연수익률 {percent(goal.assetReturn)}
          </span>
          <span className="flex items-center gap-1.75">
            <Dot />
            물가상승률 {percent(assumptions.inflation)}
          </span>
          <span className="flex items-center gap-1.75">
            <Dot />
            {goal.lifeExpectancy}세까지
          </span>
          <Link href="/dashboard" className="font-medium text-navy hover:text-navy-deep">
            가정 바꾸기
          </Link>
        </div>

        <GoalCards goal={goal} />

        <div className="flex items-center gap-3">
          <Link href="/scenarios" className="rounded-[10px] bg-navy px-7.5 py-3.25 text-[15px] font-bold text-white hover:bg-navy-deep">
            갭 메우는 방법 보기
          </Link>
          <Link href="/data" className="rounded-[10px] border-[1.5px] border-rule bg-surface px-6 py-3 text-[15px] font-medium text-ink-2 hover:bg-inset">
            내 연금 데이터 불러오기
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
