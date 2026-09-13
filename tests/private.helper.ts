/** 실데이터 전용 테스트의 기대값 — data/private/expected-real.json (git 제외). 공개 저장소에는 값이 없다. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const FILE = join(__dirname, "..", "data", "private", "expected-real.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const REAL: any = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : undefined;
export const hasRealExpected = REAL !== undefined;
