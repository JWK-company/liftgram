# 아티팩트 JSON 포맷 (ADR-019 동형) — 단일 저작 기준

> **모든 기획 아티팩트는 `CODE.json` 으로 생성한다. markdown(.md) 금지.** 웹 에디터·파일·DB가 동일한 이 JSON을 공유(동형).
> 변환기(converter) 없음 — Claude도 웹 에디터도 **이 JSON을 직접** 만든다.

## 1. 래퍼 구조 (최상위)
```json
{
  "schemaVersion": 1,
  "id": "URS-001",
  "type": "URS",
  "title": "한 줄 제목",
  "status": "Draft",
  "owner": "책임 역할",
  "product": "제품",
  "created": "2026-06-28T00:00:00Z",
  "updated": "2026-06-28T00:00:00Z",
  "sync": true,
  "tags": ["login", "결제"],
  "relations": { "derives_from": ["URS-001"] },
  "doc": { "type": "doc", "content": [ /* 본문 노드 */ ] }
}
```
- `tags`(선택·다중 자유 라벨 — type 외 분류·필터). 기존 frontmatter 필드 = JSON 최상위. **`relations`** = owner 관계키(derives_from·refs·informs·supersedes·realizes·covers·elaborates) + 비-owner 소프트관계 **`relates_to`** + BS 전용 **`targets`**. URS는 owner relations 없음(피참조 루트).
  - **`relates_to`**(선택·비-owner): 디스커버리 근거(BS·MR·CA)를 향한 소프트 "관련" 링크. **비추적** — G1/G2 게이트·추적 매트릭스에서 자동제외. src=`PRD|URS|SRS|SAD`, **dst=`BS|Business`**(구 MR/CA는 Business로 이행). /business·/plan이 기재(`{"relates_to":["BIZ-001"]}`).
- **`targets`**(BS 전용·P0-3): BS가 피드백을 겨냥하는 대상 아티팩트. src=`BS`, dst=BS·MR·CA 제외 전 타입. **비추적**(게이트·매트릭스 제외·그래프 표시) — "적용"(스냅샷, P1)의 대상 지정. 예: `{"targets":["SRS-005"]}`. 후지정 가능(발급 시 없어도 됨).
- **`generated_from`**(계보·P1-2): "무엇으로부터 만들어졌나" — `Business→BS`·`PRD→BS*`(다수 병합)·`Roadmap→PRD`. **비추적**(그래프 계보 레인 전용). /business·/plan이 발급 시 자동 기재. 예: PRD에 `{"generated_from":["BS-001","BS-002"]}`.
- 타입별 추가 필드: URS=`stakeholder`,`priority` / SRS=`kind`("FR"|"NFR"),`acceptance_criteria` / **BS=`kind`("idea"|"feedback" — 발급 시 명시, 미지정=idea)** / Code=`granularity`,`build_state` 등. **BS**=다수 발급(P0-3: `BS-001`,`BS-002`… 채번·`product/`·targets 관계 보유 가능). **Business**=통합 조사 보고서(구 MR+CA — ADR-027): 다수 발급(`BIZ-00N`)·`product/`·완성 보고서 파일 첨부가 본체·`generated_from`(→BS)만 발신. MR/CA 신규 발급은 서버가 400 거부.
- **본문 = `doc`**(ProseMirror 트리). 아래 노드 어휘만 사용.

## 2. doc 노드 어휘 (이것만 사용 — doc-schema 계약)
| 노드 | JSON | 용도 |
|------|------|------|
| 제목 | `{"type":"heading","attrs":{"level":2},"content":[{"type":"text","text":"…"}]}` | 섹션 헤더(level 1-6) |
| 문단 | `{"type":"paragraph","content":[{"type":"text","text":"…"}]}` | 본문 |
| 불릿 | `{"type":"bullet_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[{"type":"text","text":"항목"}]}]}]}` | 목록 |
| 번호 | `{"type":"ordered_list","attrs":{"order":1},"content":[ /* list_item */ ]}` | 번호 목록 |
| 인용 | `{"type":"blockquote","content":[ /* block */ ]}` | 인용/주의 |
| 코드 | `{"type":"code_block","attrs":{"lang":"ts"},"content":[{"type":"text","text":"코드"}]}` | 코드 블록 |
| 구분선 | `{"type":"horizontal_rule"}` | 수평선 |
| 표 | `{"type":"table","content":[{"type":"table_row","content":[{"type":"table_header"\|"table_cell","content":[/* block */]}]}]}` | 표 |
| 줄바꿈 | `{"type":"hard_break"}` | 강제 줄바꿈(inline) |
| 이미지 | `{"type":"image","attrs":{"src":"/api/files/<key>","alt":"…"}}` | 스크린샷·GIF 등(업로드 후) |
| 파일 | `{"type":"file","attrs":{"key":"<key>","name":"…","mime":"…","size":N}}` | PDF·문서·데이터 첨부(업로드 후) |

**인라인 마크**(text 노드의 `marks`): `{"type":"text","marks":[{"type":"strong"}],"text":"굵게"}` — strong·em·code·link(`{"type":"link","attrs":{"href":"…"}}`).

**미디어 첨부**: 로컬 스크린샷·GIF·PDF·데이터 등 증거·분석 자료는 `/plm-hub:upload <file>`(또는 `plm_upload.py`)로 대시보드 스토리지에 올려, 반환된 **image/file 노드**를 본문 `doc.content`에 임베드한다. `src`/`key`는 대시보드 `/api/files/<key>` 경로. **필요한 자료만**(불필요한 파일 금지). 대시보드 편집 시엔 드래그·붙여넣기·슬래시(`/이미지`·`/PDF`·`/파일`)로도 첨부.

규칙: text 노드는 `inline` 컨텍스트(paragraph·heading·table_cell 등)에만. block은 doc/list_item/blockquote/table_cell content에. 빈 attrs·marks 생략.

## 3. 최소 예시 (URS)
```json
{
  "schemaVersion": 1, "id": "URS-001", "type": "URS", "title": "단일 로그인",
  "status": "Draft", "owner": "PM", "product": "platform",
  "created": "2026-06-28T00:00:00Z", "updated": "2026-06-28T00:00:00Z", "sync": true,
  "stakeholder": "전체 사용자", "priority": "High",
  "doc": { "type": "doc", "content": [
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "배경 / 이해관계자" }] },
    { "type": "paragraph", "content": [{ "type": "text", "text": "사용자는 서비스마다 따로 로그인하는 불편을 겪는다." }] },
    { "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "수용 기준" }] },
    { "type": "bullet_list", "content": [
      { "type": "list_item", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "한 번 로그인으로 전 서비스 접근" }] }] }
    ] }
  ] }
}
```

## 4. 규칙
- 파일명 = `CODE.json`(`docs/{type→dir}/URS-001.json`). **.md 생성 금지.**
- `created`/`updated` = 현재 UTC. `status: Draft` 고정(전이는 PLM 대시보드).
- relations에는 **owner 방향만**. 역방향은 매트릭스 역산.
- 본문은 반드시 위 노드 어휘로. 불확실하면 paragraph로.
- 저장 시 plm-sync hook이 doc jsonb + relations를 PLM에 upsert(동일 JSON).
