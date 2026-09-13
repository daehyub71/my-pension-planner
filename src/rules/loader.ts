import type { Grade, Rule, Rules } from "@/src/engine/model";
import raw from "@/rules/kr-2026.json";

const GRADES: readonly Grade[] = ["verified", "web", "estimated"];
const KINDS = ["law", "portal", "design"] as const;

/** JSON 이 규칙 파일 모양인지 확인한다. 빌드 시점 오류가 런타임까지 오지 않게 한다. */
export function parseRules(input: unknown): Rules {
  if (typeof input !== "object" || input === null) throw new Error("rules: 객체가 아니다");
  const obj = input as { version?: unknown; items?: unknown };
  if (typeof obj.version !== "string" || !obj.version) throw new Error("rules: version 이 없다");
  if (!Array.isArray(obj.items)) throw new Error("rules: items 가 배열이 아니다");
  const seen = new Set<string>();
  const items: Rule[] = obj.items.map((it, i) => {
    const r = it as Partial<Rule>;
    if (typeof r.id !== "string" || !r.id) throw new Error(`rules[${i}]: id 가 없다`);
    if (seen.has(r.id)) throw new Error(`rules: id 중복 ${r.id}`);
    seen.add(r.id);
    if (!("value" in r)) throw new Error(`rules[${r.id}]: value 가 없다`);
    if (!KINDS.includes(r.kind as (typeof KINDS)[number])) throw new Error(`rules[${r.id}]: kind 가 잘못됐다`);
    if (typeof r.source !== "string" || !r.source) throw new Error(`rules[${r.id}]: source 가 없다`);
    if (!GRADES.includes(r.grade as Grade)) throw new Error(`rules[${r.id}]: grade 가 잘못됐다`);
    return {
      id: r.id,
      label: typeof r.label === "string" ? r.label : undefined,
      value: r.value,
      kind: r.kind as Rule["kind"],
      source: r.source,
      grade: r.grade as Grade,
      checkedAt: r.checkedAt,
      note: r.note,
    };
  });
  return { version: obj.version, items };
}

export const RULES: Rules = parseRules(raw);

/** 규칙 값을 꺼낸다. 없으면 예외 — 조용히 기본값으로 대체하지 않는다. */
export function getRule<T>(rules: Rules, id: string): { value: T; grade: Grade } {
  const r = rules.items.find((it) => it.id === id);
  if (!r) throw new Error(`rule not found: ${id}`);
  return { value: r.value as T, grade: r.grade };
}

/** 여러 등급 중 가장 낮은 것 — estimated 가 하나라도 섞이면 estimated */
export function worstGrade(...grades: Grade[]): Grade {
  if (grades.includes("estimated")) return "estimated";
  if (grades.includes("web")) return "web";
  return "verified";
}
