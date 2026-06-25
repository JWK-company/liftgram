---
description: 두 아티팩트를 추적 관계로 연결한다 — MCP relation_link 도구 호출
argument-hint: "{project} {src} {rel} {dst}"
---

PLM-Hub MCP 서버의 **`relation_link`** 도구로 추적 관계를 연결한다.

rel: derives_from|elaborates|refs|informs|realizes|implemented_by|supersedes|covers|part_of|instance_of

**즉시 `plm-hub` MCP 서버의 `relation_link` 도구를 호출**하라. 인자: $ARGUMENTS

- 관계 type-pair는 앱계층(is_valid_pair) + DB 트리거가 이중 검증 — 허용되지 않으면 409로 차단.
- 예: SRS-001 derives_from URS-001 (SRS→URS만 허용).
