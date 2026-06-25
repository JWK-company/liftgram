---
description: 로컬 기획문서·소스코드 ↔ PLM 동기 무결성 재검증(드리프트 감사 + 자동 정합)
---

# /plm-hub:verify — 동기 무결성 재검증

per-edit 동기(plm-sync/plm-codesync 훅)가 조용히 실패하면 desync가 누적된다. 이 명령은 **로컬(SSOT) ↔ PLM 전체를 대조**해 드리프트를 표면화하고, 사용자 확인 후 정합한다. (Stop 게이트 훅의 드리프트 경고를 명시적으로 전수 실행하는 버전.)

## 절차

1. **바인딩 확인**: `.ouroboros/config/plm.json`의 `api_url`·`project`를 읽는다. **절대 localhost로 하드코딩하지 말 것** — 바인딩된 URL(보통 PROD)을 쓴다. 토큰은 `.ouroboros/env/.env`의 `PLM_API_TOKEN`.

2. **문서 드리프트** (TRACKED = URS/UCS/SRS/SAD/ADR/Roadmap):
   - 로컬: `.ouroboros/docs/{requirements,design,decisions,roadmap}/*.md` 파일명 stem(= 아티팩트 코드). `_`접두·`sync:false` 제외.
   - PLM: `/export?project=<p>`의 active(비-Superseded) TRACKED 아티팩트 코드.
   - **local_only**(로컬엔 있으나 PLM 미반영) → 미동기. **plm_only**(PLM엔 있으나 로컬 파일 없음) → 잔여/드리프트.

3. **코드 드리프트** (Code):
   - 로컬 소스의 `@plm <CODE>` 주석 수집(스캔 루트 = `PLM_CODE_ROOT`/config `code_root`).
   - PLM의 active Code 아티팩트와 비교 — 소스에 없는 active Code(이전 구현 잔여) 식별.

4. **보고 + 정합(사용자 확인 후)**:
   - `local_only` → `/plm-hub:sync`(로컬→PLM 일괄 업서트) 또는 변경 문서 개별 동기.
   - `plm_only` 문서 → `/plm-hub:pull`(PLM 편집분 회수) 또는 의도된 삭제면 PLM에서 Superseded 처리.
   - 소스에 없는 active Code → `/plm-hub:codescan`(GC가 리네임/삭제 Code를 Superseded 처리).
   - 게이트(G1~G3·needs_review·G_body)도 함께 조회해 표면화.

5. **결과 요약**: active 타입별 카운트가 로컬과 일치하는지(예: SRS 파일 수 == PLM active SRS 수) 명시. 불일치 0 = 동기 정합.

## 주의
- 모든 GET/POST는 `user-agent` 헤더 명시(Cloudflare가 python-urllib 기본 UA 차단).
- `/export`는 대량이라 타임아웃 여유(≥20s).
- 비차단·비밀 노출 금지. 정합 액션(동기/삭제)은 사용자 확인 후 수행.
