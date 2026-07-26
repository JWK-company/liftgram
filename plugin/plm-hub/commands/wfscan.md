---
description: penpot Wireframes 프레임을 스캔 → 각 프레임을 PLM Wireframe 아티팩트로 멱등 발급 (프레임당 아티팩트 · ADR-031/SRS-041)
---

# /plm-hub:wfscan — 프레임당 Wireframe 아티팩트 발급

penpot의 `Wireframes` 프로젝트 프레임(board)을 스캔해 **1 프레임 = 1 `Wireframe` 아티팩트**로 멱등 발급한다. `codescan`(@plm 딥링크)과 같은 패턴 — penpot 프레임이 곧 "역링크 소스"다. penpot 프레임 → PLM `Wireframe`(loc=`penpot:<file-id>:<frame-id>`).

## 프레임 이름 규약 (SCREEN_CODE)
프레임(레이어) 이름 = **`<SCREEN_CODE> <라벨>`**. 앞 토큰이 `[A-Z]{2,6}` 이면 그걸 SCREEN_CODE로 쓴다.
```
LIB 서재 (Library)      → SCREEN_CODE=LIB → 아티팩트 WF-LIB
RDR 리더 (Reader)       → SCREEN_CODE=RDR → WF-RDR
① 서재 (Library)        → 앞 토큰 '①' ≠ [A-Z]{2,6} → 규약 미준수 → 스킵(경고)
```
> **규약 미준수 프레임은 발급하지 않고 경고 목록에 기록한다**(자동 코드 부여 금지 — 계획서 결정#4 미확정, 보수적 스킵). 화면을 추적하려면 penpot에서 프레임명을 `<CODE> <라벨>`로 정리 후 재스캔.

## 동작
1. 바인딩·토큰 확인(없으면 `/plm-hub:link` 또는 아래 env 안내).
2. `scripts/wfscan.py` 실행:
   - penpot RPC(서버 token, `Authorization: Token <penpot-token>`)로 팀 `PLM · {project}` → `Wireframes` 프로젝트 → 파일 → 각 파일 `get-file` 의 `data.pagesIndex[*].objects` 중 `type=="frame"` 이고 `parentId=="00000000-0000-0000-0000-000000000000"`(루트 보드)인 오브젝트 = 프레임.
   - 프레임 name → SCREEN_CODE 파싱(위 규약). 미준수는 스킵·경고.
   - 각 `WF-<SCREEN_CODE>` **존재 확인**(`GET /artifacts/{project}/{code}`) → 없으면 발급(`POST /import` + `PUT /doc`): `type:"Wireframe"`, `title`=프레임 name. **본문 = 요소별 SAE 표 자동 채움** — `<sae-dir>/WF-<CODE>.json`(기본 `.ouroboros/docs/wireframes`, `--sae-dir` 오버라이드) SAE 스펙을 찾으면 `loc` 딥링크 + `screen_code·route` + **요소 SAE 표**(열=요소코드·유형·라벨·상태·액션·이펙트)로 리치하게 생성한다(파서=`_sae_parse` — wfgen 과 규약 공유). 스펙이 없으면 `loc`+메타만 담는 얇은 폴백. SAE 스펙에 `covers`(→UCS/SRS)가 있으면 발급 시 관계로 함께 싣는다(비차단 — dst 미존재 시 안전 스킵).
   - **이미 있으면 비파괴 스킵** — 단, **리치 SAE 스펙이 있고 기존 본문이 얇을(표·미디어 없음) 때만** 요소 SAE 표로 본문을 보강한다(이미 리치·조회불가면 회귀 방지 스킵). title 동기·프레임 GC 는 안 함.
3. 스캔 프레임 수·발급·본문보강·스킵(기존/규약미준수/충돌) 수를 표로 보고.

### 실행
`DIR` = 이 플러그인 루트(`plugin/plm-hub`). 스크립트는 `.ouroboros/config/plm.json`·`.ouroboros/env/.env` 를 **직접 읽어** PLM·penpot 설정을 해석하므로 env 미주입 시에도 동작한다(plm_lib.sh source 는 선택).
```bash
python3 "$DIR/scripts/wfscan.py" --dry-run     # 검증: 발급/보강 없이 스캔 결과·예정만
python3 "$DIR/scripts/wfscan.py"               # 발급(없는 WF-<CODE>) + 얇은 기존 본문의 SAE 표 보강
python3 "$DIR/scripts/wfscan.py" --sae-dir DIR # SAE 스펙 디렉토리 오버라이드(기본 .ouroboros/docs/wireframes)
# (선택) . "$DIR/scripts/plm_lib.sh" && plm_resolve  로 PLM_* env 를 먼저 주입해도 됨
```
> `--dry-run` 은 발급/보강 없이 스캔 결과·발급예정·보강예정만 출력(검증용). `--project X` 프로젝트명 오버라이드(기본 plm.json project). `--sae-dir DIR` 로 SAE 스펙 위치 지정.

## env 변수
| 변수 | 용도 | 기본값 |
|------|------|--------|
| `PLM_API_URL` · `PLM_API_TOKEN` · `PLM_PROJECT` | PLM 발급(codescan 동일) | config/plm.json + .env |
| `PENPOT_API_URL` | penpot 베이스 URL | `https://jwk-wf.shoi.ch` |
| `PENPOT_ACCESS_TOKEN` (별칭 `PENPOT_API_TOKEN`) | penpot 개인 액세스 토큰 | **필수 — .env 에 추가** |

> penpot 토큰은 penpot 계정 설정 **Access tokens** 에서 발급. `.ouroboros/env/.env` 에 `PENPOT_ACCESS_TOKEN=<값>` 추가(값 하드코딩·커밋 금지 — .env 는 gitignore). 대시보드 서버가 쓰는 이름과 동일.

## v1 스코프 / 미구현(v2)
- **v1**: 프레임 스캔 · SCREEN_CODE 파싱 · `WF-<CODE>` 멱등 발급 · **요소별 SAE 표 본문**(SAE 스펙 기반 · 얇은 기존 본문 비파괴 보강) · **covers(→UCS/SRS) 관계**(SAE 스펙에 있을 때 · dst 미존재 시 안전 스킵). **스냅샷 임베드·title 동기·프레임 GC(삭제 프레임 Replaced)는 하지 않는다.**
- **v2(계획서 §5 step 9~10)**: `wireframe_frames`(penpot_file_id·frame_id ↔ artifact) DB 매핑 · 프레임 리네임→title 동기 · 삭제→Replaced(codescan GC 패턴) · 프레임 스냅샷 PNG `/plm-hub:upload` 임베드.

## 주의
- 모든 HTTP는 `user-agent` 헤더 명시(Cloudflare 가 python-urllib 기본 UA 차단 → 403).
- 비차단(graceful)·비밀 노출 금지. penpot/PLM 실패해도 exit 0.
- `covers`→UCS/SRS 는 SAE 스펙(`relations.covers`)에 있으면 발급 시 자동 연결하되, **dst 요구가 PLM에 아직 없으면 안전 스킵**(비차단) — 요구를 먼저 동기(`/plm-hub:sync`)한 뒤 재스캔하면 커버가 붙는다. 스펙에 covers 가 없으면 초기엔 orphan.
