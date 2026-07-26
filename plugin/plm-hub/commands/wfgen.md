---
description: SAE 와이어프레임을 penpot에 헤드리스(에디터·플러그인 0) 생성 — 요소 나열이 아니라 화면유형별 **공간 배치 목업**으로 발급(v2 · SRS-042)
---

# /plm-hub:wfgen — SAE 화면을 penpot에 **실제 화면 목업**으로 헤드리스 생성

> 사용자 흐름(기획 BS/RM → 생성 지시 → 피드백 루프) 전체는 **`plugin/plm-hub/WIREFRAME-GUIDE.md`** 참조. 이 문서는 생성기 도구 레퍼런스.

`.ouroboros/docs/wireframes/WF-<CODE>.json`(SAE 아티팩트)을 읽어 penpot `Wireframes` 프로젝트에 **화면당 1 board(frame)** 를 헤드리스로 생성한다. **v2 재설계(2026-07-20)**: 요소를 같은 폭 박스로 세로 나열하던 "태그 리스트"를 폐기하고, 화면을 **실제 앱 목업**(공간 배치 + 요소 유형별 시각 표현)으로 그린다(방법론 `_WIREFRAME-SAE-METHODOLOGY.md` §6). penpot MCP(`execute_code`)는 **열린 에디터 + 플러그인 연결**이 필수라 프로덕션 제약이 크다 — 오픈소스·셀프호스팅이므로 에디터가 내부적으로 쓰는 `update-file` change API를 서버측에서 직접 호출하는 **헤드리스**가 정석(memory: `penpot-headless-generation`).

## 두 축 (품질의 핵심)
- **① 시각유형 헬퍼** — 요소 `유형`을 각각의 UI 프리미티브로 렌더: `navbar`(상단 바)·`field`(테두리+placeholder)·`button`(채운 라운드+중앙 라벨)·`toggle`(pill)·`card`/그리드(표지+제목+메타+배지)·`panel`/`sidebar`(구획 배경)·`chip`(상태 배지)·`code_tag`(mono 코드 보조표기).
- **② 화면유형(archetype) 레이아웃 빌더** — 요소를 x/y/w/h 로 **공간 배치**한다:
  - `list_grid` — 네비바 + 검색 툴바 + 시리즈 헤더 + **카드 그리드**(서재·목록형).
  - `workspace` — 상단 바 + 좌/중 큰 본문 패널 + 우 사이드바 + 하단 페이지 컨트롤(리더·에디터형).
  - `console` — 상단 바 + 컨트롤 + **가로 스테이지 플로우**(노드+화살표) + 스테이지 카드/결과(파이프라인형).
  - `auto` — 미분류 화면의 범용 앱 레이아웃(네비바+툴바+그리드) — **세로 나열 금지**.

SAE 스펙에서 요소코드·라벨·유형·상태·이펙트를 읽어 **내용**을 채우되 **배치는 archetype 템플릿**이 결정한다(요소 role = 유형 + 라벨 키워드 + 순서로 추론). 반복 요소(카드·스테이지·리스트)는 **여러 인스턴스로 전개**해 실제 화면 밀도를 만든다. (SAE 파서는 `scripts/_sae_parse.py` 공용 모듈 — `/plm-hub:wfscan` 의 **아티팩트 본문=요소별 SAE 표 자동 채움**과 규약을 공유한다.)

## 동작
1. 설정/토큰 해석(env > `.ouroboros/env/.env` > `config/plm.json` > 기본값). penpot 토큰 = `PENPOT_ACCESS_TOKEN`(별칭 `PENPOT_API_TOKEN`).
2. penpot 팀 `PLM · {project}` → `Wireframes` 프로젝트 id 취득(또는 `--penpot-project-id` 직접 지정).
3. (`--delete-file`) 기존 파일 삭제 → `create-file{name, project-id}` → `get-file`로 `revn`·`vern`·`pageId`.
4. 각 화면: SAE 파싱 → archetype 선택(화면코드/스펙/휴리스틱) → 빌더가 board(frame) + 요소를 **공간 배치**한 `add-obj` change-op로 조립. **요소는 역할별 `group`(예: `LIB.02 검색바`)으로, 화면코드 라벨은 z-top `🏷 코드` group으로 묶는다**(플랫 나열 아님 — 레이어 트리 정리). 보드는 가로로 나란히.
5. `update-file{id, revn, vern, sessionId, changes[]}` 로 커밋. **`vern` 필수 — 빠지면 400**(params-validation).
6. `get-file` 재조회 → 각 board·자식 수를 대조 검증·보고.
7. **★자가검증(필수)**: `get-file → SVG → PNG`(rsvg-convert)로 렌더해 **눈으로** "실제 화면처럼 보이는가" 확인. 태그 리스트로 보이면 레이아웃을 고쳐 재생성·재렌더. **렌더 확인 없이 "완료" 금지.**

## shape 모델 (memory: penpot-headless-generation)
- 공통 obj: `id,name,type,x,y,width,height,rotation:0, selrect{x,y,w,h,x1,y1,x2,y2}, points[4], transform/transformInverse(identity), parentId, frameId, fills[{fillColor,fillOpacity}], strokes[], proportion, proportionLock, constraintsH/V, r1~r4`.
  - 축정렬(회전0): selrect·points·transform은 x/y/w/h에서 도출. 루트 부모 = `00000000-0000-0000-0000-000000000000`.
  - **penpot 좌표는 절대좌표** — board가 x=440에 있으면 자식 x도 `440+offset`. board(type:frame)는 `shapes:[childId,...]`, 자식은 parentId/frameId=board.
- text: `type:text, growType:auto-width, content{root>paragraph-set>paragraph>leaf(text)}`. leaf/para 속성 `fontId/fontFamily:sourcesanspro, fontSize(문자열), fontWeight, textAlign …`, leaf에 `text`·`fills`. **positionData 생략 가능**(penpot 렌더 시 계산).
- group: `type:group, shapes:[childId,...], selrect=자식 bbox`(x/y/w/h·points·transform도 bbox에서 도출). 자식은 `parentId=group`·`frameId=board`. **add-obj는 부모 먼저(pre-order)** — group 생성 후 자식. board 직속 자식이 전부 group이 되도록 finalize에서 스택을 닫는다(느슨한 rect/text 0). `🏷 코드` group은 마지막에 append(z-top)·레이어 패널에서 접기/숨김 가능.

## 프레임 이름 규약 (wfscan 왕복)
board name = **`<SCREEN_CODE> <화면명>`**(예 `LIB 서재 (Library)`). 앞 토큰이 `[A-Z]{2,6}`여야 이후 `/plm-hub:wfscan`이 SCREEN_CODE를 파싱해 `WF-<CODE>` 아티팩트로 역발급할 수 있다(생성↔스캔 왕복).

### 실행
`DIR` = 이 플러그인 루트(`plugin/plm-hub`). 스크립트가 설정을 직접 읽으므로 env 미주입 시에도 동작.
```bash
python3 "$DIR/scripts/wfgen.py" --project <PLM프로젝트> --dry-run    # 검증: 네트워크 없이 파싱·조립·op수·archetype만
python3 "$DIR/scripts/wfgen.py" --project <PLM프로젝트>              # 생성: 발견된 WF-*.json 전 화면
python3 "$DIR/scripts/wfgen.py" --project <PLM프로젝트> --screens CODE,CODE   # 특정 화면만(예: LIST,DTL)
python3 "$DIR/scripts/wfgen.py" --project <PLM프로젝트> --delete-file <나쁜파일ID>  # 기존 파일 교체
python3 "$DIR/scripts/wfgen.py" --project <PLM프로젝트> --archetype workspace       # 전 화면 강제 레이아웃
```
> **생성 후 반드시 렌더 자가검증**(동작 7). 렌더 헬퍼 예시는 재현 참고용으로 scratchpad `wf_render.py`(get-file→SVG→PNG) 참조 — `rsvg-convert`만 있으면 완전 헤드리스.

## 인자
| 인자 | 용도 | 기본 |
|------|------|------|
| `--project` | PLM/penpot 팀 프로젝트명 → 팀 `PLM · {project}` | config/plm.json `project` |
| `--file-name` | penpot 파일명 | `"{project} 와이어프레임 (SAE)"` |
| `--screens` | 생성할 화면코드 CSV | **SAE 디렉토리의 WF-*.json 전량(개수 제한 없음)**. 스펙·코드 둘 다 없으면 안내 후 종료(고정 샘플 폴백 없음) |
| `--sae-dir` | `WF-*.json` 디렉토리 | `<ouro>/docs/wireframes` |
| `--penpot-project-id` | penpot Wireframes 프로젝트 id 직접 지정(팀명 해석 생략) | (팀명으로 해석) |
| `--archetype` | 전 화면 강제 레이아웃(`list_grid`·`workspace`·`console`·`auto`) | 화면코드/스펙/휴리스틱 자동 |
| `--delete-file` | 생성 전 이 penpot 파일 id 삭제(나쁜 파일 교체) | — |
| `--dry-run` | 네트워크 없이 파싱·조립·op수·archetype만 출력 | — |

> **화면은 이 프로젝트의 SAE 스펙(`WF-*.json`)에서 나온다 — 고정 샘플(LIB/RDR/PIPE) 없음, 개수 제한 없음.** 스펙이 하나도 없고 `--screens`도 없으면 "SAE 스펙을 먼저 저작하라"는 안내 후 종료한다(계획 BS/Roadmap/요구에서 필요한 화면을 도출해 화면마다 `WF-<CODE>.json` 저작 → 실행). `--screens <CODE,...>`로 명시하면 스펙 없이 화면명=코드 골격도 가능. archetype은 스펙의 `archetype` 필드 > 화면코드 힌트 > 휴리스틱(카드그리드/폼/파이프라인/워크스페이스) > `auto`로 자동 선택.

## v2 스코프 / 한계
- **v2**: 요소 유형별 시각 프리미티브 + 화면유형 레이아웃 빌더로 **공간 배치 목업** 생성(태그 리스트 폐기). role 추론 = 유형 + 라벨 키워드 + 순서.
- **한계(솔직히)**: ① SAE는 요소당 1행(코드·라벨·유형·상태·이펙트)만 주고 **인스턴스별 데이터(제목·쪽수·샘플)는 없음** → 카드/스테이지의 반복 콘텐츠는 archetype 템플릿이 placeholder/합성값으로 채운다(하이파이 아님·의도된 와이어프레임). ② role 추론이 키워드 기반이라 라벨이 관례를 벗어난 프로젝트는 일부 요소가 `auto`로 떨어질 수 있음. ③ 매 실행 **새 파일**(멱등 아님 — 교체는 `--delete-file`). ④ 요소·라벨 **그룹화는 구현**(레이어 트리 정리)이나 penpot **컴포넌트/Assets 승격**·`/plm-hub:wfscan` 자동 연동·프레임 스냅샷 임베드는 미구현(그룹은 컴포넌트로 후속 승격 가능).

## 주의
- 모든 HTTP는 `user-agent` 명시(Cloudflare가 python-urllib 기본 UA 차단 → 403).
- `update-file`은 `vern` 필수. revn/vern은 `get-file`에서 읽는다(변경 시 revn 증가).
- 비차단(graceful)·비밀 노출 금지. penpot 실패해도 exit 0. shape 필드 누락 시 penpot이 렌더 안 함 — 필드는 memory 문서와 정확히 일치시킬 것.
