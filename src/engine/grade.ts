/** 규칙 등급 전파 — 등급은 값이 아니라 메타데이터다. 계산 결과에 붙이고 화면은 뱃지만 그린다 (PLAN §1-2). */
import type { Grade, Rules } from "./model";

/** 여러 등급 중 가장 낮은 것 — estimated 가 하나라도 섞이면 estimated */
export function worstOf(...grades: Grade[]): Grade {
  if (grades.includes("estimated")) return "estimated";
  if (grades.includes("web")) return "web";
  return "verified";
}

/** 규칙에서 값을 꺼낸다. 없으면 예외 — 조용한 기본값을 두지 않는다. */
export function ruleOf<T>(rules: Rules, id: string): { value: T; grade: Grade } {
  const r = rules.items.find((it) => it.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return { value: r.value as T, grade: r.grade };
}

/** 쓴 규칙들의 최저 등급 */
export function gradeOfRules(rules: Rules, ids: string[]): Grade {
  return worstOf(...ids.map((id) => ruleOf(rules, id).grade));
}

/** 가처분 = 흐름 − 세금 − 건보료 이므로 셋 중 가장 낮은 등급을 물려받는다. */
export function propagateGrades<T extends { flow: Grade; tax: Grade; health: Grade }>(grades: T): T & { disposable: Grade } {
  return { ...grades, disposable: worstOf(grades.flow, grades.tax, grades.health) };
}
