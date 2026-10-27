---
description: PLM-Hub 아티팩트(기획/코드)를 발급한다 — MCP artifact_issue 도구 호출
argument-hint: "{project} {code} {type} {title}"
---

PLM-Hub MCP 서버의 **`artifact_issue`** 도구를 호출해 아티팩트를 발급한다.

입력 인자에서 project·code·type·title을 파악하고, 코드 단위(type=Code)면 granularity(module/function/instance…)·build_state(to_be/as_built)도 받는다.

**type 수용 목록**(서버 파싱 기준): `URS|UCS|SRS|SAD|ADR|Roadmap|Code|BS|PRD|Business|Wireframe|Blueprint|DesignResearch`.
- `MR`·`CA`는 **신규 발급이 차단**된다(ADR-027로 `Business`에 병합 — 서버가 400과 안내 메시지를 반환한다). 구 `Report`는 하위호환으로 파싱만 되고 `Business`로 취급된다.
- **type=BS면 `kind`를 함께 넘긴다** — `idea|feedback` 둘 중 하나(미지정이면 `idea`로 정규화, 그 외 값은 거부).
- 필요하면 `tags`(자유 태그 다중)·`repo`·`branch`(작업 브랜치 · 미지정=main)도 함께 넘길 수 있다.

**즉시 `plm-hub` MCP 서버의 `artifact_issue` 도구를 호출**하라. 인자: $ARGUMENTS

- 분류 기준은 서버(governance + DB 제약)가 강제 — 위반 시 도구가 에러를 반환하니 안내 후 교정.
- 발급 결과(코드·status=Draft)를 사용자에게 보고.
