# 내 연금 시뮬레이터 (My Pension Planner)

[English](README.md) · **한국어**

**통합연금포털** 내연금조회에서 받은 파일로 시작하는 연금 시뮬레이터예요.
예시연금액 엑셀과 연금계약정보 PDF를 넣으면 시나리오를 나란히 비교하고, 실질가치·세금·건강보험료·가처분 소득을 보고, 수령액이 급격히 줄어드는 **절벽**과 은퇴 직후 **크레바스**를 경고해요.

**데이터는 브라우저를 떠나지 않아요.** 서버·데이터베이스·분석 도구가 없어요. 유일한 네트워크 호출은 본인 키를 등록했을 때만 쓰는 법령 검색이에요.

- 데모: **https://my-pension-planner.vercel.app** (가상 사례 K씨로 열려요)
- 상태: M0~M6 · 테스트 280개 이상 · 규칙을 현행 법 조문과 대조

> 투자 권유가 아니에요. 세제는 단순화한 모델이에요. 최종 확인은 통합연금포털·국민연금공단·국민건강보험공단 원문으로 해 주세요.

## 왜 만들었나

포털은 연령별 예상 수령액을 보여 주지만, 그 숫자는 물가 3.1%·만 60세 개시·상품별 수익률이라는 **가정 하나의 시나리오**예요. 가정을 바꿔 나란히 볼 수 없고, 실질가치·세금·건보료·수령액이 뚝 떨어지는 해를 알려 주지 않아요.

| 포털이 못 하는 것 | 이 앱 |
|---|---|
| 시나리오 비교 | 최대 3개를 나란히 — 지표표와 누적 손익분기 나이 |
| 실질가치 | 명목/실질 토글 (기준연도 = 조회기준일) |
| 인출 전략 | 국민연금 개시 60~70세, 퇴직연금 수령 기간, 수익률, 주택연금 |
| 세금·건보료 | 인출 순서, 저율 과세, 1,500만원 기준(종합 vs 16.5% 분리 자동 판정), 연금수령한도, 피부양자·지역보험료 |
| 위험 구간 경고 | 절벽(전년 대비 20% 이상 감소)과 크레바스(은퇴~본궤도 직전) |

## 화면

모든 스크린샷은 가상 사례 **K씨** 데모 데이터예요.

| 목표 | 대시보드 |
|---|---|
| ![목표 모드](docs/screenshots/goal.png) | ![대시보드](docs/screenshots/dashboard.png) |
| **시나리오** | **가처분** |
| ![시나리오](docs/screenshots/scenarios.png) | ![가처분](docs/screenshots/disposable.png) |
| **데이터** | **규칙 근거** |
| ![데이터](docs/screenshots/data.png) | ![규칙 근거](docs/screenshots/rules.png) |

## 기능

- **목표** — "은퇴 후 매달 얼마를 쓰고 싶으세요?" → 은퇴 시점 필요 금융자산 · 갭 · 자산 소진 나이
- **대시보드** — 연령별 월 수령액 3층 막대(국민·퇴직·개인), 명목/실질 · 세전/가처분, 절벽·크레바스 표시, 가정 슬라이더, "이 화면 읽는 법"
- **시나리오** — 프리셋(포털 가정·연기·조기·지출 조정·주택연금)과 저장한 시나리오 비교: 필요 자산, 가장 큰 절벽, 90세 실질 가처분, 누적 손익분기, 피부양자 탈락 나이
- **가처분** — 한 해의 해부: 세전 → 원천징수 → 5월 정산 → 건보료 → 가처분, 1,500만 기준선과 경계를 넘는 수령 기간
- **데이터** — 엑셀·PDF 끌어다 놓기(브라우저에서 읽음), 추가 입력, 계좌별 원천 구성, 스냅샷 내보내기/가져오기와 연도 비교
- **규칙 근거** — 세금·건보 규칙의 값·근거 조문·등급·확인일, 주제별 법령 발췌, 선택형 법령 검색
- **계산기 MCP** — 같은 엔진을 Claude Desktop에서 쓰는 MCP 서버 (개인 데이터를 저장하지 않음)

### 숫자의 등급

| 등급 | 뜻 |
|---|---|
| ✓ 조문 대조 | 현행 법 조문과 값을 대조함 ([korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp)) |
| ~ 웹 확인 | 여러 출처가 일치, 원문 대조 전 |
| ? 추정 | 가정이거나 해석이 남은 값 — 결과에 "추정" 뱃지가 붙음 |

규칙 33개 중 27개가 조문 대조 완료예요. 남은 쟁점은 **건강보험 소득에 사적연금이 들어가는지(R-2)** 예요. 조문 문언은 포함으로 읽히고 실무 설명은 미반영이라, 앱은 두 경우를 모두 계산해 차이를 보여 줘요.

## 기술 스택

| 층 | 선택 |
|---|---|
| 웹 | Next.js 16 (정적 export) · TypeScript strict · Tailwind CSS 4 |
| 엔진 | 순수 TypeScript (`src/engine/`), 의존성 0 — 웹과 MCP가 공유 |
| 임포터 | SheetJS(`xlsx`) · `pdfjs-dist`, 브라우저 전용 |
| 차트 | 직접 그린 SVG |
| 테스트 | Vitest · Testing Library |
| MCP | `@modelcontextprotocol/sdk` (stdio) · zod |
| 배포 | Vercel (정적, CSP `connect-src 'self' https://www.law.go.kr` 등 보안 헤더) |

## 설치와 실행

Node.js 20.9 이상이 필요해요.

```bash
git clone https://github.com/daehyub71/my-pension-planner.git
cd my-pension-planner
npm install
npm run dev          # http://localhost:3000 — 데모 모드로 시작
```

통합연금포털(fss.or.kr) → 내연금조회에서 **예시연금액 엑셀**과 **연금계약정보 PDF**를 받아 **데이터** 화면에 끌어다 놓으세요.

```bash
npm run lint
npm test             # 실데이터 테스트는 data/private/ 가 있을 때만 돈다
npm run build        # out/ 정적 산출물 + 네트워크 호출 검사
```

### 선택: 법령 검색 키

규칙 근거 화면의 법령 검색은 본인의 법제처 Open API 키([open.law.go.kr](https://open.law.go.kr))로 동작해요. 화면에서 키를 등록하면 이 브라우저에만 저장돼요. 로컬 개발 중에는 `.env.local`에 `LAW_OC=발급키`를 넣어도 되는데, **`next dev`에서만** 주입되고 배포 빌드에는 들어가지 않아요.

## 계산기 MCP (Claude Desktop)

```bash
cd mcp
npm install
npm run build
npm run smoke        # 서버를 띄워 simulate · rules 호출 확인
```

`claude_desktop_config.json`에 추가(절대 경로)한 뒤 Claude Desktop을 완전히 종료했다가 다시 켜요.

```json
{
  "mcpServers": {
    "my-pension-planner": {
      "command": "/node/절대/경로",
      "args": ["/프로젝트/절대/경로/my-pension-planner/mcp/dist/mcp/src/server.js"]
    }
  }
}
```

도구:

- `simulate` — 계좌·추가 입력(또는 `useDemo: true`) → 연도별 세전·실질·세금·건보료·가처분, 절벽·크레바스, 경고, 등급
- `rules` — 규칙 목록, `grade`·`prefix`로 거르기

질문 예시:

```
my-pension-planner로 데모 데이터 연금 시뮬레이션 해 줘
my-pension-planner 데모 데이터로 국민연금 65세 개시와 68세 개시를 90세 실질 가처분 기준으로 비교해 줘
my-pension-planner 규칙 중 추정 등급인 것만 보여 줘
```

처음 호출할 때 "도구 사용 허용" 창이 뜨면 허용을 누르세요. 답변 중간에 `simulate`·`rules` 호출 박스가 보이면 MCP가 쓰인 거예요.

## 구조

```
app/                 6개 화면 (목표·대시보드·시나리오·가처분·데이터·규칙 근거)
components/          차트와 화면 조각
src/engine/          순수 TS 엔진: 포털 재현·가정 반영·세금·건보료·목표·지표
src/importers/       포털 엑셀 / 계약정보 PDF 파서
src/store/           localStorage 스냅샷·시나리오·공유 가정
src/lawSearch.ts     네트워크를 쓸 수 있는 유일한 모듈 (법령 검색, 선택)
rules/kr-2026.json   세금·건보 규칙 — 근거 조문과 등급
content/law/         빌드 시점에 모은 법령 발췌 (scripts/collect_law.mjs)
mcp/                 계산기 MCP 서버
tests/               엔진·임포터·화면·MCP 계약 테스트 + 합성 픽스처
docs/                SPEC · PLAN · DESIGN · TASKS
```

## 개인정보

- 파일은 브라우저에서 읽고, 스냅샷은 `localStorage`에만 저장해요.
- 빌드 검사(`scripts/check_no_fetch.mjs`)가 `src/lawSearch.ts` 밖의 네트워크 API나 허용하지 않은 호스트가 산출물에 있으면 실패시켜요.
- 실데이터는 git에서 제외(`data/private/`)되고, 커밋·푸시 훅이 한 번 더 막아요.

## 라이선스

아직 라이선스를 정하지 않았어요. 모든 권리는 저작자에게 있어요.
