---
description: 로컬 파일(스크린샷·GIF·PDF·데이터)을 PLM에 업로드해 아티팩트 본문에 임베드할 image/file 노드를 얻는다
argument-hint: "<파일경로> [파일경로2 ...]"
---

# /plm-hub:upload — 본문 미디어 첨부

작업 중 생긴 **증거·분석 자료**(테스트 스크린샷·경쟁앱 캡처·GIF·PDF·차트·데이터)를 PLM 스토리지(MinIO)에 올려, 아티팩트 doc 본문에 **image/file 노드**로 임베드한다. 대시보드에서 편집할 땐 드래그·붙여넣기·슬래시(`/이미지`·`/PDF`·`/파일`)로도 되지만, **Claude Code(CLI)가 로컬에서 만든 파일**은 이 커맨드로 올린다.

> **원칙: 필요한 자료만.** 불필요한 파일을 일부러 넣지 않는다. 분석·검증·근거로서 본문에 실제로 도움이 되는 미디어만 첨부.

## 절차
1. 인자의 파일 경로를 확인한다(존재·25MB 이하·지원 타입: 이미지 png/jpeg/gif/webp/svg/avif, 문서 pdf 등).
2. 업로드 실행:
   ```
   python3 ${CLAUDE_PLUGIN_ROOT}/scripts/plm_upload.py <파일경로> [파일경로2 ...]
   ```
   - env(`.ouroboros/env/.env`): `PLM_API_TOKEN`(필수)·`PLM_DASH_URL`(없으면 `PLM_API_URL`에서 유도). 미바인딩이면 `/plm-hub:link` 선행.
   - stdout = 삽입용 **노드 JSON**(이미지=`image`, 그 외=`file`). stderr = 진행/에러(415 미지원·413 초과·401 토큰).
3. 반환된 노드를 **편집 중인 아티팩트 `.json`의 `doc.content`** 알맞은 위치에 삽입한다(이미지=본문 흐름, 파일=참조/근거 자리). 여러 파일이면 반환 배열의 각 노드를 순서대로.
4. 저장하면 `plm-sync` hook이 PLM에 동기 → 대시보드 본문에서 렌더(이미지 표시·PDF 임베드/다운로드 카드). 서빙 경로는 `/api/files/<key>`.

## 노드 형태 (참고 — `_ARTIFACT-JSON-FORMAT.md`)
- 이미지: `{"type":"image","attrs":{"src":"/api/files/<key>","alt":"<이름>"}}`
- 파일:   `{"type":"file","attrs":{"key":"<key>","name":"<이름>","mime":"<mime>","size":<바이트>}}`

## 다음 단계
아티팩트 저장(→ plm-sync 자동 동기) 후 `/plm-hub:verify`로 정합 확인 가능.

> 업로드 대상은 대시보드 `/api/upload`(MinIO). 민감 자료는 올리지 말 것(스토리지에 보존됨). markdown 아티팩트 금지 규칙과 무관 — 노드는 CODE.json doc 어휘.
