# CLAUDE.md — my-pension-planner

워크스페이스 규칙(`../CLAUDE.md`)을 따르며, 아래는 이 프로젝트 고유 규칙이다.

**작업 시작 전 `docs/SPEC.md` → `docs/PLAN.md` → `docs/DESIGN.md` → `docs/TASKS.md` 순으로 읽는다.**

## 개요

금융감독원 통합연금포털 "내연금조회"의 확장판. 포털은 가정 하나를 갈아치우기만 하고
세금·건보료·절벽 경고가 없다. 개인 연금 데이터를 자동으로 끌어오는 API는 없으므로
**포털 엑셀(연령별 흐름) + 연금계약정보 PDF(적립금·개시일)를 수동 임포트**하고, 그 위에
**가정 파라미터화 · 시나리오 나란히 비교 · 실질가치 · 세금·건보료 · 절벽/크레바스 경고** 계층을 얹는다.

```
포털 엑셀 (연령별 흐름)  +  계약정보 PDF (적립금·개시일)  +  추가 입력 (은퇴 나이·지출·자산)
      │  임포터 (브라우저 안에서만 읽는다)
      ▼
   정규화 모델 (Account[] · Inputs)
      │  엔진 (순수 TS) ← rules/kr-2026.json
      ▼
   연도별 수령 · 실질가치 · 세후 · 건보료 · 가처분 · 절벽/크레바스
      │
      ├ 웹 6화면 (목표 · 대시보드 · 시나리오 · 가처분 · 데이터 · 규칙 근거)
      └ 계산기 MCP (개인 데이터 없이 엔진만 공개)
```

## 원칙 — 이 프로젝트의 가장 큰 리스크

**N1 로컬 우선.** 실데이터는 브라우저를 떠나지 않는다. 서버·DB·외부 API 호출이 없다.
정적 배포이며 네트워크 호출은 0이어야 한다. 유일한 예외는 법제처 조회이고, 그것도 사용자가
본인 키를 넣어 켠 경우만이다.

**N2 실데이터 git 금지.** 본인 엑셀·PDF는 `data/private/`에 두고 `.gitignore`가 막는다.
테스트·데모는 **합성 K씨**(`tests/fixtures/`)만 쓴다 — 실제 숫자와 스케일·형태가 달라야 한다.
유튜브 촬영 화면도 데모 모드다.

**N5 면책 문구 상시.** "투자 권유 아님 · 세제 단순화 모델 · 최종 확인은 포털·공단 원문" — 화면 하단에 항상.

## 3층 분리

| 층 | 위치 | 규칙 |
|----|------|------|
| 엔진 | `src/engine/` | **순수 TS.** React·DOM·브라우저 API·외부 라이브러리를 import하지 않는다. 여기가 TDD 대상이고 MCP가 공유하는 부분 |
| 임포터 | `src/importers/` | 파일 → 정규화 모델. xlsx·pdf 라이브러리는 여기서만 |
| UI | `app/` · `components/` | 화면. 계산하지 않는다 — 엔진을 부른다 |

- **규칙은 데이터다.** 세율·기준선·증감률을 코드에 박지 않는다. `rules/kr-2026.json`에 값·근거 조문·등급(조문대조/웹확인/추정)·확인일을 함께 둔다. 추정 등급 규칙이 쓰인 수치에는 화면에 "추정" 뱃지가 따라간다.
- **"80세"를 하드코딩하지 않는다.** 절벽은 전년 대비 낙폭 임계치로 찾는다 — 실측에서 76세·80세 두 곳이었다.
- **엑셀 합계 행이 곧 테스트다.** 임포터는 상품 합과 합계 행이 일치하는지 검증한다.

## 실행 · 검증 (M0 이후)

```bash
npm run dev                          # 로컬
npm run lint && npm test && npm run build   # 태스크·마일스톤 완료 시 전부 통과 필수
```

npm은 **이 디렉토리에서** — 워크스페이스 루트 오설치 사례 있음.

## 진행 상태

**SPEC v1.0 · PLAN v1.0 · DESIGN v1.0 확정 (2026-09-09)** — 결정 D1~D4·P1~P5·P-8 전부 확정, 시안 6장 합의.
**M0·M1·M3 완료 (2026-09-09) · M2 완료 (2026-09-13) · **M4·M5 완료 (2026-09-13)** · 46/53 (87%) · 다음은 M6.** 진도는 `docs/TASKS.md` 대시보드 참조.

### 새 세션이 이어받을 때

**⭐순서가 바뀌어 있다: M1 → M3 → M2 → M4** (2026-09-09 사용자 결정, PLAN §2 각주).
엔진이 선 뒤 세금보다 대시보드를 먼저 그려 실데이터가 화면에 뜨는 것을 봤다.

| 끝난 것 | 내용 |
|---------|------|
| **M0** | 임포터 — 엑셀(SheetJS) · 계약정보 PDF(pdfjs) · 입력 검증 · 스냅샷 저장소 · 규칙 JSON 뼈대 |
| **M1** | 엔진 — 국민연금 앵커 산식(실데이터 26개 값 오차 0) · 내재수익률 역산 · pass-through 재계산 · 실질가치 · 절벽/크레바스 |
| **M3** | 화면 — 공통 레이아웃 · SVG 3층 막대 · 데이터 화면 · 대시보드(명목/실질 토글 · KPI 4 · 가정 슬라이더 4) |
| **M4** | 화면 — 목표 모드(`goal.ts`) · 시나리오 비교(`metrics.ts`·`presets.ts`, 최대 3개) · 가처분 한 해 해부 · 주택연금 · 데이터 화면 원천 구성·과세대상 비율 입력 |
| **M5** | 규칙 근거 화면(검증 리포트·법규 라이브러리·법제처 검색 opt-in) · 재산분 지역보험료 · 데모 K씨 · 스냅샷 연도 비교 · 「이 화면 읽는 법」 · 추가 입력 불러오기/저장 |
| **M2** | 세금·건보료 — `tax.ts`(인출 순서 · 저율 · 1,500만 전액 · 종합/분리 자동 판정 · 수령한도 · 국민연금 과세) · `health.ts`(피부양자 · 지역보험료, 전부 추정) · `grade.ts`(등급 전파) · 규칙 29개 · 대시보드 가처분 토글 활성 |

**바로 다음 (M6 MCP·배포·README)** — `docs/TASKS.md` M6-1~M6-7. 배포 전 보안 점검 필수(워크스페이스 규칙).
- **네트워크 호출은 `src/lawSearch.ts`(법제처 검색, 사용자 키 opt-in)에만 둔다** (N1). 브라우저에 키가 없으면 **개발 서버에서만** `.env.local`의 `LAW_OC`를 쓴다(`next.config.ts`) — 배포 빌드에 키가 실리면 안 된다. 법제처 응답 링크에는 키가 들어 있으니 화면 링크로 쓰지 않는다. 법규 발췌를 다시 모으려면 `node scripts/collect_law.mjs` (키는 `.env.local`).
- **데모 K씨**: 저장된 스냅샷이 없으면 `src/demo/demo-k.snapshot.json`을 쓴다. 픽스처를 바꾸면 `UPDATE_DEMO=1 npx vitest run tests/demo`로 다시 만든다.
- **가정은 화면끼리 공유된다** (`mpp.assumptions.v1`, 조회기준일이 같을 때만). 시나리오 화면의 「기본」만은 늘 포털 가정이다.

**이어받기 전에 알아야 할 것**
- **세금·건보료는 모르는 입력을 보수적으로 채운다** (SPEC F3 예외, 2026-09-13): 원천 구성 없음 → 전액 과세 · 국민연금 과세대상 비율 없음 → 100% · 배우자 직장가입 모름 → 지역보험료. 전부 `estimated` + 경고. **입력 칸은 데이터 화면에 둔다**(사용자 결정 2026-09-13, M4-8 — 5번 시안 수정·합의 먼저).
- **재산분 지역보험료는 계산하지 않는다** (점수표 미수록, M5-7). **연금보험은 보험차익 비과세로 본다** — 조문 대조로 정정(연금계좌는 「연금저축」 명칭뿐). 요건 충족은 추정.
- **세법·건보 규칙은 korean-law-mcp 로 조문 대조했다 (2026-09-13, 22/29 verified).** 규칙을 고칠 때도 조문으로 확인한다: `LAW_OC` 는 `.env.local`(git 제외), CLI 사용법·MST 는 TASKS 트러블슈팅 기록. **R-2(건보 소득에 사적연금)** 는 조문 문언이 포함으로 읽혀 공단 확인이 필요하다 — 사용자 결정으로 **두 경우 모두 계산**(기본 미반영, 포함 시는 `metrics.healthIfPrivateCounted` + 대시보드 경고).
- **실데이터는 `data/private/`에 있고 git에서 막혀 있다.** 커밋 훅이 `100lifeplan_*`·`연금_*`·`*.xlsx`·`*.pdf`를 거부한다. 테스트는 실데이터가 있으면 쓰고 없으면 합성 K씨로 건너뛴다(`describe.skipIf`).
- **화면으로 확인하려면**: `npm run dev` → `localhost:3000/data` 에서 엑셀·PDF를 끌어다 놓고 은퇴 나이를 넣어 시작. localStorage 에 남아 다음부터는 바로 뜬다.
- **연금보험 내재수익률(7.30%)은 추정 등급**이다 — 명목 고정 + 5년 보너스라 성장연금 모델이 맞지 않는다. 대시보드에 뱃지로 표시돼 있다.
- 검증 대기: **R-2**(건보 소득에 사적연금) · **R-5 재산 점수표** · 국민연금 조기/연기 계수(web). R-1·R-4 는 해소(verified).
- `docs/영상19_업로드정보_편집본.md`는 **영상 작업 세션이 넣은 파일**이다 (한글 파일명 — 리포 규칙 위반). 코드 작업과 무관하니 건드리지 않고, 커밋하지도 않았다.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
