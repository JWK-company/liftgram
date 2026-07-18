---
description: 추적 대상 요구사항(URS·UCS·SRS)을 ID·JSON·relation까지 발급한다
argument-hint: "{요구 영역/설명}"
---

# /requirement — 요구사항 발급

URS·UCS·SRS를 **JSON 아티팩트(`CODE.json`)** 로 발급한다. 포맷 = `${CLAUDE_PLUGIN_ROOT}/templates/_ARTIFACT-JSON-FORMAT.md`(동형 — 웹 에디터·파일·DB가 같은 JSON). **markdown(.md) 생성 금지.**

## 절차
1. **포맷 숙지**: `${CLAUDE_PLUGIN_ROOT}/templates/_ARTIFACT-JSON-FORMAT.md` 의 래퍼 구조 + doc 노드 어휘를 따른다.
2. **URS** (`${CLAUDE_PLUGIN_ROOT}/templates/artifact_urs.json`) → `.ouroboros/docs/requirements/URS-NNN.json`. relations 없음(피참조 루트). `stakeholder`·`priority` 채움. **(선택)** URS가 `/business` 디스커버리 근거(BS·MR·CA)에서 나왔다면 `relations.relates_to`에 해당 디스커버리 아티팩트 기재(예 `["MR","CA"]` · 비추적 소프트 관계 — 추적 게이트/매트릭스엔 무영향).
3. **UCS** (`templates/artifact_ucs.json`) → `UCS-NNN.json`. `relations.elaborates: ["URS-..."]`.
4. **SRS** (`templates/artifact_srs.json`) → `SRS-NNN.json`. `kind`(FR/NFR)·`acceptance_criteria` + **`relations.derives_from: ["URS-..."]`**(G1 필수).
5. ID 채번: 해당 디렉토리 기존 `*.json` 최대 번호 +1. `created`/`updated`=현재 UTC, `status: "Draft"`, `schemaVersion: 1`.
6. **본문 = `doc`** (ProseMirror 노드, 위 어휘만). `{{플레이스홀더}}`를 전부 실내용으로 치환.
7. 작성 후 **자체 점검**: 유효 JSON(파싱 가능)·모든 SRS에 `derives_from`(G1)·URS↔UCS·URS↔SRS 맞물림·본문 규칙(아래).
8. current.md·state.json 갱신.

## 본문(doc) 작성 규칙 (필수 — 한 줄 요약 금지)
포맷의 노드 어휘로 **모든 섹션을 실질 내용으로** 채운다. 빈 섹션·플레이스홀더 잔존 금지.
- **URS**: 배경/이해관계자(누가 왜) · 요구 서술(해결책 아닌 니즈) · 수용 기준(측정 가능 ≥1).
- **UCS**: 주 흐름(ordered_list 단계) · 대안/예외 흐름 · 사전·사후 조건.
- **SRS**: 요구 서술(기능/성능, 구현 무관 2문장+) · 수용 기준(bullet ≥2) · 연결(도출 URS).
- 섹션 = heading 노드 + paragraph/bullet_list. `acceptance_criteria` 최상위 필드는 본문 수용기준 핵심 1줄 요약.
- 저장 시 `body-lint` hook이 빈약 본문을 경고(비차단).

## 다음 단계
`/design`(SAD) → `/decision`(ADR) → `/trace`(G1/G2·매트릭스).

> 기존 아티팩트 수정 시 `updated`=현재 UTC. Status는 직접 바꾸지 말 것(PLM 대시보드 소유).
> 동기화: plm-sync hook이 `.json` 저장 시 doc·relations를 PLM에 자동 upsert(동일 JSON). 일괄은 `/plm-hub:sync`.
