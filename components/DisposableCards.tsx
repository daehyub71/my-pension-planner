"use client";
import Link from "next/link";
import type { Metrics, YearRow } from "@/src/engine/model";
import type { ThresholdLever } from "@/src/engine/levers";
import { eok, manwon } from "@/src/format";

/** 1,500만원 기준선 게이지 — 세법 판정이라 명목 금액으로 그린다 */
export function ThresholdCard({ row, threshold, lever }: { row: YearRow; threshold: number; lever?: ThresholdLever }) {
  const d = row.tax?.detail;
  const taxable = d?.privateTaxable ?? 0;
  const over = d?.overThreshold ?? false;
  // 기준선이 막대의 88% 쯤에 오도록, 넘치면 막대를 늘린다 (표시용 축척)
  const scaleMax = Math.max(threshold / 0.88, taxable * 1.05);
  const fill = Math.min(100, (taxable / scaleMax) * 100);
  const marker = (threshold / scaleMax) * 100;
  const gap = Math.abs(taxable - threshold);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-rule bg-surface px-5.5 py-4.5" aria-label="1,500만원 기준선">
      <div className="text-[15px] font-bold">1,500만원 기준선</div>
      <div className="relative h-2.5 rounded-full bg-rule">
        <div className={`h-2.5 rounded-full ${over ? "bg-danger" : "bg-good"}`} style={{ width: `${fill}%` }} />
        <div className="absolute -top-[5px] h-5 w-[2.5px] bg-danger" style={{ left: `${marker}%` }} aria-hidden />
      </div>
      <div className="flex justify-between text-[12.5px] text-ink-2">
        <span>
          연금계좌 사적연금 <b className="num text-ink">{manwon(taxable)}</b>
        </span>
        <span className="font-bold text-danger">기준선 {manwon(threshold)}</span>
      </div>
      {over ? (
        <div className="rounded-lg bg-danger-bg px-3.5 py-2 text-[13px] text-ink">
          초과 <b className="num">{manwon(gap)}원</b> — 전액이 종합/분리 선택 대상
          {lever?.direction === "lengthen" && (
            <>
              {" "}· 수령 기간을 <b>{lever.years}년 늘리면</b> 기준선 아래로 내려옵니다
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg bg-good-bg px-3.5 py-2 text-[13px] text-ink">
          여유 <b className="num">{manwon(gap)}원</b>
          {lever?.direction === "shorten" && (
            <>
              {" "}— 수령 기간을 <b>{lever.years}년 줄이면</b> 넘어갑니다
            </>
          )}
        </div>
      )}
    </div>
  );
}

const METHOD_TEXT = { low: "저율 분리과세로 종결", separate: "분리과세(16.5%)가 유리", comprehensive: "종합과세가 유리" } as const;

/** 5월 종합소득세 정산 — 엔진 TaxDetail 을 그대로 옮긴다 (명목) */
export function MayCard({ row }: { row: YearRow }) {
  const t = row.tax;
  if (!t) {
    return (
      <div className="rounded-xl border border-rule bg-surface px-5.5 py-4.5 text-[13.5px] text-ink-2">
        <div className="text-[15px] font-bold text-ink">5월에 생기는 일</div>
        이 나이에는 세금 계산 결과가 없습니다.
      </div>
    );
  }
  const d = t.detail;
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rule bg-surface px-5.5 py-4.5 text-[13.5px]" aria-label="5월에 생기는 일">
      <div className="text-[15px] font-bold">5월에 생기는 일</div>
      <div className="flex justify-between">
        <span className="text-ink-2">종합소득 합산</span>
        <b className="num">{manwon(d.pensionIncomeTotal)}</b>
      </div>
      <div className="flex justify-between">
        <span className="text-ink-2">연금소득공제</span>
        <b className="num">−{manwon(d.pensionDeduction)}</b>
      </div>
      <div className="flex justify-between">
        <span className="text-ink-2">산출세액 − 기납부</span>
        {t.settlement > 0 ? (
          <b className="num text-danger">{manwon(t.settlement)} 추가 납부</b>
        ) : t.settlement < 0 ? (
          <b className="num text-good">{manwon(-t.settlement)} 환급</b>
        ) : (
          <b className="text-ink-2">없음</b>
        )}
      </div>
      <div className="text-[12.5px] text-ink-3">
        유불리 자동 판정: <b className="text-good">{METHOD_TEXT[d.method]}</b>
        {d.method !== "low" && (
          <span className="num">
            {" "}
            · 분리 {manwon(d.options.separate)} / 종합 {manwon(d.options.comprehensive)}
          </span>
        )}
      </div>
      <div className="text-[11.5px] text-ink-3">세법 판정은 명목 금액 기준입니다.</div>
    </div>
  );
}

/** 피부양자 배너 — 기준(basis)별 문구와 R-2(사적연금 건보 반영) 대안 경로 */
export function DependentBanner({ row, metrics, limit, delayLoss }: { row: YearRow; metrics: Metrics; limit: number; delayLoss?: { startAge: number; dependentLossAge?: number } }) {
  const h = row.health;
  let main: React.ReactNode;
  if (!h) main = "이 나이에는 건보료 계산 결과가 없습니다.";
  else if (h.basis === "dependent")
    main = (
      <>
        피부양자 경계까지 <b className="num">연 {manwon(Math.max(0, limit - h.dependentIncome))}</b> 남음
        {metrics.dependentLossAge !== undefined && (
          <>
            {" "}— <b>{metrics.dependentLossAge}세 탈락</b>이 예상됩니다
          </>
        )}
        .
        {delayLoss?.dependentLossAge !== undefined && delayLoss.dependentLossAge !== metrics.dependentLossAge && (
          <>
            {" "}국민연금 연기({delayLoss.startAge}세) 시나리오에서는 <b>{delayLoss.dependentLossAge}세 탈락</b>이 예상됩니다.
          </>
        )}
      </>
    );
  else if (h.basis === "regional")
    main =
      metrics.dependentLossAge !== undefined ? (
        <>
          <b>{metrics.dependentLossAge}세에 피부양자 탈락</b> — 이후 지역보험료를 냅니다.
        </>
      ) : (
        "피부양자가 아니라 지역보험료를 냅니다."
      );
  else if (h.basis === "unknown")
    main = (
      <>
        배우자 직장가입 여부를 몰라 <b>판정 불가</b> — 지역보험료로 보수적으로 추정했습니다.{" "}
        <Link href="/data" className="text-navy underline">
          데이터에서 입력
        </Link>
      </>
    );
  else main = "은퇴 전 — 직장가입";

  const alt = metrics.healthIfPrivateCounted;
  const altEarlier = alt?.dependentLossAge !== undefined && (metrics.dependentLossAge === undefined || alt.dependentLossAge < metrics.dependentLossAge);
  const showAlt = alt && (altEarlier || alt.extraPremiumTotal > 0);

  return (
    <div className="flex flex-col gap-1.5 rounded-r-[10px] border-l-[3px] border-warn bg-warn-bg px-4 py-3 text-[13px] text-ink" aria-label="피부양자">
      <div>{main}</div>
      {showAlt && alt && (
        <div className="text-[12.5px] text-ink-2">
          사적연금이 건보 소득에 들어가면
          {altEarlier && <> <b>{alt.dependentLossAge}세에 피부양자 탈락</b></>}
          {alt.extraPremiumTotal > 0 && (
            <>
              {altEarlier ? "," : ""} 건보료가 최대 <b className="num">월 {manwon(alt.extraPremiumMaxMonthly)}</b> (평생 {eok(alt.extraPremiumTotal)}) 늘어납니다
            </>
          )}
          . (R-2)
        </div>
      )}
    </div>
  );
}
