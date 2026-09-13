/**
 * F20 — 계산기 MCP 도구의 입력 스키마. 엔진 타입(src/engine/model.ts)을 그대로 옮긴다.
 * 개인 데이터는 서버에 없다 — 호출하는 쪽이 계좌·입력을 넘기거나 useDemo 로 합성 K씨를 쓴다.
 */
import { z } from "zod";

const accountKind = z.enum(["national", "dc", "irp", "savings", "insurance", "db", "housing"]);
const yearMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const accountSchema = z.object({
  id: z.string().min(1),
  kind: accountKind,
  owner: z.enum(["self", "family"]),
  institution: z.string(),
  product: z.string(),
  joinDate: date.optional(),
  startDate: yearMonth.describe("연금 개시 연월 YYYY-MM"),
  balance: z.number().nonnegative().optional().describe("적립금(원)"),
  monthlyAmount: z.number().nonnegative().optional().describe("국민연금 예상 월액(원)"),
  asOf: date.optional(),
  flowByAge: z.record(z.string().regex(/^\d+$/), z.number()).describe("나이 → 연간 수령액(천원). 포털 엑셀 그대로"),
  sourceMix: z
    .object({ exempt: z.number(), deferredSeverance: z.number(), taxable: z.number(), deferredSeveranceTax: z.number().optional() })
    .optional()
    .describe("원천 구성(원) — 비과세·이연퇴직·과세"),
});

export const inputsSchema = z.object({
  birthYearMonth: yearMonth,
  retireAge: z.number().int().min(40).max(80).describe("소득이 끊기는 나이"),
  targetMonthlySpend: z.number().positive().describe("목표 월 지출(만원, 현재가치)"),
  lifeExpectancy: z.number().int().min(60).max(110),
  financialAssets: z.number().nonnegative().optional().describe("만원"),
  annualFinancialIncome: z.number().nonnegative().optional().describe("만원"),
  propertyTaxBase: z.number().nonnegative().optional().describe("재산세 과세표준(만원)"),
  spouseEmployed: z.boolean().optional(),
  npsTaxableRatio: z.number().min(0).max(1).optional(),
});

export const assumptionsSchema = z
  .object({
    inflation: z.number().min(0).max(0.2),
    returnByKind: z.record(accountKind, z.number()),
    npsStartAge: z.number().int().min(60).max(70),
    privateStart: z.record(accountKind, z.object({ age: z.number().int(), years: z.number().int().positive() })),
    housing: z.object({ startAge: z.number().int(), monthly: z.number().nonnegative() }),
    targetMonthlySpend: z.number().positive(),
  })
  .partial()
  .describe("바꿀 가정만 — 없으면 포털 가정");

/** registerTool 에 넘기는 모양 (zod raw shape) */
export const simulateInput = {
  accounts: z.array(accountSchema).optional().describe("통합연금포털 계좌들. useDemo 면 생략"),
  inputs: inputsSchema.optional(),
  asOf: date.optional().describe("조회기준일 — 실질가치 기준연도"),
  assumptions: assumptionsSchema.optional(),
  useDemo: z.boolean().optional().describe("true 면 합성 K씨 데모 데이터로 계산 (개인 데이터 불필요)"),
};

export const rulesInput = {
  grade: z.enum(["verified", "web", "estimated"]).optional(),
  prefix: z.string().optional().describe("예: health. / tax. / nps."),
};

/** 데모가 아니면 계좌·입력·조회기준일이 모두 있어야 한다 */
export const simulateInputSchema = z.object(simulateInput).refine((v) => v.useDemo || (v.accounts && v.inputs && v.asOf), {
  message: "useDemo 가 아니면 accounts · inputs · asOf 가 필요하다",
});

export const rulesInputSchema = z.object(rulesInput);

export type SimulateInput = z.infer<typeof simulateInputSchema>;
export type RulesInput = z.infer<typeof rulesInputSchema>;
