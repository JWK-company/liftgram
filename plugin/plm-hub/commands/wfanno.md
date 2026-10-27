---
description: 와이어프레임 주석 패널(penpot) ↔ SAE 기능명세(SSOT·PLM 문서) 양방향 동기 — 하나의 명세를 양쪽에 렌더/역추출 (SRS-042·ADR-031)
---

# /plm-hub:wfanno — 주석 패널 ↔ SAE 명세 양방향 동기

와이어프레임의 **penpot 주석 패널**(사람이 읽는 SAE 요약 + 화면 note)과 **PLM 본문 SAE 표**를 **하나의 SSOT**(`WF-<CODE>.json` SAE 명세)에서 양쪽에 생성/역추출한다. 주석 패널은 AnyC 실측 스키마(anno-bg/title/rule + 요소별 anno-code/label/state/act/eff)를 **그대로 재현** + **화면 note**(자유서술)를 얹는다.

## 개념 — 한 SAE, 세 서피스
```
                WF-<CODE>.json (SAE 명세 · 로컬 SSOT)   ← 요소별 상태·액션·이펙트 + 화면 note
       forward ↙            │            ↘ forward
  penpot 주석 패널     (wfscan)        PLM 본문 SAE 표 + note
  anno:<CODE> 그룹                     (요소코드·유형·라벨·상태·액션·이펙트)
       reverse ↖ penpot anno-* → 명세 (extract · penpot 읽기만)
```
- **명세가 SSOT** — penpot·PLM 은 렌더 서피스. 명세를 고치면 양쪽 재렌더.
- **신규**: 명세 저작 → `wfgen --anno`(목업+패널) → `wfscan`(PLM 본문). 자동으로 세 서피스.
- **기존(penpot에만 알맹이)**: `wfanno extract`/`sync` 로 penpot 주석 → 명세·PLM 본문 역추출(penpot 읽기만).

## 서브커맨드
| 명령 | 하는 일 | penpot |
|------|---------|--------|
| `render <project> [--code WF-XXX] [--file FID] [--page P]` | 명세 → penpot 주석 패널 생성/치환. `anno:<CODE>` 그룹으로 **비파괴·멱등** 교체(하이파이 프레임·타 객체 무수정). | **쓰기**(update-file) |
| `extract <project> [--code WF-XXX] [--file FID] [--page P] [--no-plm]` | penpot anno-* → 명세(`WF-<CODE>.json`) + (기본)PLM 본문. **읽기만**(update-file 0). | **읽기전용** |
| `sync <project> [--file FID] [--page P] [--no-render] [--no-plm]` | 일괄 — **로컬 명세 있으면** render+PLM, **없으면** extract(읽기만)+PLM. 명세 없던 프레임은 **절대 render 안 함**(읽기전용 원천 보호). | 조건부 |
| `mark <project> --code WF-XXX --page P [--items "12,13"] [--label 문구] [--date MM-DD]` | **변경 칩** 부착 — 바뀐 프레임 위에 `✱ 반영됨 · 07-31 · RDR.12, RDR.13` 칩을 얹는다. `chg:<CODE>` 그룹 1개로 감싸 **비파괴·멱등** 교체. | **쓰기**(update-file) |
| `mark <project> --clear --page P [--code WF-XXX]` | 변경 칩 **제거**. `--code` 생략 시 그 페이지의 칩 전량(승격 뒤 정리 경로). | **쓰기**(update-file) |
| `page-role <project> --page P [--expect working]` | 페이지 역할 조회(읽기 전용 · penpot 무접촉). 불일치 exit 3. | 무접촉 |
| `stage-apply <project> --page <사본> [--stage-dir D] [--sae-dir D] [--dry-run] [--force]` | **승격된 뒤** 스테이징 SAE 명세를 정본 자리로 옮긴다(감사 W11). 승격 전이면 exit 3. **마감된 승격(`[보관 완료]`)도 승격으로 읽는다**(0.6.25 · 감사 X3). 끝나면 `sync --page <사본>`을 이어서 안내한다. | 무접촉 |

- **`--code` 를 생략하면 그 페이지의 규약 프레임 전량**이 대상이다(render/extract/sync 공통). 별도의 "전체" 스위치는 필요 없다 — `--all` 플래그가 파서에 등록돼 있긴 하지만 **아무 코드도 그 값을 읽지 않는다(no-op)**. 붙여도 오류는 안 나지만 아무 효과도 없으니 쓰지 마라.
- `stage-apply` 의 `--stage-dir` 를 생략하면 `<--sae-dir>/.working/<사본 페이지>` 를 자동으로 쓴다(스테이징 기본 경로 — `--sae-dir` 는 명세를 옮겨 넣을 **정본 디렉터리**다).
- `page-role --expect` 는 값으로 **`working` 만** 받는다(사본에서 쓰기 직전 확인용). 정본 여부 확인은 이 명령이 아니라 `render/extract/sync --expect-page-role canonical` 이 담당한다. `--expect` 없이 부르면 판정 없이 현재 역할만 출력한다.

공통 옵션: `--dry-run`(커밋/발급 없이 계획만) · `--sae-dir DIR`(기본 `.ouroboros/docs/wireframes` · 사본 작업은 스테이징을 준다) · `--force`(PLM 본문이 이미 리치여도 덮어씀 · 기본 비파괴 스킵) · **`--page <id|이름>`**(아래) · `--expect-page-role {working|canonical}`(쓰기 직전 역할 재확인 · 불일치 exit 3).

## 페이지 스코핑 — `--page` (안전장치)
penpot 파일은 **페이지를 여러 개** 가질 수 있고, 페이지를 복제하면(우리 도구든 penpot UI의 '페이지 복제'든) **shape id 가 100% 동일**해진다. 그래서 wfanno 는 **한 번에 정확히 한 페이지**만 다룬다.

| 상황 | 동작 |
|------|------|
| 페이지 1개 · `--page` 없음 | 그 페이지에 수행(기존과 동일) |
| 페이지 2개 이상 · `--page` 없음 | **실행 거부** — 페이지 목록(이름·id·프레임 수)을 찍고 `--page` 요구. 그 파일은 **아무것도 건드리지 않는다** |
| `--page <페이지 id>` 또는 `--page "<페이지 이름>"` | 그 페이지만 읽고 그 페이지에만 `del-obj`/`add-obj` |

> **왜 거부하나**: 예전엔 전 페이지의 objects 를 한 dict 로 병합해 `del-obj` 의 `pageId` 가 "마지막 페이지"로 덮였다 → **다른 페이지(원본)의 주석 패널을 삭제**했다. 추측은 곧 데이터 손실이라 침묵 대신 거부한다. 회귀 테스트: `plugin/plm-hub/tests/test_wfanno_page.py`.

## 댓글 반영 = **작업용 사본 필수**(강제 · 2026-07-31)
> 관리자 확정: **"댓글 반영은 무조건 사본 만들고 진행해야 해. 옵션이 아닌 강제야."**

penpot 댓글 피드백을 명세·패널에 반영하는 작업은 **작업용 사본 페이지 안에서만** 한다. 정본(원래 페이지 · PLM 정본 문서)을 직접 고치는 경로는 **없다** — 선택지가 아니라 아예 존재하지 않는다.

| 사본 상태 | 이 작업에서 할 일 |
|-----------|------------------|
| **있다**(`role="working"` 1개) | 사본 페이지에서만 작업 — 아래 표의 규칙을 그대로 지킨다 |
| **없다** | ⛔ **아무것도 쓰지 말고 보류**. 회신 첫 줄: `사본이 없어 진행하지 않았습니다 — 대시보드에서 그 댓글을 다시 보내면 작업용 사본이 자동으로 만들어집니다.` → `report(ok=false)` (⚠ `reason` 인자 금지 — 붙이면 blocked가 되어 댓글이 '보내는 중'에 갇힌다) |
| **모른다**(조회 실패·권한 부족·구버전 서버) | ⛔ 같은 보류. 사유(권한/서버 확인 필요)를 사람에게 회신 |
| **2개 이상**(한 파일에) | ⛔ 같은 보류 — 어느 사본에 반영할지 판정 불가. 관리자에게 승격/버리기로 정리를 요청 |

사본에서 작업할 때의 규칙(정본 누출 금지 — 사본은 **관리자가 [승격(promote)]할 때** 정본이 된다):

| 대상 | 규칙 |
|------|------|
| `render` / `extract` | **반드시 `--page <사본 페이지 id>`** — 빼면 원본을 덮거나(단일 페이지) 실행 거부(다중 페이지) |
| **쓰기 직전 재확인**(필수) | `page-role --project <P> --page <사본> --expect working` → `✔ ok`가 아니면 **그 자리에서 멈춘다**(아래 참조) |
| `render`의 도구 가드 | `render … --page <사본> --expect-page-role working` — update-file **직전**에 한 번 더 확인하고 바뀌었으면 아무것도 쓰지 않고 exit 3 |
| `sync` (PLM 본문 push) | **실행 금지.** 이 명령은 PLM **정본** 본문을 민다. 정본 반영은 승격 시점이다 |
| `sync`/`extract`의 도구 가드 (0.6.24 · 감사 W10) | 두 명령은 실행 시 **페이지 역할을 스스로 확인**하고, 정본임을 증명하지 못하면 **PLM 본문 push와 정본 SAE 명세 쓰기를 건너뛴다**(penpot 렌더는 그대로). `--expect-page-role canonical`을 주면 기대와 다를 때 exit 3. 대장 조회 실패 + 페이지 2개↑도 "증명 불가"로 본다(wfscan G4와 같은 규약) |
| **SAE 명세**(로컬 SSOT) (0.6.24 · 감사 W11) | 사본 작업의 명세 편집은 **스테이징**에만 한다: `--sae-dir .ouroboros/docs/wireframes/.working/<사본페이지>`. 정본 명세(`docs/wireframes/WF-*.json`)는 **읽기만** 하고 고치지도 커밋하지도 않는다 — 고치는 순간 이후 `wfscan`이 그 명세로 정본 PLM 본문을 보강하거나, 사본을 버린 뒤 `render`가 정본 penpot 페이지에 그대로 그린다(= 승격 없이 정본 반영) |
| 변경 칩(`mark`) | 그림·명세를 실제로 고친 화면에만 붙인다: `mark --code WF-XXX --page <사본> --items "<바뀐 요소>" --expect-page-role working`. 사본 페이지 안의 표시이므로 정본 무접촉이다 |
| 승격 후 정본 반영 (관리자) | 대시보드 **[정본으로 올리기]** → `stage-apply --project <P> --page <사본>` → **`sync --project <P> --page <사본>`** → **`mark --clear --project <P> --page <사본>`**(칩 정리 — 정본이 된 페이지에 "반영됨" 표시가 남으면 다음 리뷰어가 오해한다). `stage-apply`는 **그 사본이 실제로 승격됐을 때만** 동작한다(`page_role_of == promoted` · 아니면 exit 3). ⚠ **감사 X4** — `sync`의 `--page`를 빼면 **항상 실행 거부**된다: 승격은 옛 정본을 `보관 · …`로 rename해 파일에 남기고 `[보관 완료]`도 penpot 페이지를 지우지 않아 그 파일은 **영구히 2페이지 이상**이다. 승격은 page uuid를 바꾸지 않으므로 **새 정본 page uuid = 사본 page uuid**(같은 값을 그대로 쓴다). ⚠ **감사 X3**(0.6.25) — 대시보드 **[보관 완료]**(`closed_at`)를 먼저 눌러도 `stage-apply`는 그대로 동작한다(마감 = 되돌리기 창을 닫는 것일 뿐 승격 사실을 취소하지 않는다). 0.6.24 이하는 여기서 `canonical`로 읽어 **영구 거부**됐고 남는 길이 `--force`뿐이었다 |
| 명세가 없어 역추출이 필요할 때 | `extract --page <사본> --no-plm --sae-dir <스테이징>` (penpot 읽기 전용 · PLM 정본 문서·정본 명세 무접촉) |
| 회신 | message 첫 줄 + `report`의 `<요약>` 첫 줄에 **어디서 작업했는지 + 반영 여부는 승격 이력으로 확인** 을 그대로 명시 |

**왜 재확인하나(감사 C1).** 릴레이는 작업을 넘길 때 사본 상태를 **딱 한 번** 조회한다. 세션이 실제로 쓰는 것은 그로부터 수 분 뒤다 — 그사이 관리자가 [정본으로 올리기]를 했다면 지시문이 가리키던 `--page`는 이제 **정본**이고, 그대로 `render` 하면 검토 없이 정본이 바뀐다(그리고 회신에는 "정본 미반영"이라고 잘못 적힌다). 재확인이 `⛔ 중단`을 내면 **쓰기를 전부 포기**하고, 그 사유 문장을 `message(kind="result")` 첫 줄과 `report(ok=false, result=…)`에 그대로 옮긴다(⚠ `reason` 인자 금지).

**누가 사본을 만드나 — 사람도 세션도 아니고 화면이다.** 대시보드에서 댓글을 골라 보내는 순간 전송 흐름이 사본을 **보장**한다: 없으면 자동 생성(`POST /wireframe/working-copy {…, ensure:true}` · 있으면 그대로 재사용), 만들 수 없으면(권한 없음·라이브러리 컴포넌트 파일 등) **전송 자체를 막고 사유를 보여준다**. 그래서 세션에 도착한 피드백 작업에는 원칙적으로 사본이 이미 있다 — 그런데도 없다면 그건 **비정상 신호**이므로 보류가 맞다(사본이 그사이 버려졌거나, 대시보드를 거치지 않은 경로다).

사본 상태 조회: `GET /wireframe/working-copy?project=<P>[&file=<F>][&include_closed=1]` → `items[]` 중 `role="working"` 행의 `page_id` 가 사본 페이지다(`archived`=보관본 · 정본은 행 없음). 대시보드 채팅에서 온 피드백 반영 작업은 **릴레이(plm-channel 0.1.26+)가 이 조회를 대신 수행**해 위 규칙을 지시문에 박아 보낸다(사본 없음·판정 불가 → 지시문이 통째로 '보류'로 바뀐다). 그 조회는 **작업 시작 시점 1회**뿐이므로 쓰기 직전 재확인(`page-role` · `--expect-page-role`, plm-channel 0.1.27+)이 경합을 막는 쪽이다.

## 패널 포맷 (AnyC 실측 재현)
- 배치: **그 화면의 모든 board(본체 + `<CODE>-A` 오버레이 + `<CODE>-Z` 미배치 등 보조)를 감싼 우측 끝 + 28**, width **330**. code 열 `panel_x+18`, 텍스트 열 `panel_x+84`. 즉 `panel_x = max(board.x + board.width) + 28` 이다 — 본체 board 만 기준으로 잡으면 우측에 있는 보조 board 를 패널이 덮는다(2026-07-31 실사용 보고). `panel_anchor()` 가 이 배치의 **유일한 SSOT** 이며 wfgen 최초 생성과 wfanno 재렌더가 같은 함수를 호출해 좌표가 100% 일치한다.
- 구성(z 하→상): `anno-bg`(흰 배경·라운드12·#D0D5DD 테두리) → `anno-title`("화면 설명 — <화면명>" · 14/700) → `anno-rule`(구분선 #EAECF0) → (note 있으면 `anno-note` · auto-height wrap) → 요소별 `anno-code`(9.5/700 #4F46E5) · `anno-label`("라벨 [유형]" · 11.5/600) · `anno-state`("상태: …") · `anno-act`("조작: …") · `anno-eff`(이펙트 · auto-height wrap).
- **무손실 왕복**: 여러 줄 필드(note·effect)는 penpot **auto-height 단일 오브젝트**로 그려 extract 가 원문 그대로 복원(요소당 필드 1오브젝트). 유형은 라벨의 `[유형]` 접미로 인코딩·복원.
- **멱등**: `anno:<CODE>` 그룹 1개로 감싸 재렌더 시 그 그룹만 삭제 후 재생성(중복 없음).
- **삭제 범위 = 내 패널뿐**(0.6.28~): 지우는 것은 ① 내 `anno:<CODE>` 그룹과 그 자손 ② 그룹 밖 레거시 `anno-*` 중 **내 패널의 좁은 밴드**(x=`frame.x+frame.width+28` ±10 · y=프레임 상단부터 **아래 이웃 프레임 상단 직전**까지) 안에 있는 것뿐이다. **다른 화면의 `anno:<CODE'>` 그룹 소유 객체는 절대 지우지 않고**, 소유가 모호하면(두 밴드에 걸침) 남긴다. → `--code` 로 화면을 하나씩 렌더한 결과와 `--code` 없이 전량 렌더한 결과가 같다(불변식 · 테스트 고정). 0.6.27 이하는 이웃 패널을 지웠다.

## 변경 칩 — `mark` (바뀐 프레임을 눈으로 알아보게)
> 관리자 요구(2026-07-31): *"변경한 프레임에 확인할 수 있도록 뭔가 표시를 해주면 좋겠다. 체크박스를 만들거나 별표시, 변경했다는 텍스트박스를 칩처럼 만들어 위에 붙여주거나."*

댓글 반영이 끝나도 사본 페이지에는 **어느 프레임이 바뀌었는지**가 어디에도 없었다 — 주석 패널은 프레임마다 항상 있으니 "바뀐 것"의 신호가 못 되고, 목업은 바뀐 뒤의 모습만 보여준다. `mark` 가 그 표시를 얹는다.

- **모양**: 알약(pill) 칩 1개 — 배경 `#F59E0B`(amber-500) · 테두리 `#B45309` · 글자 `#1F2937` 11.5/700. 문구는 `✱ 반영됨 · 07-31 · RDR.12, RDR.13`(별표 + 라벨 + 날짜 + 바뀐 요소).
- **자리**: 기본은 프레임 **바로 위**(제목 줄 위) **우측 정렬** — penpot 이 그리는 board 이름 라벨은 좌측 상단이라 겹치지 않고, 주석 패널은 프레임 **우변 +28**부터라 x 로도 만나지 않는다. 위가 막혔으면(위 이웃 프레임·남의 패널) **프레임 우측 상단 내부**로 폴백한다.
- **겹침 금지**: 두 자리 다 남의 것을 침범하면 **붙이지 않고 경고**한다(이웃을 밀어내지 않는다). 그때 **옛 칩도 지우지 않는다** — 지우고 못 붙이면 표시가 통째로 사라져 "바뀐 적 없다"로 읽히기 때문이다.
- **멱등·비파괴**: `chg:<CODE>` 그룹 1개로 감싸 재실행 시 그 그룹(+자손)만 지우고 다시 그린다. 이름이 **정확히 일치하는 그룹**에서만 출발하므로(좌표 밴드 추정 없음) 남의 칩·주석 패널·목업 도형은 후보에 들어오지도 않는다. **프레임 이름·아티팩트 규약·댓글 핀 무접촉**(칩은 root 소속 별개 객체다).
- **`--items`**: `12,13` 처럼 번호만 줘도 화면 코드로 채운다(`RDR.12`). 길어서 안 들어가면 담을 수 있는 데까지 담고 `외 N개`, 하나도 못 담으면 `N개 요소`로 축약한다(머리는 자르지 않는다).
- **`--label`**(기본 `반영됨`) · **`--date`**(기본 오늘 `MM-DD` · `--date ""` 면 날짜 생략).
- **지우는 시점**: 승격되면 그 페이지가 **정본**이다 — 칩이 남아 있으면 다음 리뷰어가 무엇이 새로 바뀐 것인지 오해한다. 그래서 `stage-apply` 가 끝나면 **`mark --clear` 명령을 이어서 안내**한다(승격 절차의 마지막 한 줄). 지우는 것은 penpot 쓰기라 `stage-apply`(penpot 무접촉 · 읽기+파일복사) 안에 섞지 않았다 — 쓰기 경로를 한 곳(`mark`)에만 둬야 페이지 역할 가드·revn 충돌 처리도 한 벌로 유지된다.
- 회귀 테스트: `plugin/plm-hub/tests/test_wf_mark.py`(생성·멱등·이웃 무피해·겹침 폴백/거부·정리·역할 가드·프레임 이름 불변).

## 실행
`DIR` = 플러그인 루트(`plugin/plm-hub`). 스크립트가 설정을 직접 읽어 env 미주입에도 동작(penpot 토큰 self-heal 내장).
```bash
# 신규 흐름(자동): 명세 → 목업+패널 → PLM 본문
python3 "$DIR/scripts/wfgen.py"  --project <P>              # 목업 + 주석 패널(기본 on · 끄려면 --no-anno)
python3 "$DIR/scripts/wfscan.py" --project <P>              # PLM 본문(SAE 표 + note)

# 주석 패널만 재렌더(명세 변경 후)
python3 "$DIR/scripts/wfanno.py" render  --project <P> [--code WF-XXX] [--dry-run]

# 기존 와이어프레임 일괄 편입(양방향)
python3 "$DIR/scripts/wfanno.py" sync    --project <P> [--dry-run]     # 명세없음=extract·있음=render
python3 "$DIR/scripts/wfanno.py" extract --project <P> --code WF-XXX   # penpot 읽기만 → 명세·PLM

# 작업용 사본 상태 재확인(읽기 전용 · penpot 무접촉) — 사본 모드에서 **쓰기 직전 1회**
python3 "$DIR/scripts/wfanno.py" page-role --project <P> --page <사본> --expect working   # 불일치=exit 3
python3 "$DIR/scripts/wfanno.py" render --project <P> --code WF-XXX --page <사본> --expect-page-role working \
        --sae-dir .ouroboros/docs/wireframes/.working/<사본>                # 사본 명세는 스테이징에서 읽는다
python3 "$DIR/scripts/wfanno.py" stage-apply --project <P> --page <사본>    # 승격 후에만 — 스테이징 → 정본 명세
python3 "$DIR/scripts/wfanno.py" sync       --project <P> --page <사본>    # 그 다음 PLM 정본 본문(--page 필수 · 감사 X4)

# 변경 칩 — 바뀐 프레임 표시(붙이기 · 사본 작업 마지막 단계)
python3 "$DIR/scripts/wfanno.py" mark --project <P> --code WF-XXX --page <사본> --items "12,13" \
        --expect-page-role working            # --label "수정 반영" --date 07-31 로 문구·날짜 교체 가능
python3 "$DIR/scripts/wfanno.py" mark --project <P> --page <사본> --clear                  # 승격 뒤 정리(칩 전량)
```
> **읽기전용 대상(예: 냅둬야 하는 penpot 파일) = `extract` 만** 사용(update-file 호출 0 · get-file revn 전후 동일로 검증). `sync` 는 로컬 명세가 없던 프레임을 render 하지 않지만, 명세가 한 번 생기면 이후 render 대상이 되므로 읽기전용 원천에는 `extract` 를 쓴다.

## 자가검증(권장)
- 렌더 후 `get-file → SVG → PNG`로 **프레임 + 우측 패널 region**을 렌더해 눈으로 확인(패널이 AnyC처럼 읽히고 프레임 무손상).
- 왕복: `extract` 로 그 패널을 명세로 되뽑아 원본과 대조(요소·상태·액션·이펙트·note 일치).

## 주의
- 모든 HTTP `user-agent` 명시(Cloudflare 기본 urllib UA 403 차단). 비차단(graceful)·비밀 노출 금지 — 실패해도 exit 0.
- `render`/`sync`는 penpot 파일을 수정(update-file). **읽기전용으로 보존할 penpot 파일엔 절대 render/sync(render on) 금지 — `extract` 만.**
- **댓글 반영 작업은 사본 없이는 시작하지 않는다**(위 강제 규칙). 사본이 없는데 "일단 정본에서" 진행하는 선택지는 없다.
- **다중 페이지 파일은 `--page` 필수** — 없으면 실행 거부한다(위 표). `extract` 도 penpot 은 안 건드리지만 **명세·PLM 본문을 덮으므로** 같은 가드를 받는다.
- PLM 본문 push 는 **비파괴**(기존 리치 문서는 스킵) — 덮어쓰려면 `--force`. `--force` 는 `sync` 의 **두 갈래 모두**에 적용된다(감사 H-6): 로컬 명세가 있어 render 로 흐른 프레임도, 로컬 명세가 없어 extract 로 흐른 프레임도 같은 규칙으로 덮어쓴다. 예전엔 extract 갈래에 `--force` 가 전달되지 않아 그 화면만 조용히 비파괴로 남았다(같은 명령이 화면마다 다른 계약을 따랐다 · 회귀 테스트 `tests/test_wfanno_force.py`).
