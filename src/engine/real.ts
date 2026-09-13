/** F6 — 실질가치. 포털은 명목만 보여 주므로 90세가 80세보다 커 보이는 착시가 생긴다. */

/** 기준연도 대비 할인계수. 미래일수록 작아진다. */
export function realFactor(year: number, baseYear: number, inflation: number): number {
  return 1 / Math.pow(1 + inflation, year - baseYear);
}

export function toReal(nominal: number, year: number, baseYear: number, inflation: number): number {
  return nominal * realFactor(year, baseYear, inflation);
}
