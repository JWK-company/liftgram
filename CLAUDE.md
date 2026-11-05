# liftgram — 프로젝트 가이드

> **작업 기준은 ADStudio**(세션 시작 시 주입되는 「ADStudio 작업 기준」 + `ads:conventions` 스킬)다.
> 이 파일은 그 기준 위에 얹는 **liftgram 고유 사항**만 담는다 — 문서 형식·흐름·회신 방법은 여기서 다시 정하지 않는다.
> (2026-11-03 PLM·Ouroboros 워크플로우 → ADStudio 이전. 옛 가이드 전문은 `git show 37ce444:CLAUDE.md`.)

---

## 1. 저장소 지도

| 경로 | 무엇 | 비고 |
|------|------|------|
| `src/` | **현행 앱 — 웹 스택**(Next 16 frontend · 운영 웹 `src/admin` · Go backend · PostgreSQL · Redis · Capacitor 앱 껍데기) | 구조·명령·경계는 [`src/CLAUDE.md`](src/CLAUDE.md) |
| `app/` · `server/` | 옛 Expo 앱 · Nest 서버(2026-08 이후 손대지 않음) | 요청이 없으면 고치지 않는다 |
| `plugin/` · `workflow/` · `reference/` · 루트 `Makefile`·`setup.*`·`README.md`·`INSTALL.md` | 옛 jwk-platform(PLM) 템플릿 잔재 | 고치지 않는다 |
| `.ouroboros/docs/**` | 옛 PLM 기획 기록(URS·SRS·SAD·ADR…) | **읽기 전용 근거** — 새 문서가 근거로 쓰면 `relations.refs_legacy: ["PLM:SRS-001"]` |
| `ads-docs/<그룹>/` | ADStudio 문서 원본 | 새 문서는 전부 여기 |

## 2. 브랜치·버전·배포

- **작업 브랜치 = `feat/web-stack-tarae`** (`main`은 옛것). 커밋·푸시는 사용자가 요청할 때만.
- **배포마다 SemVer 올림** — 기능 = minor, 픽스 = patch. 현재 버전 원본은 `src/frontend/package.json`의 `version`.
- **운영 웹 배포** = `src/scripts/deploy-admin-h2500-3.sh`(앱과 따로 · 버전 원본 `src/admin/package.json` · `liftgram-admin.tarae.org`).
- **운영 배포** = `src/scripts/deploy-h2500-3.sh` → h2500-3 서버 docker + Cloudflare 터널(`liftgram.tarae.org`). DB는 같은 서버 compose의 db.
- h2500-3의 **GPU는 동업자와 공유** — 비어 보여도 쓰기 전에 시간·분량을 먼저 묻는다.

## 3. 포트

| 용도 | 포트 |
|------|------|
| 개발(`make dev`, `src/`) | frontend 3100 · backend 3101 · PostgreSQL 5434 · Redis 6381 |
| 로컬 운영 빌드 e2e(새 DB) | 웹 3200 · API 3201 — dev 3100은 건드리지 않는다 |
| 병렬 작업(worktree) | 3300 |
| 운영 웹(`src/admin`) | 개발 3102 · e2e 웹 3320·API 3321·Access 시험 키 3322 · h2500-3 운영 3411 |

포트가 점유돼 있으면 **프로세스를 죽이지 않는다** — `.env`의 포트를 바꾸거나 그 터미널에서 끈다.

## 4. 옛 PLM 흔적 다루기

- 소스의 기존 `// @plm SRS-NNN` 주석은 **그대로 둔다**(요구 출처 기록). 새로 달지 않고, codescan·PLM 동기는 하지 않는다.
- `.ouroboros/context/current.md`·`state.json`은 더 이상 갱신하지 않는다.
- 옛 PLM 기록을 ADStudio 문서로 옮길 때는 `/ads:migrate PLM:<코드>`를 쓴다.

## 5. 프로젝트 고유 규칙

- **사용자에게 보이는 글은 전부 한국어.** 긴 작업 중이거나 압축 뒤에도 마찬가지다.
- 큰 작업은 **스펙 단계에서 정밀하게 묻고**, 승인된 뒤에는 spec → qa spec → execute → qa code → 배포까지 질문 없이 끝까지 간다. 작은 수정도 배포 전에 독립 코드 리뷰(qa code)를 거친다.
- 계정·키·Xcode 같은 준비물은 갖춰져 있다고 보고 진행하고, 실제로 막힐 때 그 값만 요청한다.
- 기존 코드 보존(`[원본]` 주석으로 막고 `[개선]`을 바로 아래에)은 ADStudio 기준 5절을 따른다.
