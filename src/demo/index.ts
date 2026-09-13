/** F19 — 데모 모드. 데이터가 없을 때 쓰는 합성 K씨 스냅샷 (실데이터와 스케일·상품 구성이 다르다). */
import type { Inputs, Snapshot } from "@/src/engine/model";
import raw from "./demo-k.snapshot.json";

/** 데모 추가 입력 — 시안의 K씨: 월 300만 · 은퇴 60세 · 95세 · 보유 3억 · 배우자 직장가입 */
export const DEMO_INPUTS: Partial<Inputs> = { retireAge: 60, targetMonthlySpend: 300, lifeExpectancy: 95, financialAssets: 30000, spouseEmployed: true };

export const DEMO_SNAPSHOT = raw as unknown as Snapshot;
