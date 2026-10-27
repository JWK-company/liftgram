---
description: 두 아티팩트를 추적 관계로 연결한다 — MCP relation_link 도구 호출
argument-hint: "{project} {src} {rel} {dst}"
---

PLM-Hub MCP 서버의 **`relation_link`** 도구로 추적 관계를 연결한다.

rel: derives_from|elaborates|refs|informs|realizes|implemented_by|supersedes|covers|part_of|instance_of|relates_to|targets|generated_from

**즉시 `plm-hub` MCP 서버의 `relation_link` 도구를 호출**하라. 인자: $ARGUMENTS

- 관계 type-pair는 앱계층(is_valid_pair) + DB 트리거가 이중 검증 — 허용되지 않으면 409로 차단.
- 예: SRS-001 derives_from URS-001 (SRS→URS만 허용).

**허용 페어**(추적 백본):
- `derives_from` SRS→URS · `elaborates` UCS→URS · `refs` SAD→SRS · `informs` ADR→SRS·SAD
- `realizes` Code→SRS·SAD · `implemented_by` SRS·SAD→Code · `supersedes` 같은 타입끼리(예 ADR→ADR)
- `covers` **Roadmap→URS·SRS** 및 **Wireframe→UCS·SRS**(ADR-031 — 한 rel 이름이 두 페어를 갖는다)
- `part_of`·`instance_of` Code→Code(코드 내부 구조)

**비추적 관계**(게이트·추적 매트릭스 밖 · 그래프 표시용):
- `relates_to` PRD·URS·SRS·SAD → BS·Business(디스커버리 근거 참조. 레거시 MR·CA도 dst로 수용)
- `targets` BS → BS·Business를 **제외한** 전 타입(BS 피드백이 겨냥하는 대상)
- `generated_from` PRD→BS · Roadmap→PRD · Business→BS(생성 계보)
