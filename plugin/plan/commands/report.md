---
description: PLM·Ouroboros 데이터로 기획 거버넌스 HTML 보고서를 작성(3사이클 검증 후 제출)
argument-hint: "[보고서 주제/범위] (생략 시 프로젝트 전체)"
---

# /report — 기획 거버넌스 보고서 (Planning Governance Report)

PLM(거버넌스 권위)과 Ouroboros(기획 메모리)에서 데이터를 수집해 **세계 최고 수준의 기획 거버넌스 HTML 보고서**를 작성한다. 청중은 **이해관계자·PM·아키텍트·승인권자**. 성격: 전략적·추적성 중심·의사결정 지원.

> 산출: `.ouroboros/docs/report/YYYYMMDD_{slug}_planning-report.html` (자기완결 HTML — 외부 의존 0, 오프라인 열람 가능).
> **반드시 3사이클 이상 검증 후 제출.** 추측·날조 수치 금지 — 모든 숫자는 수집 데이터에서 산출.

## 1단계 — 데이터 수집 (사실 기반)

바인딩: `.ouroboros/config/plm.json`의 `api_url`(절대 localhost 하드코딩 금지)·`project`, 토큰은 `.ouroboros/env/.env`의 `PLM_API_TOKEN`. 모든 HTTP는 `user-agent` 헤더 명시(Cloudflare 회피).

**PLM에서 (거버넌스 사실):**
- `/export?project=<p>` — 전 아티팩트(URS/UCS/SRS/SAD/ADR/Roadmap) + status + owner 관계. active(비-Superseded)만 집계.
- `/gates?project=<p>` — G1(SRS→URS derives_from)·G2(SAD→SRS refs)·G3 orphan.
- `/review-queue` — 승인 대기(needs_review) 산문.
- 추적성: SRS↔URS·SAD↔SRS·ADR↔SRS/SAD·Roadmap↔요구 관계를 역산해 **커버리지 매트릭스** 구성.
- 딥링크: 각 SRS/SAD의 `code_refs`(구현 위치) 유무로 **구현 연결률**.

**Ouroboros에서 (맥락·근거):**
- `memory_search`(scope 양쪽) — 이 프로젝트의 decision·domain-knowledge·gotcha·preference. `user_id`·`project_id`는 `.ouroboros/env/.env`.
- `knowledge_query` — 아키텍처 결정·도메인 개념 그래프.
- 보고서에 "왜 이렇게 결정됐나"의 근거로 인용(ADR과 교차).

**수집 검증**: 카운트(타입별 active 수)·게이트·orphan을 표로 먼저 정리. 로컬 문서 수와 PLM active 수가 일치하는지(드리프트 0) 확인 — 불일치 시 보고서 상단에 경고.

## 2단계 — 보고서 구성 (세계 최고 수준)

자기완결 HTML(inline CSS, 차트는 inline SVG/CSS 바 — 외부 CDN 금지). 다크 테마 기반·프린트 친화. 다음 섹션:

1. **Executive Summary** — 1화면: 프로젝트 건강 한 줄 평가 + 핵심 KPI 카드(요구 수·커버리지%·게이트 통과·미해결 orphan·승인 대기). 신호등(녹/황/적).
2. **요구 완전성** — URS→UCS→SRS 계층, 이해관계자 니즈 커버리지. 고아 요구(피참조 없는 SRS, outgoing 없는 비-URS).
3. **추적성 매트릭스** — URS×SRS×SAD×Code 교차표(연결=●, 미연결=○). 끊긴 사슬 강조. 양방향(요구→구현, 구현→요구).
4. **게이트 현황** — G1/G2/G3 시각화(통과율 바), orphan 목록, 승인 대기 큐.
5. **의사결정 로그(ADR)** — 결정·근거·영향(informs/supersedes 체인). Ouroboros decision 메모리와 교차.
6. **로드맵·진행** — Roadmap이 커버하는 요구, 진행/리스크.
7. **리스크 & 권고** — 미해결 orphan·드리프트·미승인·근거 부재 결정을 우선순위화한 액션 리스트.
8. **부록** — 데이터 출처·집계 기준·생성 일시·검증 로그(3사이클).

디자인 기준: 타이포 위계 명확, 여백, 색-코딩 상태, 표는 zebra+정렬, 차트는 접근성(색+레이블). 모바일/프린트 반응형. 헤더에 프로젝트명·생성일·범위.

## 3단계 — 3사이클 검증 (제출 전 필수)

각 사이클마다 보고서를 **렌더링(브라우저 또는 HTML 파싱)으로 실제 확인**하고 결함을 고친 뒤 다음 사이클로. 검증 로그를 부록에 기록.

- **C1 정확성**: 모든 수치를 수집 데이터와 교차 대조(날조 0). PLM active 카운트 == 표 숫자. 깨진 추적 링크·잘못된 관계 방향 점검.
- **C2 완전성·정합**: 모든 섹션 채워짐, 빈 표/플레이스홀더 0, 드리프트 경고 반영, HTML 유효성(태그 닫힘·인라인 CSS 동작), 차트 수치=표 수치.
- **C3 적대적 리뷰**: "최고 컨설팅펌 파트너라면 무엇을 지적할까?" — 서사 설득력, KPI가 의사결정에 실제로 답하는가, 시각 완성도, 군더더기 제거. 발견 사항 반영.
- 3사이클 중 결함이 나오면 사이클을 추가(최소 3, 결함 0까지).

## 4단계 — 제출
- 파일 저장 후 사용자에게: 경로 + 핵심 발견 3~5줄 + 검증 통과(C1~C3) 명시.
- current.md "산출물"에 보고서 링크 추가.

> 데이터 미수집/추측 절대 금지. PLM 미도달 시 그 사실을 보고하고 부분 보고서임을 명시.
