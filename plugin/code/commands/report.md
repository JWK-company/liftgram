---
description: PLM·Ouroboros 데이터로 엔지니어링 구현 HTML 보고서를 작성(3사이클 검증 후 제출)
argument-hint: "[보고서 주제/범위] (생략 시 코드베이스 전체)"
---

# /report — 엔지니어링 구현 보고서 (Engineering Implementation Report)

PLM(추적·Code 권위)과 Ouroboros(엔지니어링 메모리)에서 데이터를 수집해 **세계 최고 수준의 엔지니어링 구현 HTML 보고서**를 작성한다. 청중은 **엔지니어링 리드·개발팀·기술 인수 심사**. 성격: 기술적·구현 정합성·코드 건강·인사이트 중심.

> 산출: `.ouroboros/docs/report/YYYYMMDD_{slug}_engineering-report.html` (자기완결 HTML — 외부 의존 0, 오프라인 열람 가능).
> **반드시 3사이클 이상 검증 후 제출.** 추측·날조 수치 금지 — 모든 숫자는 수집 데이터·소스에서 산출.

## 1단계 — 데이터 수집 (사실 기반)

바인딩: `.ouroboros/config/plm.json`의 `api_url`(절대 localhost 하드코딩 금지)·`project`, 토큰은 `.ouroboros/env/.env`의 `PLM_API_TOKEN`. 모든 HTTP는 `user-agent` 헤더 명시.

**PLM에서 (구현 추적 사실):**
- `/export?project=<p>` — Code 아티팩트(active) + `realizes`(Code→SRS/SAD) + `loc`(path:line) + `build_state`(as_built 등).
- **구현 커버리지**: 각 SRS/SAD가 `implemented_by`(역산) Code를 가지는가 → **요구 대비 구현률**. Code 없는 SRS = 미구현 갭.
- **고아 Code**: 어떤 SRS/SAD도 realize 안 하는 Code(추적 끊김, G3).
- 소스 `@plm <CODE>` 주석 분포(파일·모듈별) — 추적 밀도.
- 최신 `/plm-hub:codescan` 결과(생성/수정/superseded/GC)로 코드↔PLM 정합 상태.

**Ouroboros에서 (엔지니어링 지식):**
- `memory_search`(scope 양쪽) — 이 프로젝트의 **gotcha(함정)·pattern(재사용 패턴)·insight(비자명 동작)**. `user_id`·`project_id`는 `.ouroboros/env/.env`.
- `knowledge_query` — 코드 구조·의존 그래프, 일반화된 패턴.
- 보고서에 "구현상 함정·검증된 패턴·기술 부채"의 근거로 인용.

**소스/빌드에서 (있으면):**
- 테스트 결과·빌드 산출(로그·CI)·모듈 규모(파일/심볼 수). 실측만 사용.

**수집 검증**: Code active 수·realizes 수·미구현 SRS 수·고아 Code 수를 표로 정리. 소스 `@plm` 주석 수와 PLM Code/realizes 정합(드리프트) 확인 — 불일치 시 상단 경고.

## 2단계 — 보고서 구성 (세계 최고 수준)

자기완결 HTML(inline CSS, 차트는 inline SVG/CSS — 외부 CDN 금지). 다크 테마·프린트 친화·코드 가독(monospace 스니펫). 다음 섹션:

1. **Executive Summary** — 구현 건강 한 줄 평가 + KPI 카드(요구 대비 구현률·Code 수·고아 Code·미구현 SRS·테스트 통과·빌드 상태). 신호등.
2. **구현 커버리지** — SRS/SAD별 구현 여부 매트릭스(요구→Code `loc` 딥링크). 미구현 갭 강조.
3. **코드↔요구 추적** — Code→realizes→SRS/SAD 그래프, `loc:path:line` 표. 고아 Code(추적 끊김) 목록.
4. **기술 인사이트** — Ouroboros gotcha/pattern/insight를 카테고리화(함정·패턴·아키텍처 원리). 각 항목에 영향·적용 가이드.
5. **기술 부채 & 리스크** — 미구현 요구·고아 Code·드리프트·검증 안 된 영역·반복 발생 함정을 우선순위화.
6. **품질 지표** — 테스트/빌드 실측(있으면), 모듈 규모·복잡도 신호.
7. **권고 액션** — 구현 갭 해소·추적 정합·부채 상환의 실행 가능 리스트(우선순위·노력 추정).
8. **부록** — 데이터 출처·집계 기준·codescan 상태·생성 일시·검증 로그(3사이클).

디자인 기준: 타이포 위계, 색-코딩 상태, 코드 스니펫 monospace+구문 강조 느낌, 추적 표는 정렬/필터 가능 인상, 차트 접근성(색+레이블). 반응형·프린트.

## 3단계 — 3사이클 검증 (제출 전 필수)

각 사이클마다 보고서를 **실제 렌더링/파싱으로 확인**하고 결함을 고친 뒤 다음 사이클로. 검증 로그를 부록에 기록.

- **C1 정확성**: 모든 수치를 PLM/소스와 교차 대조(날조 0). Code active 수·realizes·구현률이 데이터와 일치. `loc` 딥링크가 실제 파일:라인을 가리키는지 표본 검증.
- **C2 완전성·정합**: 모든 섹션 채워짐, 빈 표/플레이스홀더 0, 드리프트 경고 반영, HTML 유효성, 차트 수치=표 수치, 인사이트가 실제 Ouroboros 메모리에 근거(날조 인사이트 0).
- **C3 적대적 리뷰**: "최고 수준 프린시플 엔지니어·기술 인수 심사관이라면 무엇을 지적할까?" — 구현 갭이 솔직히 드러나는가, KPI가 기술 의사결정에 답하는가, 부채가 과소평가되지 않았는가, 시각·코드 가독 완성도. 발견 반영.
- 3사이클 중 결함이 나오면 사이클 추가(최소 3, 결함 0까지).

## 4단계 — 제출
- 파일 저장 후 사용자에게: 경로 + 핵심 발견 3~5줄(구현률·주요 갭·핵심 부채) + 검증 통과(C1~C3) 명시.
- current.md "산출물"에 보고서 링크 추가. 발견된 함정·패턴은 `/reflect`로 메모리 보완 권고.

> 데이터 미수집/추측 절대 금지. PLM 미도달 시 그 사실을 보고하고 부분 보고서임을 명시. 솔직한 갭 노출이 핵심(과대 포장 금지).
