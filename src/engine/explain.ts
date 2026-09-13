/**
 * F21 — 「이 화면 읽는 법」. 정적 템플릿에 내 수치를 끼운다 (AI 해설은 2차).
 * 없는 것은 없다고 말한다 — 절벽이 없으면 절벽을 지어내지 않는다.
 */
import type { SimResult, Snapshot } from "./model";
import type { Breakeven } from "./metrics";

export interface GuideSection {
  key: string;
  title: string;
  body: string;
}

const man = (thousand: number) => `${Math.round(thousand / 10).toLocaleString("ko-KR")}만원`;
const eok = (thousand: number) => (thousand >= 100_000 ? `${(thousand / 100_000).toFixed(1)}억` : man(thousand));

export function dashboardGuide(snapshot: Snapshot, result: SimResult): GuideSection[] {
  const self = snapshot.accounts.filter((a) => a.owner === "self");
  const { cliffs, crevasse } = result.metrics;
  const nps = self.find((a) => a.kind === "national");
  const inflation = nps ? result.years.length > 0 : false;
  const lastRow = result.years[result.years.length - 1];
  const inflationRate = lastRow && lastRow.gross > 0 ? Math.pow(lastRow.gross / lastRow.real, 1 / Math.max(1, lastRow.year - result.baseYear)) - 1 : 0.031;

  const cliffText =
    cliffs.length === 0
      ? "전년 대비 20% 넘게 줄어드는 해가 없습니다 — 급격한 절벽은 없습니다."
      : cliffs
          .map((c) => `${c.age}세에 수령액이 전년보다 ${Math.round(c.dropRatio * 100)}% 줄어듭니다${c.endedAccountIds.length ? ` (${c.endedAccountIds.map((id) => self.find((a) => a.id === id)?.product ?? id).join(", ")} 종료)` : ""}`)
          .join(". ") + ". 막대 위 빨간 점선이 그 자리입니다.";

  const crevasseText = crevasse
    ? `은퇴(${snapshot.inputs.retireAge}세)부터 ${crevasse.toAge}세까지는 이후 본궤도 수령액의 ${Math.round(crevasse.depthRatio * 100)}% 수준입니다 — 이 ${crevasse.toAge - crevasse.fromAge + 1}년을 버틸 자금이 따로 필요합니다. 주황 음영 구간입니다.`
    : `은퇴(${snapshot.inputs.retireAge}세) 직후 수령액이 본궤도보다 크게 모자라는 구간(크레바스)은 없습니다.`;

  return [
    {
      key: "source",
      title: "숫자는 어디서 왔나",
      body: `통합연금포털 예시연금액 엑셀의 연령별 연간 수령액(천원)을 그대로 쌓았습니다. 조회기준일 ${snapshot.asOf} · 본인 계좌 ${self.length}개${nps?.monthlyAmount ? ` · 국민연금 예상 월액 ${man(nps.monthlyAmount / 1000)}은 계약정보 PDF` : ""}. 가정을 바꾸지 않으면 포털 값과 같습니다.`,
    },
    { key: "cliff", title: "절벽", body: cliffText },
    { key: "crevasse", title: "크레바스", body: crevasseText },
    {
      key: "real",
      title: "명목과 실질",
      body: `포털 숫자는 명목입니다 — 물가가 연 ${(inflationRate * 100).toFixed(1)}% 오르면 같은 돈의 가치가 해마다 줄어듭니다. 실질은 ${result.baseYear}년 돈 가치로 바꾼 값이라${inflation && lastRow ? ` ${lastRow.age}세 명목 ${eok(lastRow.gross)}은 실질로 ${eok(lastRow.real)}입니다` : " 먼 미래일수록 작아집니다"}.`,
    },
  ];
}

export interface ScenarioGuideInput {
  name: string;
  breakeven?: Breakeven;
  requiredAtRetire: number;
  dependentLossAge?: number;
}

export function scenariosGuide(columns: ScenarioGuideInput[]): GuideSection[] {
  const [base, ...others] = columns;
  const be = others
    .map((c) => {
      const b = c.breakeven;
      if (!b) return undefined;
      if (b.kind === "ahead-from") return `${c.name}는 누적 수령액이 ${b.age.toFixed(1)}세부터 ${base?.name ?? "기준"}을 앞섭니다 — 그보다 오래 살수록 유리합니다`;
      if (b.kind === "ahead-until") return `${c.name}는 ${b.age.toFixed(1)}세까지 앞서다가 뒤집힙니다 — 그 전에 떠날수록 유리합니다`;
      if (b.kind === "always-ahead") return `${c.name}는 끝까지 누적 수령액이 많습니다`;
      if (b.kind === "always-behind") return `${c.name}는 끝까지 누적 수령액이 적습니다`;
      // 수령액이 같다 — 지출 조정 시나리오면 필요 자산만 달라지고, 아니면 가정 변경이 반영되지 않은 것이다
      return base && Math.abs(c.requiredAtRetire - base.requiredAtRetire) > 0.5
        ? `${c.name}는 수령액이 같고 필요 금융자산만 다릅니다`
        : `${c.name}는 ${base?.name ?? "기준"}과 수령액이 같습니다 — 바꾼 가정이 이 데이터에서는 다시 계산되지 않았습니다`;
    })
    .filter(Boolean);
  const req = columns.map((c) => `${c.name} ${eok(c.requiredAtRetire)}`).join(" · ");
  const dep = columns.map((c) => `${c.name} ${c.dependentLossAge !== undefined ? `${c.dependentLossAge}세 탈락` : "유지 또는 판정 불가"}`).join(" · ");
  return [
    { key: "breakeven", title: "누적 손익분기", body: be.length ? `${be.join(". ")}. 정답은 없고 건강·크레바스 자금이 답을 정합니다.` : "비교할 시나리오를 둘 이상 체크하면 손익분기가 나옵니다." },
    { key: "required", title: "필요 금융자산", body: `연금 가처분이 채우고 남는 부족분을 은퇴 시점 돈으로 합친 값입니다 — ${req}. 작을수록 연금만으로 버틸 수 있습니다.` },
    { key: "dependent", title: "피부양자", body: `연 소득 2,000만원을 넘으면 피부양자에서 빠져 건보료가 붙습니다 — ${dep}. 국민연금을 늦추면 수령액이 커져 더 일찍 빠질 수 있습니다.` },
  ];
}
