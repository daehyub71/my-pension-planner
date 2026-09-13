import Link from "next/link";
import { GradeBadge } from "@/components/Badge";
import type { GoalResult } from "@/src/engine/goal";
import { eok } from "@/src/format";

/** 목표 모드 KPI 카드 한 장. 흰 카드가 기본, 갭은 부족(빨강)·충분(초록)으로 칠한다. */
function GoalCard({ label, value, note, tone = "plain" }: { label: React.ReactNode; value: React.ReactNode; note?: React.ReactNode; tone?: "plain" | "danger" | "good" }) {
  const box = { plain: "border-rule bg-surface", danger: "border-danger bg-danger-bg", good: "border-good bg-good-bg" }[tone];
  const head = { plain: "text-ink-2", danger: "font-bold text-danger", good: "font-bold text-good" }[tone];
  const num = { plain: "text-ink", danger: "text-danger", good: "text-good" }[tone];
  return (
    <div role="listitem" className={`flex flex-col gap-1 rounded-xl border px-6.5 py-5.5 ${box}`}>
      <div className={`text-[13.5px] ${head}`}>{label}</div>
      <div className={`font-title text-[34px] font-bold ${num} num`}>{value}</div>
      {note && <div className="text-[12.5px] text-ink-3">{note}</div>}
    </div>
  );
}

/** 천원 → 부호 붙은 억 표기 ("−1.6억"). 음수 기호는 전각 마이너스를 쓴다. */
function signedEok(v: number): string {
  return `${v < 0 ? "−" : "+"}${eok(Math.abs(v))}`;
}

/** F12 KPI 3장 — 필요 금융자산 · 현재 보유 · 갭. 계산은 엔진(computeGoal)이 끝낸 값을 받는다. */
export function GoalCards({ goal }: { goal: GoalResult }) {
  const missingAssets = goal.missing.includes("financialAssets");
  const crevasse = goal.crevasse ? ` · 크레바스 ${goal.crevasse.fromAge}~${goal.crevasse.toAge}세` : "";

  return (
    <div className="grid w-full max-w-[880px] grid-cols-3 gap-4.5" role="list" aria-label="목표 지표">
      <GoalCard
        label={
          <span className="inline-flex items-center gap-2">
            필요 금융자산 (은퇴 {goal.retireAge}세 시점)
            {goal.grade === "estimated" && <GradeBadge grade="estimated" />}
          </span>
        }
        value={eok(goal.requiredAtRetire)}
        note="연금 가처분이 채우고 남는 부족분 — 연금 수령액은 이미 뺐습니다"
      />

      {missingAssets || goal.held === undefined ? (
        <GoalCard
          label="현재 보유"
          value={<span className="text-ink-3">판정 불가</span>}
          note={
            <>
              <Link href="/data" className="font-medium text-navy hover:text-navy-deep">
                금융자산 입력하기
              </Link>{" "}
              · 연금계좌 적립금 제외
            </>
          }
        />
      ) : (
        <GoalCard
          label="현재 보유"
          value={eok(goal.held)}
          note={
            <>
              연금계좌 적립금 제외 ·{" "}
              <Link href="/data" className="font-medium text-navy hover:text-navy-deep">
                금융자산 고치기
              </Link>
            </>
          }
        />
      )}

      {goal.gap === undefined ? (
        <GoalCard label="갭" value={<span className="text-ink-3">판정 불가</span>} note={`보유 금융자산을 모르면 갭을 추정하지 않습니다${crevasse}`} />
      ) : (
        <GoalCard
          tone={goal.gap < 0 ? "danger" : "good"}
          label="갭"
          value={signedEok(goal.gap)}
          note={
            <span className="text-ink-2">
              {goal.depletionAge !== undefined ? (
                <>
                  이대로면 <b>{goal.depletionAge}세</b>에 자산 소진
                </>
              ) : (
                <>기대수명({goal.lifeExpectancy}세)까지 유지</>
              )}
              {crevasse}
            </span>
          }
        />
      )}
    </div>
  );
}
