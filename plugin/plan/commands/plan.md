---
description: 기획 의도를 명확화해 PRD(미추적 싱글턴·대시보드 표시)와 Roadmap(추적 RM)을 산출한다
argument-hint: "{제품/기능 한 줄 설명}"
---

# /plan — 기획 착수

기획 의도를 정리하고 **PRD**(미추적 싱글턴·프로젝트당 1개·대시보드 표시)와 **Roadmap**(추적 RM)을 **JSON 아티팩트(`CODE.json`)** 로 만든다. 포맷 = `${CLAUDE_PLUGIN_ROOT}/templates/_ARTIFACT-JSON-FORMAT.md`(동형). 요구사항 발급은 `/requirement`. **markdown 생성 금지.**

> **선행: `/business`(선택)** — 시장·경쟁 근거(BS·MR·CA)를 먼저 확보하면 추측이 아닌 근거에서 출발한다. 디스커버리 아티팩트가 있으면 아래 **2.5 시장 근거 반영**이 자동 적용되고, 없으면 현행대로 진행(하위호환).

## 절차
1. **의도 명확화**: 인자가 모호하면 AskUserQuestion으로 문제/목표/페르소나/범위/성공지표 확인.
2. **PRD 작성**(미추적 싱글턴 · 프로젝트당 1개 · id=`PRD` 고정): `${CLAUDE_PLUGIN_ROOT}/templates/prd.json` 골격 → `.ouroboros/docs/product/PRD.json`. `created`/`updated`=현재 UTC. **BS와 동일 취급** — 대시보드에 표시되되 추적(관계·게이트·매트릭스)엔 미포함(서버가 non-trace 타입으로 처리). 저장 시 plm-sync hook이 자동 동기.
2.5. **시장 근거 반영**(선행 `/business` 디스커버리 존재 시): `.ouroboros/docs/product/`의 **BS·MR·CA `.json` 본문 로드**(존재하는 것만) → MR(수익화·시장 판정)·CA(차별화·경쟁)·BS(초기 가설)의 결론·차별화·수익화·성공지표를 PRD에 반영 + **역량 대비 차별점 재평가**(/business가 `/plan`으로 이관한 보류분 — 방어가능하나 우리 역량과 부합하는지) + PRD `relations` 래퍼 신설 `relates_to`에 **존재하는 디스커버리 아티팩트** 기재(예 `["MR","CA"]` · 비추적 소프트 관계 · 추적 게이트/매트릭스엔 무영향) + `state.tasks.dig.status = "done"`. **디스커버리 없으면 이 단계 생략(하위호환 — 현행대로 진행).**
3. **Roadmap 발급**(추적): 단계별로 `${CLAUDE_PLUGIN_ROOT}/templates/roadmap.json` 골격 → `.ouroboros/docs/roadmap/RM-NNN.json`. `relations.covers`에 관련 URS/SRS(없으면 비우고 후속 연결). `status: "Draft"`, `schemaVersion: 1`.
4. 본문 = `doc`(노드 어휘). 유효 JSON 자체 점검.
5. **작업 범위**: current.md "작업 범위"에 다음 산출 예정 요구사항 목록 기재.
6. current.md·state.json 갱신.

## 다음 단계
`/requirement` — PRD/Roadmap 근거로 URS·UCS·SRS 발급.

> 산출물은 기획 JSON 아티팩트만. 코드 구현은 이 워크플로우 범위 밖.
> 동기화: plm-sync hook이 `.json` 저장 시 PLM에 자동 upsert. 일괄은 `/plm-hub:sync`.


## 생성 계보 자동 기재 (P1-2 — ADR-028)

- PRD 발급/개정 시 근거가 된 BS들을 `relations.generated_from`에 기재(`{"generated_from":["BS-001",…]}`) — 기존 PRD에 새 BS를 병합하면 append.
- Roadmap(RM) 발급 시 `{"generated_from":["PRD"]}` 기재.
- relates_to(근거 참조)와 별개 — 계보는 "이 문서가 그로부터 만들어졌다"는 히스토리(그래프 계보 레인 표시, 게이트·매트릭스 무관).
