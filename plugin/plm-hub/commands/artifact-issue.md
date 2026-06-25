---
description: PLM-Hub 아티팩트(기획/코드)를 발급한다 — MCP artifact_issue 도구 호출
argument-hint: "{project} {code} {type} {title}"
---

PLM-Hub MCP 서버의 **`artifact_issue`** 도구를 호출해 아티팩트를 발급한다.

입력 인자에서 project·code·type(URS|UCS|SRS|SAD|ADR|Roadmap|Code)·title을 파악하고,
코드 단위(type=Code)면 granularity(module/function/instance…)·build_state(to_be/as_built)도 받는다.

**즉시 `plm-hub` MCP 서버의 `artifact_issue` 도구를 호출**하라. 인자: $ARGUMENTS

- 분류 기준은 서버(governance + DB 제약)가 강제 — 위반 시 도구가 에러를 반환하니 안내 후 교정.
- 발급 결과(코드·status=Draft)를 사용자에게 보고.
