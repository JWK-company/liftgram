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
>
> ⚠ **`/plm-hub:wfgen` 이 만든 보조 board 는 의도적으로 미준수다.** `<CODE>-A`(오버레이)·`<CODE>-Z`(미배치 요소)는 앞 토큰에 하이픈이 들어가 `[A-Z]{2,6}` 에 걸리지 않는다 — **화면 아티팩트가 아니므로 스킵되는 것이 정상**이다. 매 스캔마다 이 둘이 경고 목록에 보이는 것은 고장이 아니다. 프레임명을 고치지 말 것(고치면 보조 board 가 화면으로 잘못 발급된다).

## 페이지 스코핑 — **정본 페이지만 스캔** (감사 G4)
와이어프레임 작업용 사본은 **같은 파일 안의 새 페이지**다(`POST /wireframe/working-copy`). 전 페이지를 병합해 스캔하면 사본/보관본 프레임까지 발급 대상이 되어, 승격도 하기 전에 `WF-<CODE>`의 `loc`이 **사본으로 갈아끼워진다**(기존 아티팩트도 "얇은 본문 + 리치 SAE 스펙"이면 본문 보강 경로에서 덮어쓴다).

- **판정 근거 ①(권위)**: PLM `GET /wireframe/working-copy?project=P` 역할 대장의 `role='working'|'archived'` 페이지를 스캔에서 **제외**한다. 승격이 커밋되면 사본의 working 행은 삭제되므로(정본이 됐다) 제외가 정본을 삼키지 않는다.
- **판정 근거 ②(보완)**: 도구는 대장을 `&include_closed=1` 로 요청해 **마감된(`[보관 완료]`) 행까지 받아온다**(감사 X3 — `wfanno stage-apply` 가 마감된 승격을 정본으로 인식해야 하므로. 이 판정은 `wfanno` 와 같은 함수를 공유한다). 스캔 제외 집합을 만들 때는 마감 행을 **클라이언트에서 다시 걸러낸다**. 마감은 penpot을 건드리지 않아 `보관 · …` 페이지가 파일에 그대로 남으므로, 남은 구멍은 penpot 페이지 **이름 규약**(`보관 · …` / `… (작업본 · …)`)으로 막는다.
- **안전 실패**: 대장 조회에 실패하면(토큰 없음·네트워크·응답 형식 이상) 페이지가 2개 이상인 파일은 **아무것도 발급/보강하지 않고 거부**한다. 페이지가 1개면 종전대로 스캔한다. `--page <id|이름>`으로 명시하면 대장 없이도 그 페이지만 스캔한다(`wfanno`와 동일 규약 — 사본을 지정하면 경고).
- 제외한 페이지·거부한 파일은 보고 표에 그대로 표면화된다(조용한 스킵 없음).

## 동작
1. 바인딩·토큰 확인(없으면 `/plm-hub:link` 또는 아래 env 안내).
2. `scripts/wfscan.py` 실행:
   - penpot RPC(서버 token, `Authorization: Token <penpot-token>`)로 팀 `PLM · {project}` → `Wireframes` 프로젝트 → 파일 → 각 파일 `get-file` 의 **정본 페이지**(위 스코핑) `objects` 중 `type=="frame"` 이고 `parentId=="00000000-0000-0000-0000-000000000000"`(루트 보드)인 오브젝트 = 프레임.
   - 프레임 name → SCREEN_CODE 파싱(위 규약). 미준수는 스킵·경고.
   - 각 `WF-<SCREEN_CODE>` **존재 확인**(`GET /artifacts/{project}/{code}`) → 없으면 발급(`POST /import` + `PUT /doc`): `type:"Wireframe"`, `title`=프레임 name. **본문 = 요소별 SAE 표 자동 채움** — `<sae-dir>/WF-<CODE>.json`(기본 `.ouroboros/docs/wireframes`, `--sae-dir` 오버라이드) SAE 스펙을 찾으면 `loc` 딥링크 + `screen_code·route` + **요소 SAE 표**(열=요소코드·유형·라벨·상태·액션·이펙트)로 리치하게 생성한다(파서=`_sae_parse` — wfgen 과 규약 공유). 스펙이 없으면 `loc`+메타만 담는 얇은 폴백. SAE 스펙에 `covers`(→UCS/SRS)가 있으면 발급 시 관계로 함께 싣는다(비차단 — dst 미존재 시 안전 스킵).
   - **이미 있으면 비파괴 스킵** — 단, **리치 SAE 스펙이 있고 기존 본문이 얇을(표·미디어 없음) 때만** 요소 SAE 표로 본문을 보강한다(이미 리치·조회불가면 회귀 방지 스킵). title 동기·프레임 GC 는 안 함.
3. 스캔 프레임 수·발급·본문보강·스킵(기존/규약미준수/충돌/**제외페이지**/**실행거부 파일**) 수를 표로 보고하고, 마지막에 **`▍SAE 커버리지: r/total 리치 · t 스펙없음`** 블록을 출력한다(dry-run 에도 나온다 — 스펙 없이 조용히 얇게 발급되는 화면을 크게 표면화해 저작 액션까지 안내).

   그 밖에 자동으로 뜨는 경고(모두 사용자 눈에 보이는 출력이며, 보이면 조치 대상이다):
   - **SAE 디렉토리 비었음** — 스캔 시작 전 최상단 대형 경고(모든 본문이 얇아진다).
   - **스펙↔본문 요소 수 불일치** — 기존 본문이 이미 리치라 보존하는데 로컬 스펙보다 요소가 적을 때(명세가 자랐다는 신호. 갱신하려면 대시보드에서 본문을 비우고 재실행).
   - **본문 노드 축소** — `PUT /doc`은 전체 교체라, 보강 결과가 기존보다 작아지면 경고(손으로 쓴 내용이 있었는지 대시보드 이력에서 확인).
   - **회계 불일치** — 규약 준수 프레임 수 ≠ 발급/보강/기존/충돌/실패 합계(프레임이 조용히 증발했다는 뜻).
   - **중첩 board 제외** — 루트가 아닌 board 안의 board 는 화면으로 스캔되지 않는다(이름과 개수를 찍어 준다).

### 실행
`DIR` = 이 플러그인 루트(`plugin/plm-hub`). 스크립트는 `.ouroboros/config/plm.json`·`.ouroboros/env/.env` 를 **직접 읽어** PLM·penpot 설정을 해석하므로 env 미주입 시에도 동작한다(plm_lib.sh source 는 선택).
```bash
python3 "$DIR/scripts/wfscan.py" --dry-run     # 검증: 발급/보강 없이 스캔 결과·예정만
python3 "$DIR/scripts/wfscan.py"               # 발급(없는 WF-<CODE>) + 얇은 기존 본문의 SAE 표 보강
python3 "$DIR/scripts/wfscan.py" --sae-dir DIR # SAE 스펙 디렉토리 오버라이드(기본 .ouroboros/docs/wireframes)
python3 "$DIR/scripts/wfscan.py" --file FID --page "목록"   # 파일·페이지 명시(사본 대장 없이도 그 페이지만)
# (선택) . "$DIR/scripts/plm_lib.sh" && plm_resolve  로 PLM_* env 를 먼저 주입해도 됨
```
> `--dry-run` 은 발급/보강 없이 스캔 결과·발급예정·보강예정만 출력(검증용 — 페이지 스코핑 규칙은 dry-run 에도 동일 적용된다. 잘못된 "발급예정" 목록을 보여 주지 않기 위해서다). `--project X` 프로젝트명 오버라이드(기본 plm.json project). `--sae-dir DIR` 로 SAE 스펙 위치 지정. `--file FID` 로 penpot 파일 좁히기. `--page <id|이름>` 으로 스캔할 페이지 명시(`wfanno` 와 동일 규약).

## env 변수
| 변수 | 용도 | 기본값 |
|------|------|--------|
| `PLM_API_URL` · `PLM_API_TOKEN` · `PLM_PROJECT` | PLM 발급(codescan 동일) | config/plm.json + .env |
| `PENPOT_API_URL` | penpot 베이스 URL | `https://jwk-wf.shoi.ch` |
| `PENPOT_ACCESS_TOKEN` (별칭 `PENPOT_API_TOKEN`) | penpot 개인 액세스 토큰 | **자동(self-heal)** — 없으면 PLM 인증으로 대행 발급 후 .env 기입 |

> penpot 토큰은 **손으로 넣지 않아도 된다** — 미설정이면 도구가 PLM 인증으로 `GET /penpot-token` 대행 발급을 받아 이번 실행에 쓰고 `.ouroboros/env/.env` 에 한 줄 append 한다(멱등 · `wfgen`·`wfanno` 도 같은 로직). self-heal 이 실패했을 때만 수동으로 넣는다: penpot 계정 설정 **Access tokens** 에서 발급 → `.ouroboros/env/.env` 에 `PENPOT_ACCESS_TOKEN=<값>` 추가(값 하드코딩·커밋 금지 — .env 는 gitignore). 대시보드 서버가 쓰는 이름과 동일.

> **note(화면 자유서술)**: SAE 스펙의 `note` 필드(wrapper 또는 doc `노트:` 문단)가 있으면 본문 메타 아래에 **`노트:` 블록**으로 함께 렌더한다(penpot 주석 패널의 note 와 대칭 — 같은 서술을 양쪽에 노출). 얇은 폴백 본문도 note 는 싣는다.

## v1 스코프 / 미구현(v2)
- **v1**: 프레임 스캔 · SCREEN_CODE 파싱 · `WF-<CODE>` 멱등 발급 · **요소별 SAE 표 본문 + note 블록**(SAE 스펙 기반 · 얇은 기존 본문 비파괴 보강) · **covers(→UCS/SRS) 관계**(SAE 스펙에 있을 때 · dst 미존재 시 안전 스킵) · **`▍SAE 커버리지` 리포트 + 경고 계층**(위 동작 3 — 얇은 본문·불일치·증발을 상시 표면화). **스냅샷 임베드·title 동기·프레임 GC(삭제 프레임 Replaced)는 하지 않는다.**
- **주석 패널 ↔ 명세 양방향**은 `/plm-hub:wfanno`(render/extract/sync) — penpot 주석 패널과 SAE 명세를 SSOT 로 동기.
- **v2(계획서 §5 step 9~10)**: `wireframe_frames`(penpot_file_id·frame_id ↔ artifact) DB 매핑 · 프레임 리네임→title 동기 · 삭제→Replaced(codescan GC 패턴) · 프레임 스냅샷 PNG `/plm-hub:upload` 임베드.

## 주의
- 모든 HTTP는 `user-agent` 헤더 명시(Cloudflare 가 python-urllib 기본 UA 차단 → 403).
- 비차단(graceful)·비밀 노출 금지. penpot/PLM 실패해도 exit 0.
- `covers`→UCS/SRS 는 SAE 스펙(`relations.covers`)에 있으면 발급 시 자동 연결하되, **dst 요구가 PLM에 아직 없으면 안전 스킵**(비차단) — 요구를 먼저 동기(`/plm-hub:sync`)한 뒤 재스캔하면 커버가 붙는다. 스펙에 covers 가 없으면 초기엔 orphan.
