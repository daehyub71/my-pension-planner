"use client";
import { Fragment, useState } from "react";
import { GradeBadge } from "@/components/Badge";
import type { Rule, Rules } from "@/src/engine/model";
import { reportSummary, ruleGroups, screensUsing } from "@/src/rules/usage";
import { formatRuleValue, shortDate } from "./RulesValue";

/** 근거 조문 — 길면 두 줄로 접고 눌러서 편다 */
function SourceCell({ source }: { source: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      aria-expanded={open}
      title={open ? undefined : source}
      onClick={() => setOpen((o) => !o)}
      className={`text-left text-[13px] text-navy hover:underline ${open ? "" : "line-clamp-2"}`}
    >
      {source}
    </button>
  );
}

function RuleRows({ rule }: { rule: Rule }) {
  const estimated = rule.grade === "estimated";
  const bg = estimated ? "bg-warn-bg/40" : "";
  return (
    <>
      <tr className={`border-t border-rule align-top ${bg}`} data-rule={rule.id}>
        <td className="px-5 py-2.5">{rule.label ?? rule.id}</td>
        <td className="num px-3 py-2.5 whitespace-nowrap">{formatRuleValue(rule)}</td>
        <td className="max-w-[420px] px-3 py-2.5">
          <SourceCell source={rule.source} />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <GradeBadge grade={rule.grade} />
        </td>
        <td className="num px-5 py-2.5 text-ink-3">{shortDate(rule.checkedAt)}</td>
      </tr>
      {rule.note && (
        <tr className={bg}>
          <td colSpan={5} className="px-5 pb-2.5 pl-9 text-xs text-ink-3">
            {rule.note}
          </td>
        </tr>
      )}
    </>
  );
}

/** M5-1 검증 리포트 — rules JSON 에서 자동으로 그린다 */
export function RulesReport({ rules }: { rules: Rules }) {
  const summary = reportSummary(rules);
  const groups = ruleGroups(rules);
  const estimatedScreens = screensUsing(rules, "estimated");
  const rest = summary.total - summary.verified;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-stretch gap-3.5">
        <div className="flex min-w-[280px] flex-1 items-center gap-4 rounded-xl border border-good bg-good-bg px-5.5 py-4" aria-label="검증 요약">
          <div className="font-title num text-[30px] font-bold text-good">
            {summary.verified} / {summary.total}
          </div>
          <div className="text-[13.5px]">
            규칙 {summary.total}개 중 <b>{summary.verified}개 법령 조문 대조 완료</b> · 그룹 {summary.groups}개 중 {summary.groupsVerified}개 전부 대조
            <br />
            <span className="text-ink-2">
              나머지 {rest}개는 웹 확인 {summary.web} · 추정 {summary.estimated} — 아래 표에서 어떤 계산에 쓰이는지 확인
            </span>
          </div>
        </div>
        <ul className="flex w-full flex-col justify-center gap-1.5 rounded-xl border border-rule bg-surface px-5 py-3.5 text-[12.5px] text-ink-2 md:w-[360px]" aria-label="등급 범례">
          <li>
            <GradeBadge grade="verified" /> — 법제처 원문과 값 대조 (korean-law-mcp)
          </li>
          <li>
            <GradeBadge grade="web" /> — 복수 출처 일치, 원문 대조 전
          </li>
          <li>
            <GradeBadge grade="estimated" /> — 결과에 「추정」 뱃지가 따라감
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border border-rule bg-surface">
        <table className="w-full min-w-[860px] border-collapse text-left text-[13.5px]">
          <thead className="bg-inset text-[12.5px] text-ink-2">
            <tr>
              <th className="px-5 py-2.5 font-bold">규칙</th>
              <th className="px-3 py-2.5 font-bold">값</th>
              <th className="px-3 py-2.5 font-bold">근거 조문</th>
              <th className="px-3 py-2.5 font-bold">등급</th>
              <th className="px-5 py-2.5 font-bold">확인일</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="border-t border-rule bg-paper">
                  <th colSpan={5} scope="rowgroup" className="px-5 py-2 text-left font-normal">
                    <span className="mr-2 font-bold text-ink">{g.label}</span>
                    <GradeBadge grade={g.grade} />
                    <span className="ml-3 text-xs text-ink-3">쓰이는 화면: {g.screens.join(" · ")}</span>
                  </th>
                </tr>
                {g.rules.map((r) => (
                  <RuleRows key={r.id} rule={r} />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {estimatedScreens.length > 0 && (
          <p className="border-t border-rule bg-warn-bg px-5 py-2.5 text-[12.5px] text-warn">
            ? 추정 규칙이 쓰이는 화면: <b>{estimatedScreens.join(" · ")}</b> — 해당 수치에 추정 뱃지가 표시됩니다
          </p>
        )}
      </div>
    </div>
  );
}
