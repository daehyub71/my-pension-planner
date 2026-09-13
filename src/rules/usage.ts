/** F16 — 규칙 근거 화면의 재료. 규칙을 그룹으로 묶고, 어느 화면의 어느 수치에 쓰이는지 붙인다. */
import type { Grade, Rule, Rules } from "@/src/engine/model";
import { worstGrade } from "./loader";

export interface RuleGroup {
  key: string;
  label: string;
  screens: string[];
  rules: Rule[];
  grade: Grade;
}

/** id 접두어 → 그룹. 순서가 곧 화면의 표 순서다 */
const GROUPS: Array<{ key: string; label: string; prefixes: string[]; screens: string[] }> = [
  { key: "nps", label: "국민연금 조기·연기", prefixes: ["nps."], screens: ["대시보드", "시나리오", "가처분"] },
  { key: "tax", label: "연금 세금", prefixes: ["tax.", "private.", "severance."], screens: ["가처분", "대시보드 가처분", "시나리오", "목표"] },
  { key: "health", label: "건강보험료·피부양자", prefixes: ["health."], screens: ["가처분", "시나리오", "목표"] },
  { key: "portal", label: "포털 재현·모델", prefixes: ["portal.", "model."], screens: ["대시보드", "시나리오"] },
  { key: "risk", label: "절벽·크레바스", prefixes: ["risk."], screens: ["대시보드", "시나리오"] },
  { key: "goal", label: "목표·주택연금 가정", prefixes: ["goal.", "housing.", "inputs."], screens: ["목표", "시나리오", "데이터"] },
];

export function ruleGroups(rules: Rules): RuleGroup[] {
  return GROUPS.map((g) => {
    const members = rules.items.filter((r) => g.prefixes.some((p) => r.id.startsWith(p)));
    return { key: g.key, label: g.label, screens: g.screens, rules: members, grade: worstGrade(...members.map((r) => r.grade)) };
  }).filter((g) => g.rules.length > 0);
}

/** 해당 등급 규칙이 하나라도 있는 그룹의 화면들 (중복 제거) */
export function screensUsing(rules: Rules, grade: Grade): string[] {
  const out = new Set<string>();
  for (const g of ruleGroups(rules)) if (g.rules.some((r) => r.grade === grade)) for (const s of g.screens) out.add(s);
  return [...out];
}

export function reportSummary(rules: Rules): { total: number; verified: number; web: number; estimated: number; groups: number; groupsVerified: number; lastChecked: string } {
  const groups = ruleGroups(rules);
  const checked = rules.items.map((r) => r.checkedAt).filter((d): d is string => Boolean(d)).sort();
  return {
    total: rules.items.length,
    verified: rules.items.filter((r) => r.grade === "verified").length,
    web: rules.items.filter((r) => r.grade === "web").length,
    estimated: rules.items.filter((r) => r.grade === "estimated").length,
    groups: groups.length,
    groupsVerified: groups.filter((g) => g.grade === "verified").length,
    lastChecked: checked[checked.length - 1] ?? "",
  };
}
