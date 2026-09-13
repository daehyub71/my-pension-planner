"use client";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Toggle } from "@/components/Toggle";
import { RulesReport } from "@/components/RulesReport";
import { RulesLibrary } from "@/components/RulesLibrary";
import { RULES } from "@/src/rules/loader";
import { reportSummary } from "@/src/rules/usage";

/** 6 규칙 근거 — 검증 리포트(M5-1) · 연금 법규 라이브러리(M5-2·M5-3) */
export default function RulesPage() {
  const [view, setView] = useState<"report" | "library">("report");
  const { lastChecked } = reportSummary(RULES);

  return (
    <AppShell right={`rules ${RULES.version} · 최종 확인 ${lastChecked}`}>
      <div className="flex flex-1 flex-col gap-4 p-6 px-9">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-title text-[22px] font-semibold">이 계산기는 무엇을 근거로 계산하는가</h1>
          <Toggle
            value={view}
            onChange={setView}
            options={[
              { value: "report", label: "검증 리포트" },
              { value: "library", label: "연금 법규 라이브러리" },
            ]}
          />
        </div>

        {view === "report" ? <RulesReport rules={RULES} /> : <RulesLibrary />}

        <aside className="flex flex-col gap-1.5 rounded-xl bg-inset px-5 py-4 text-[12.5px] text-ink-2" aria-label="면책">
          <h2 className="text-[13.5px] font-bold text-ink">면책</h2>
          <p>세제 단순화 모델 · 투자 권유 아님 · 최종 확인은 포털·공단 원문 기준 · rules {RULES.version} 버전, 연도 개정 시 변경 이력 공개</p>
        </aside>
      </div>
    </AppShell>
  );
}
