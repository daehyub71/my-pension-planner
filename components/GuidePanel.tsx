"use client";
import { useId, useState } from "react";
import type { GuideSection } from "@/src/engine/explain";

export interface GuidePanelProps {
  /** 엔진 템플릿(`dashboardGuide`·`scenariosGuide`)이 채운 문단 — 여기서는 그리기만 한다 */
  sections: GuideSection[];
  /** panel: 대시보드 가정 패널 안의 접이식 상자 · banner: 시나리오 표 아래 초록 띠 (첫 문단은 늘 보인다) */
  variant?: "panel" | "banner";
  /** 접혀 있을 때 보여 줄 한 줄 소개 (panel 전용) */
  intro?: string;
}

function SectionList({ id, sections }: { id: string; sections: GuideSection[] }) {
  return (
    <dl id={id} className="flex flex-col gap-2.5">
      {sections.map((s) => (
        <div key={s.key} className="flex flex-col gap-0.5">
          <dt className="font-bold text-ink">{s.title}</dt>
          <dd className="text-ink-2">{s.body}</dd>
        </div>
      ))}
    </dl>
  );
}

/** F21 「이 화면 읽는 법」 — 기본은 접혀 있고 버튼으로 펼친다 */
export function GuidePanel({ sections, variant = "panel", intro }: GuidePanelProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const toggleLabel = open ? "접기 ▴" : "펼치기 ▾";

  if (variant === "banner") {
    const [lead, ...rest] = sections;
    if (!lead) return null;
    return (
      <div role="note" aria-label="읽는 법" className="flex flex-col gap-2 rounded-r-[10px] border-l-[3px] border-good bg-good-bg px-[18px] py-[11px] text-[13px] leading-relaxed text-ink">
        <div className="flex items-start gap-3">
          <p className="flex-1">
            <b>읽는 법</b> — {lead.body}
          </p>
          {rest.length > 0 && (
            <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)} className="shrink-0 text-[12px] text-ink-3 hover:text-ink">
              {toggleLabel}
            </button>
          )}
        </div>
        {open && rest.length > 0 && <SectionList id={bodyId} sections={rest} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[9px] border-[1.5px] border-navy px-3.5 py-2.5 text-[12px] leading-relaxed">
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(!open)} className="flex items-center gap-2 text-left text-[13px] font-bold text-navy">
        <svg aria-hidden width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H3z" />
          <path d="M17 4h-6a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h6z" />
        </svg>
        이 화면 읽는 법
        <span className="ml-auto text-[11.5px] font-normal text-ink-3">{toggleLabel}</span>
      </button>
      {open ? <SectionList id={bodyId} sections={sections} /> : intro && <p className="text-ink-2">{intro}</p>}
    </div>
  );
}
