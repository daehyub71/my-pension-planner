/**
 * 데이터 모델 (SPEC §6). 엔진·임포터·화면·MCP가 전부 이 타입을 공유한다.
 * 금액 단위: flowByAge 는 포털 엑셀 그대로 천원, balance·monthlyAmount 는 원.
 */

export type AccountKind = "national" | "dc" | "irp" | "savings" | "insurance" | "db" | "housing";
export type Owner = "self" | "family";
export type Grade = "verified" | "web" | "estimated";

/** 계좌별 원천 구성(원) — 세법 인출 순서(F8 ①)에 쓴다. 없으면 전액 taxable 로 보고 estimated. */
export interface SourceMix {
  exempt: number; // ① 세액공제 받지 않은 납입액 → 비과세
  deferredSeverance: number; // ② 이연퇴직소득 → 퇴직소득세 감면
  taxable: number; // ③ 세액공제 납입액 + 운용수익 → 연금소득세
  /** 이연퇴직소득세(원) — IRP 화면에 표시된다. 없으면 ②를 ③으로 보고 estimated */
  deferredSeveranceTax?: number;
}

export interface Account {
  id: string;
  kind: AccountKind;
  owner: Owner;
  institution: string; // 전각공백 제거
  product: string;
  joinDate?: string; // YYYY-MM-DD (PDF)
  startDate: string; // YYYY-MM (엑셀 E열. 월이 없으면 -01 + 경고)
  balance?: number; // 적립금(원, PDF). 국민연금은 없음
  monthlyAmount?: number; // 국민연금 예상 월액(원) — 앵커
  asOf?: string; // 조회기준일 YYYY-MM-DD
  /** 연령 → 연간 수령액(천원). 포털 원본. 연령 = 그 나이가 되는 달력 연도 (birthYear + age) */
  flowByAge: Record<number, number>;
  sourceMix?: SourceMix;
}

export interface Inputs {
  birthYearMonth: string; // YYYY-MM (엑셀 row 1)
  retireAge: number; // 소득이 끊기는 나이 — 필수 (D3)
  targetMonthlySpend: number; // 현재가치, 만원
  lifeExpectancy: number; // 기본 95
  financialAssets?: number; // 만원
  annualFinancialIncome?: number; // 만원
  propertyTaxBase?: number; // 만원
  spouseEmployed?: boolean;
  npsTaxableRatio?: number; // 0~1
}

export interface HousingAssumption {
  startAge: number;
  monthly: number; // 원
}

export interface Assumptions {
  inflation: number; // 기본 0.031 (포털)
  returnByKind: Partial<Record<AccountKind, number>>; // 내재수익률 역산값이 기본
  npsStartAge: number; // 60~70
  privateStart: Partial<Record<AccountKind, { age: number; years: number }>>;
  housing?: HousingAssumption;
  /** 시나리오의 「지출 조정」 — 없으면 Inputs.targetMonthlySpend (만원, 현재가치) */
  targetMonthlySpend?: number;
}

export interface Scenario {
  id: string;
  name: string;
  assumptions: Assumptions;
  createdAt: string;
}

/** 임포트 경고 — 화면에 한 줄씩 보여준다 */
export interface ImportWarning {
  code: "db-shell" | "start-month-missing" | "pdf-unmatched" | "family-row";
  message: string;
  accountId?: string;
}

export interface Snapshot {
  asOf: string; // 조회기준일 (PDF) 또는 임포트 일자
  accounts: Account[];
  inputs: Inputs;
  rulesVersion: string;
  warnings: ImportWarning[];
  /** 합성 K씨 데모 스냅샷이면 true (F19) — 화면에 「데모」 뱃지 */
  demo?: boolean;
}

export interface Rule {
  id: string;
  /** 화면 표시용 이름 (규칙 근거 화면) */
  label?: string;
  value: unknown;
  /** law = 법령·세법 / portal = 포털 실측 가정 / design = 이 프로젝트의 설계값 */
  kind: "law" | "portal" | "design";
  source: string;
  grade: Grade;
  checkedAt?: string;
  note?: string;
}

export interface Rules {
  version: string;
  items: Rule[];
}

/** 엑셀 유형 코드 → AccountKind. 퇴직(2)·개인(1)은 상품명으로 세분한다 */
export const KIND_BY_PORTAL_CODE: Record<string, "national" | "dc" | "savings"> = {
  "3": "national",
  "2": "dc",
  "1": "savings",
};

// ── 시뮬레이션 결과 (PLAN §1-2) ──

export type SimWarningCode =
  | "cliff"
  | "crevasse"
  | "no-balance"
  | "data-ends"
  | "nps-shift"
  | "model-mismatch"
  | "withdrawal-limit"
  | "dependent-loss"
  | "tax-assumption"
  | "health-unknown";

export interface SimWarning {
  code: SimWarningCode;
  message: string;
  accountId?: string;
  age?: number;
}

/** 한 해 세금 해부 (천원). 「한 해 해부」 화면(F10)이 그대로 그린다. */
export interface TaxDetail {
  exemptWithdrawn: number; // ① 비과세 인출
  severanceWithdrawn: number; // ② 이연퇴직소득 인출
  privateTaxable: number; // ③ 연금소득세 대상 — 1,500만 판정 대상
  npsTaxable: number; // 국민연금 × 과세대상 비율
  severanceTax: number;
  lowRate: number;
  overThreshold: boolean;
  method: "low" | "separate" | "comprehensive";
  options: { separate: number; comprehensive: number }; // 이연퇴직 세금 제외
  pensionIncomeTotal: number; // 종합과세로 합산할 때의 연금소득 (국민연금 과세분 + ③)
  pensionDeduction: number; // 그때의 연금소득공제
}

export type HealthBasis = "employee" | "dependent" | "regional" | "unknown";

export interface YearRow {
  age: number;
  year: number;
  byAccount: Record<string, number>; // 천원, 명목 세전
  gross: number;
  real: number;
  /** 천원. withholding = 저율·이연퇴직·국민연금 연말정산, settlement = 5월 정산(환급이면 음수) */
  tax?: { withholding: number; settlement: number; detail: TaxDetail };
  /** premium 은 연 보험료(천원). 연금 때문에 붙는 몫만 — 은퇴 전 직장 보험료는 넣지 않는다 */
  health?: { premium: number; dependent: boolean; basis: HealthBasis; grade: Grade; dependentIncome: number };
  disposable?: number;
  disposableReal?: number;
}

export interface Metrics {
  peakAge: number;
  peakGross: number;
  cliffs: Array<{ age: number; dropRatio: number; endedAccountIds: string[] }>;
  crevasse?: { fromAge: number; toAge: number; depthRatio: number };
  lastRealGross: number;
  accountCount: number;
  /** 배우자 직장가입일 때 피부양자를 처음 잃는 나이. 판정 불가거나 잃지 않으면 없다 */
  dependentLossAge?: number;
  /** R-2 — 사적연금이 건보 소득에 들어간다고 볼 때. 기본 경로(미반영)와 나란히 보여 주려고 따로 계산한다 (천원) */
  healthIfPrivateCounted?: { dependentLossAge?: number; extraPremiumTotal: number; extraPremiumMaxMonthly: number };
}

export interface SimResult {
  rulesVersion: string;
  baseYear: number;
  years: YearRow[];
  warnings: SimWarning[];
  metrics: Metrics;
  grades: Record<string, Grade>;
}
