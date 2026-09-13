# PLAN.md — my-pension-planner

> ✅ **상태: v1.0 확정** (2026-09-09, 사용자 승인). SPEC v1.0을 입력으로 쓴다. 변경은 SPEC → PLAN → DESIGN → TASKS 순으로 역추적한다.

## 1. 아키텍처

서버가 없다. 브라우저가 파일을 읽고, 계산하고, 저장한다. 빌드 산출물은 정적 파일뿐이다.

```
┌─ 브라우저 ────────────────────────────────────────────────────────────┐
│  파일 드롭 ──▶ src/importers/ ──▶ Snapshot ──▶ src/store/ (localStorage)   │
│                 xlsx.ts · pdf.ts · manual.ts · normalize.ts                │
│                                                                            │
│  Snapshot + Assumptions + Rules ──▶ src/engine/simulate() ──▶ SimResult    │
│                                        (순수 TS · 의존 0)                   │
│                                                                            │
│  SimResult ──▶ app/ 6 화면 (components/ · 직접 SVG)                        │
└────────────────────────────────────────────────────────────────────────────┘
                                   ▲
   mcp/ (stdio) ── 같은 src/engine/ 을 import ── Claude Desktop
```

### 1-1. 디렉토리

```
my-pension-planner/
├── app/                      Next.js App Router · output: "export"
│   ├── page.tsx              1 목표 모드 (F12)
│   ├── dashboard/            2 대시보드 (F14)
│   ├── scenarios/            3 시나리오 (F11)
│   ├── disposable/           4 가처분 (F10)
│   ├── data/                 5 데이터 (F1·F2·F3·F18)
│   └── rules/                6 규칙 근거 · 법규 라이브러리 (F16·F17)
├── components/               화면 조각 · 차트(SVG) · 슬라이더 · 뱃지
├── src/
│   ├── engine/               ★ 순수 TS. React·DOM·라이브러리 import 금지
│   │   ├── model.ts          Account · Inputs · Assumptions · SimResult 타입 (SPEC §6)
│   │   ├── portal.ts         F4  국민연금 앵커 산식 · 내재수익률 역산
│   │   ├── project.ts        F5  가정 → 계좌별 연도 흐름 (원본 pass-through / 모델 재계산)
│   │   ├── real.ts           F6  실질가치
│   │   ├── risk.ts           F7  절벽 · 크레바스
│   │   ├── tax.ts            F8  인출 순서 · 세율 · 1,500만 · 수령한도 · 국민연금 과세
│   │   ├── health.ts         F9  피부양자 · 지역보험료 (estimated)
│   │   ├── goal.ts           F12 필요 금융자산 · 갭 · 소진 나이
│   │   ├── metrics.ts        F11 시나리오 지표표 · 손익분기
│   │   ├── grade.ts          규칙 등급 전파 (어느 수치가 estimated인가)
│   │   └── index.ts          simulate(snapshot, assumptions, rules) → SimResult
│   ├── importers/            xlsx.ts(SheetJS) · pdf.ts(pdfjs-dist) · manual.ts · normalize.ts
│   ├── store/                snapshots.ts · scenarios.ts (localStorage, JSON 내보내기/가져오기)
│   ├── rules/                loader.ts · types.ts
│   └── demo/                 합성 K씨 Snapshot (F19)
├── rules/kr-2026.json        ★ 규칙 데이터 (F15)
├── content/law/              F17 주제별 조문 발췌 (정적 JSON, 빌드 시점 수집)
├── mcp/                      M6 · 별도 package.json · @modelcontextprotocol/sdk
├── tests/
│   ├── engine/  importers/  components/
│   └── fixtures/demo-k/      합성 xlsx(inlineStr 형식 재현) · 합성 PDF 텍스트 · 기대값 JSON
├── data/private/             ★ 본인 실데이터 (ignored)
├── scripts/                  make_fixture.ts · collect_law.ts · check_no_fetch.ts
└── docs/                     SPEC · PLAN · DESIGN · TASKS
```

### 1-2. 엔진 계약 (한 번 정하면 화면·MCP·테스트가 공유한다)

```ts
simulate(snapshot: Snapshot, assumptions: Assumptions, rules: Rules): SimResult

interface SimResult {
  rulesVersion: string;
  years: YearRow[];                 // 은퇴 나이 ~ 기대수명, 연 1행
  warnings: Warning[];              // cliff · crevasse · withdrawalLimit · dependentLoss · dbShell
  metrics: Metrics;                 // 필요 금융자산 · 절벽[] · 크레바스 · 90세 실질 가처분 · 피부양자 탈락 나이
  grades: Record<string, Grade>;    // metrics/필드별 최저 등급 (estimated가 섞이면 estimated)
}
interface YearRow {
  age: number; year: number;
  byAccount: Record<accountId, number>;      // 명목 세전(천원)
  gross: number; real: number;
  tax: { withholding: number; settlement: number; detail: TaxDetail };
  health: { premium: number; dependent: boolean; grade: Grade };
  disposable: number; disposableReal: number;
}
```

- **"포털 가정" 시나리오**는 `project.ts`가 원본 `flowByAge`를 그대로 통과시킨다 (SPEC F4 보완). 사용자가 가정을 하나라도 바꾸면 그 계좌만 모델로 재계산한다.
- 모델: 개시 나이까지 `balance × (1+r)^n`, 이후 `years`년 균등 인출(연금 현가 산식) + 물가 연동 옵션. 국민연금은 앵커 산식 + 조기/연기 계수.
- 세금은 **연도별·계좌별** 인출액에 인출 순서(F8 ①)를 적용한 뒤 합산한다. `sourceMix`가 없으면 전액 ③(세액공제+운용수익)으로 보고 그 수치에 `grade: estimated`.
- **M1 시점에는 `tax`·`health`·`disposable` 을 채우지 않는다** — 타입에서 선택 필드로 두고 M2가 채운다. 0으로 채우면 화면이 「세금 0원」을 사실처럼 그린다.
- **M2 구현 (2026-09-13)**: `health` 에 `basis`(employee·dependent·regional·unknown)를 더했다. `tax.withholding` = 저율 원천징수 + 이연퇴직 세금 + 국민연금 연말정산분, `tax.settlement` = 5월 정산(종합/분리 중 싼 쪽 − 이미 낸 몫, 환급이면 음수). 등급은 `grades.tax`·`health`·`disposable`(셋 중 최저). 대시보드 차트는 세금을 계좌별로 나누지 않고 층을 같은 비율로 줄여 그린다.
- **사적연금 재계산 모델 (2026-09-09 실측 확정)**: 계좌마다 ① 지급액 증가율 `g` 를 원본 흐름의 연 증가비에서 읽고(DC 4.50% · IRP 4.49% · 연금저축 5.12% · 연금보험 0%), ② 적립금과 지급 흐름을 잇는 **내재수익률 `r`** 를 현가 일치로 역산한다(각 6.19% · 4.88% · 5.39% · 7.32%). 개시·기간을 바꾸면 같은 `g`·`r` 로 **적립금을 정확히 소진하는 성장연금**을 다시 만든다. 적립금이 없는 계좌(PDF 미임포트·가족 행)는 재계산하지 않고 pass-through 로 두고 경고한다.
- **M4 (2026-09-13)**: `goal.ts`(필요 자산·갭·소진 나이, 실질) · `metrics.ts`(지표표·누적 손익분기) · `presets.ts`(5종·연기 탈락 나이) · `levers.ts`(1,500만 경계 수령 기간 역산). 가정 변경분은 `src/store/assumptions.ts`로 화면 간 공유(조회기준일 일치 시). SPEC §6 `Assumptions`에 `targetMonthlySpend?`(시나리오 지출 조정) 추가.
- 등급 전파는 값이 아니라 **메타데이터**다. 계산 결과에 `grade`를 붙이고 화면은 뱃지만 그린다.

### 1-3. 모듈 의존 방향

```
rules/kr-2026.json ─▶ src/rules ─▶ src/engine ◀─ src/demo
                                       ▲
src/importers ─▶ Snapshot ─────────────┤
                                       │
src/store ◀──────────────── app/ · components/ ──▶ 직접 SVG
                                       ▲
                                     mcp/
```

`src/engine`은 아무것도 import하지 않는다 (타입 제외). ESLint `no-restricted-imports`로 잠근다.

## 2. 마일스톤

| M | 범위 (SPEC ID) | 완료 기준 | 의존 |
|---|----------------|-----------|------|
| **M0** 스캐폴드 + 임포터 | 프로젝트 생성(Next 16·TS strict·Tailwind 4·Vitest) · `rules/kr-2026.json` 뼈대 · 합성 픽스처 생성 스크립트 · **F1** xlsx · **F2** pdf + 수동 · **F3** 입력 모델 · `store` | 합성 xlsx·실데이터(로컬) 모두 임포트, 합계 행 검증 통과, PDF 4계좌 재조립, `npm run lint && npm test && npm run build` 통과 | — |
| **M1** 엔진 핵심 | **F4** 포털 재현 · **F5** 가정 · **F6** 실질 · **F7** 위험 구간 · `simulate()` 뼈대 | 국민연금 재현 오차 0 · 내재수익률 기본값으로 원본 총액 ±2% · 실데이터에서 절벽 2곳(76·80세)과 크레바스 탐지 | M0 |
| **M2** 세금·건보료·규칙 | **F8** 세금 · **F9** 건보료(estimated) · **F15** 규칙 데이터 완성 · 등급 전파 | 세율 경계값 테스트(1,500만 ±1원 · 연차 10/11 · 나이 69/70/79/80) · 수령한도 위반 경고 · 피부양자 탈락 나이 · estimated 전파 테스트 | M1 |
| **M3** 화면 ① 데이터·대시보드 | **DESIGN 합의 선행** · 5 데이터 화면 · 2 대시보드(**F14**) · 공통 레이아웃·면책·차트 SVG | 실데이터 드롭 → 대시보드가 뜬다 · 명목/실질 토글 · 위험 구간 표시 · 컴포넌트 테스트 (**세전/가처분 토글은 M2 뒤에 채운다**) | **M1** |
| **M4** 화면 ② 시나리오·가처분·목표 | 3 시나리오(**F11**) · 4 가처분(**F10**) · 1 목표 모드(**F12**, 은퇴 나이 포함) · **F13** 주택연금 | 프리셋 5종 비교표 · 한 해 해부 · 갭·소진 나이 · 시나리오 저장/복제/삭제 | M3 |
| **M5** 규칙 근거·법규·스냅샷·데모·해설 | 6 규칙 근거(**F16**) · 법규 라이브러리(**F17**, 정적 발췌) · **F18** 스냅샷 내보내기·연도 비교 · **F19** 데모 · **F21** 해설 | 규칙 JSON 자동 렌더 · 데이터 없을 때 데모 · 스냅샷 JSON 왕복 | M4 |
| **M6** MCP·배포·README | **F20** `mcp/` · `check_no_fetch` 빌드 검사(N1) · 보안 점검 · Vercel 공개 · README 2종 | Claude Desktop에서 `simulate` 호출 성공 · 공개 URL에서 데모 동작 · 배포 전 보안 점검 통과 | M5 |

M3 착수 조건: DESIGN.md에 시안 6장 합의 기록. M3·M4는 화면마다 해당 아트보드 합의를 확인한다.

> **순서 변경 (2026-09-09, 사용자 결정)**: **M1 → M3 → M2 → M4** 로 간다.
> 엔진이 서면 세금보다 대시보드를 먼저 그려 실데이터가 화면에 뜨는 것을 본다.
> M3에서 가처분 토글은 자리만 두고 비활성이며 M2가 끝난 뒤 채운다 — 빈 값을 0으로 그리지 않는다.

## 3. 테스트 전략

| 층 | 방법 | 픽스처 |
|----|------|--------|
| 엔진 | vitest 순수 함수. **골든 테스트**: 국민연금 산식(월액·개시월 → 36개 값), 세율 경계값, 절벽·크레바스 탐지 | `tests/fixtures/demo-k/expected.json` — 합성 K씨의 기대 결과. 실데이터 기대값은 `data/private/expected.json`(ignored)에 두고 로컬에서만 `npm run test:private` |
| 임포터 | 합성 xlsx는 **`scripts/make_fixture.ts`가 inlineStr 형식으로 직접 zip을 만든다** — SheetJS로 쓰면 sharedStrings가 되어 실물 형식을 못 검증한다. PDF는 pdfjs 출력과 같은 모양의 텍스트 조각 배열을 픽스처로 | `demo-k.xlsx` · `demo-k.pdf.txt.json` |
| 화면 | Testing Library — 드롭 → 검증 결과 표시, 토글, 슬라이더 변경 시 재계산 호출, 뱃지 표시 | 데모 Snapshot |
| 계약 | 엔진 `SimResult` 스키마를 MCP 도구 스키마와 대조하는 테스트 (M6) | |
| 원칙 | `check_no_fetch.ts` — 빌드 산출물에 `fetch(`·`XMLHttpRequest`가 법제처 opt-in 모듈 밖에 없는지 (N1) · 커밋 훅이 실데이터 파일명 패턴을 거부 (N2) | |

TDD 순서는 워크스페이스 규칙대로 Red → Green → Refactor. 엔진·임포터는 테스트를 먼저 쓴다.

## 4. 리스크

| # | 리스크 | 대응 |
|---|--------|------|
| 1 | SheetJS가 `inlineStr`을 다르게 읽거나 숨김 열(A)을 건너뜀 | M0 첫 테스트가 실데이터로 A열·C열을 확인. 실패하면 자체 XML 파서로 교체(P1 대안, 200줄) |
| 2 | `pdfjs-dist` 워커가 정적 export에서 경로 문제 | `pdfjs-dist/legacy` + 워커를 `public/`에 복사. 실패해도 수동 폼(F2 폴백)이 있어 막히지 않는다 |
| 3 | 세법 규칙이 틀린 채 화면에 나간다 | 규칙마다 등급·근거·확인일. `web`·`estimated`는 뱃지. R-1·R-2·R-4·R-5는 TASKS에 조문 대조 태스크로 |
| 4 | 포털 사적연금 산식을 재현 못 해 "포털 가정" 시나리오가 어긋남 | 원본 흐름 pass-through(SPEC F4 보완). 모델은 가정 변경 시에만 |
| 5 | 실데이터 유출 | `.gitignore` + 커밋 훅 + 데모 합성. 유튜브는 데모 모드만 |
| 6 | 2013 이전 가입 특례(R-4)가 실데이터에 해당 | `joinDate < 2013-03-01`이면 연차 기산 6으로 — rules에 규칙으로, 테스트로 잠근다 |
| 7 | localStorage 5MB 한도 | Snapshot 하나가 수 KB. 스냅샷 20개 상한 + 내보내기 안내 |
| 8 | Next 정적 export에서 App Router 제약(동적 라우트 없음) | 6 라우트 모두 정적. 상태는 클라이언트 |

## 5. 앞으로 할 결정 (마일스톤 안에서)

- M1: 크레바스 "본궤도" 정의 — 이후 최대치의 70% (SPEC F7 기본값). 실데이터로 확인 후 조정.
- M2: 건보료 재산 점수 표를 rules에 넣을 범위 — 재산세 과표 구간표 전체 vs 상위 구간만.
- M5: 법규 발췌 수집 도구 — `korean-law-mcp`(Claude Desktop) 대화로 뽑아 정적 JSON에 넣는다. 빌드에 API 호출 없음.
