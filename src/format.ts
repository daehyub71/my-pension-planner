/** 화면 표기. 금액의 기본 단위는 포털과 같은 천원이다. */

/** 천원 → "5,836만" */
export function manwon(thousandWon: number): string {
  return `${Math.round(thousandWon / 10).toLocaleString("ko-KR")}만`;
}

/** 천원 → "1.83억" (억 미만은 만원으로) */
export function eok(thousandWon: number): string {
  const won = thousandWon * 1000;
  if (Math.abs(won) < 100_000_000) return manwon(thousandWon);
  return `${(won / 100_000_000).toFixed(2).replace(/\.?0+$/, "")}억`;
}

/** 원 → "2억 753만" */
export function wonReadable(won: number): string {
  const eokPart = Math.floor(won / 100_000_000);
  const manPart = Math.round((won % 100_000_000) / 10_000);
  if (eokPart > 0) return manPart > 0 ? `${eokPart}억 ${manPart.toLocaleString("ko-KR")}만` : `${eokPart}억`;
  return `${manPart.toLocaleString("ko-KR")}만`;
}

export function percent(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function signedPercent(v: number, digits = 0): string {
  return `${v > 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%`;
}

export const KIND_LABEL: Record<string, string> = {
  national: "국민연금",
  dc: "퇴직연금 DC",
  irp: "퇴직연금 IRP",
  db: "퇴직연금 DB",
  savings: "연금저축",
  insurance: "연금보험",
  housing: "주택연금",
};

export type Layer = "national" | "retire" | "private";

export const LAYER_LABEL: Record<Layer, string> = { national: "국민연금", retire: "퇴직연금", private: "개인연금" };
export const LAYER_COLOR: Record<Layer, string> = { national: "var(--nps)", retire: "var(--retire)", private: "var(--private)" };

export function layerOf(kind: string): Layer {
  if (kind === "national") return "national";
  if (kind === "dc" || kind === "irp" || kind === "db") return "retire";
  return "private";
}
