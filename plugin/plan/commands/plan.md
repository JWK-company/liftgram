---
description: 기획 의도를 명확화해 PRD(비추적)와 Roadmap(추적 RM)을 산출한다
argument-hint: "{제품/기능 한 줄 설명}"
---

# /plan — 기획 착수

기획 의도를 정리하고 **PRD(비추적)** 와 **Roadmap(추적 RM)** 을 만든다. 요구사항 발급은 `/requirement`가 담당(여기선 ID 미발급 PRD + 추적 RM만).

## 절차
1. **의도 명확화**: 인자가 모호하면 AskUserQuestion으로 문제/목표/페르소나/범위/성공지표를 확인.
2. **PRD 작성** (비추적): `${CLAUDE_PLUGIN_ROOT}/templates/prd.md` 골격으로 `.ouroboros/docs/product/PRD.md` 생성. frontmatter `sync: false`, `created`/`updated`=현재 UTC.
3. **Roadmap 발급** (추적): 단계별로 `${CLAUDE_PLUGIN_ROOT}/templates/roadmap.md` 골격을 써서 `.ouroboros/docs/roadmap/RM-NNN.md` 생성. `covers`에 관련 URS/SRS(아직 없으면 비워두고 후속 `/requirement` 후 연결). `status: Draft`.
4. **작업 범위**: current.md "작업 범위"에 다음 산출 예정 요구사항 목록을 적는다.
5. current.md·state.json 갱신.

## 다음 단계
`/requirement` — PRD/Roadmap을 근거로 URS·UCS·SRS 발급.

> 산출물은 기획 문서(.md)만. 코드 구현은 이 워크플로우 범위 밖.
> 동기화: 거버넌스 백엔드는 **PLM**(plm-hub의 Edit hook `plm-sync`가 `.md` 저장 시 자동 upsert). 일괄은 `/plm-hub:sync`.
