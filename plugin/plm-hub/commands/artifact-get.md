---
description: PLM-Hub 아티팩트를 조회한다 — MCP artifact_get 도구 호출
argument-hint: "{project} {code}"
---

PLM-Hub MCP 서버의 **`artifact_get`** 도구를 호출해 (project, code) 아티팩트를 조회한다.

**즉시 `plm-hub` MCP 서버의 `artifact_get` 도구를 호출**하라. 인자: $ARGUMENTS

결과(type·status·body 등)를 사용자에게 보고한다. 없으면 NotFound를 안내한다.

**본문(body) 주의 — "빈 문서" 오판 금지**: PLM 본문은 두 곳에 저장된다 — `body`(레거시 평문)와 `doc`(ProseMirror JSON, ADR-019 canonical). **BS(브레인스토밍)·웹 에디터로 작성한 문서는 본문이 `doc`에만 있고 `body`는 비어 있다.** `artifact_get`은 이제 body가 비면 doc의 텍스트를 자동으로 body에 채워 반환하므로 대개 그대로 보고하면 되지만, 만약 body가 비어 보이면 **절대 "빈 문서"로 결론내지 말고** `doc_get(project, code)`로 재조회해 실제 본문을 확인하라.
