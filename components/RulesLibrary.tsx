"use client";
import { useState } from "react";
import library from "@/content/law/library.json";
import { RulesLawSearch } from "./RulesLawSearch";

/** "20260101" → "2026-01-01" */
function enforcedText(d: string): string {
  return /^\d{8}$/.test(d) ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : d;
}

/** M5-2 연금 법규 라이브러리 — 빌드 시점에 모은 정적 발췌 + opt-in 검색 */
export function RulesLibrary() {
  const [topicKey, setTopicKey] = useState(library.topics[0]?.key ?? "");
  const topic = library.topics.find((t) => t.key === topicKey) ?? library.topics[0];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-surface px-5.5 py-4">
      <h2 className="text-[14.5px] font-bold">
        연금 법규 라이브러리 <span className="text-xs font-normal text-ink-3">— 주제별 + 어떤 법령이든 검색</span>
      </h2>

      <RulesLawSearch />

      <div className="flex flex-wrap gap-2 text-[12.5px]" role="group" aria-label="법규 주제">
        {library.topics.map((t) => {
          const active = t.key === topic?.key;
          return (
            <button
              key={t.key}
              type="button"
              aria-pressed={active}
              onClick={() => setTopicKey(t.key)}
              className={`rounded-full border border-rule px-3 py-1 ${active ? "bg-inset font-bold text-ink" : "text-ink-2 hover:bg-inset"}`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {topic && (
        <div className="flex flex-col gap-3" aria-label={`${topic.label} 조문`}>
          {topic.articles.map((a) => (
            <article key={`${a.law}-${a.ref}`} className="border-l-[3px] border-navy bg-paper px-3.5 py-2.5 text-[13px] text-ink-2">
              <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="font-bold text-ink">
                  {a.law} {a.title}
                </h3>
                {a.enforced && <span className="num text-xs text-ink-3">시행 {enforcedText(a.enforced)}</span>}
                <a href={a.url} target="_blank" rel="noreferrer" className="ml-auto text-xs font-medium text-navy hover:underline">
                  법제처 원문 열기
                </a>
              </header>
              <div className="mt-1.5 max-h-[420px] overflow-x-auto overflow-y-auto">
                <p className="text-[12.5px] leading-relaxed whitespace-pre-wrap">{a.excerpt}</p>
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-3">주제별 발췌는 빌드 시점 수집(정적, {library.collectedAt}) · 대화형 질의는 Claude Desktop + korean-law-mcp</p>
    </div>
  );
}
