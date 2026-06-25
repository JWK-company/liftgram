---
description: 추적 대상 요구사항(URS·UCS·SRS)을 ID·frontmatter·relation까지 발급한다
argument-hint: "{요구 영역/설명}"
---

# /requirement — 요구사항 발급

URS·UCS·SRS를 templates 기반으로 발급한다. **owner relation만** frontmatter에 기재(추적 백본).

## 절차
1. **URS** (`${CLAUDE_PLUGIN_ROOT}/templates/artifact_urs.md`) → `.ouroboros/docs/requirements/URS-NNN.md`. outgoing relation 없음(피참조 루트). stakeholder·priority 채움.
2. **UCS** (`${CLAUDE_PLUGIN_ROOT}/templates/artifact_ucs.md`) → `UCS-NNN.md`. `elaborates: [URS-...]` 채움.
3. **SRS** (`${CLAUDE_PLUGIN_ROOT}/templates/artifact_srs.md`) → `SRS-NNN.md`. `kind`(FR/NFR)·`acceptance_criteria` + **`derives_from: [URS-...]`**(G1 필수) 채움.
4. ID 채번: 해당 디렉토리의 기존 최대 번호 +1. `created`/`updated`=현재 UTC, `status: Draft`.
5. 작성 후 **자체 점검**: 모든 SRS에 `derives_from`가 있는지(G1), URS↔UCS·URS↔SRS가 서로 맞물리는지, **본문 규칙(아래) 충족**.
6. current.md·state.json 갱신.

## 본문 작성 규칙 (필수 — 한 줄 요약만 쓰지 말 것)
템플릿의 **모든 `##` 섹션을 실질 내용으로 채운다**. 플레이스홀더(`{{...}}`)·빈 섹션·1줄 요약으로 끝내지 않는다.
- **URS**: 배경/이해관계자(누가 왜) · 요구 서술(해결책 아닌 니즈) · 수용 기준(측정 가능 ≥1).
- **UCS**: 주 흐름(단계) · 대안/예외 흐름 · 사전·사후 조건.
- **SRS**: 요구 서술(기능/성능, 구현 무관 2문장+) · 수용 기준(측정 가능 bullet ≥2) · 연결(도출 URS).
- 각 섹션 ≥1문장 또는 ≥1 bullet의 **구체적** 내용. `acceptance_criteria` frontmatter는 본문 수용기준의 핵심을 1줄 요약(중복 허용).
- 저장 시 `body-lint` hook이 빈약 본문을 경고한다(비차단) — 경고 뜨면 섹션을 보강한다.

## 다음 단계
`/design`(SAD) → `/decision`(ADR) → `/trace`(G1/G2·매트릭스).

> 기존 아티팩트 수정 시 `updated`를 현재 UTC로 갱신. Status는 직접 바꾸지 말 것(거버넌스 백엔드 소유 — PLM 대시보드에서).
> 동기화: 거버넌스 백엔드는 **PLM**(plm-hub의 Edit hook `plm-sync`가 `.md` 저장 시 자동 upsert). 일괄은 `/plm-hub:sync`.
