---
description: 아키텍처 블루프린트(BP)를 실존 근거로 저작/갱신 — 모델 계약 v1 + bpcheck 검증 → [아키텍처] 탭 인터랙티브 렌더 (ADR-032 · SRS-047)
---

# /plm-hub:blueprint — 프로젝트 아키텍처 설계도(BP) 저작/갱신

이 프로젝트의 **아키텍처 블루프린트**를 만들거나 고친다. BP는 그림 파일이 아니라 **검증 가능한 JSON 모델**이다 — `.ouroboros/docs/blueprint/BP-<NNN>.json`(CODE.json 래퍼·type=Blueprint)의 doc 안 `code_block(language="plm-blueprint")` 텍스트가 모델이고, 대시보드 **[아키텍처] 탭**이 이를 인터랙티브 SVG(존 레인·노드·엣지·시나리오 워크스루·artifacts 딥링크 칩)로 렌더한다. 대시보드 [아키텍처] 탭의 챗(mode=blueprint)과 **동일 플로우** — 탭 챗은 이 절차를 원격으로 구동하는 것뿐이다.

> 포맷 권위 = `_BLUEPRINT-METHODOLOGY.md`(모델 스키마 상세·저작 원칙·품질 기준) · 형식 정본 = `.ouroboros/docs/blueprint/BP-001.json`.

## 모델 계약 v1.1 (code_block 텍스트 = 이 JSON — version은 1 유지·persona/covers 선택 하위호환)

```
{
  version: 1,
  zones:  [{ id, label, hue?, desc? }],
  nodes:  [{ id, zone, label, kind?(client|service|db|queue|external|llm),
             role?, design?[], io?, basis?, artifacts?[], loc?, pos?{x,y,w?,h?} }],
  edges:  [{ id?, from, to, label?, kind?(sync|async|data) }],
  scenarios?: [{ id, label, persona?, covers?[], note?, steps: [{ text, nodes?[], edges?[] }] }]
}
```
- `pos` 생략 시 탭이 **존별 자동배치**(권장). `artifacts[]`/`covers[]`는 **그 프로젝트에 실존하는 아티팩트 코드만**(딥링크 칩 — bpcheck가 PLM /export 대조).
- **존마다 `desc` 1~2문장 권장**(그룹 한눈 파악용 — 선택·하위호환): 탭에서 존 라벨 클릭 시 그룹 개요 패널(설명·소속 노드·그룹 간 연결 요약)에 표시된다.
- 노드 `role/design/io/basis`는 실근거로 충실히(빈 껍데기 금지). 존 3~6개·노드 8~16개 권장(제품 실제 구조가 우선 — 넘치면 서브시스템 BP 분리 고려).
- 스텝 text·role/design/io/basis 산문 속 `SRS-011` 같은 코드는 탭이 **자동 딥링크 칩**으로 렌더 — 인라인 참조를 적극 활용.

## 시나리오 표준 — 페르소나별 E2E 여정 (ADR-033)

- **시나리오 = 페르소나별 엔드투엔드 여정.** 트리거→모듈 경유→데이터 축적→**다음 사이클 되먹임**까지, 각 스텝에 **비즈니스 로직(무엇을·왜)** 을 서술한다.
- 기대 수준 예시(AnyC): "일기 작성→LLM 챗봇 인터뷰→일기 완성→어휘·문법 학습→음성 회화 인터뷰→학습 결과 누적이 다음 학습에 영향" 같은 **6단계급 여정**.
- **사용자 여정만이 아니다** — 인제스트 파이프라인·신규 언어(도메인) 온보딩 같은 **운영·배치 여정**도 포함한다. 개수는 **제품이 필요한 만큼**(2~3개로 끝내지 말 것 — 대형 제품은 9종급도 정상).
- 프로젝트의 **UCS 전부 + BS 사용시나리오**를 커버(없으면 SRS 기능별 대표 여정+핵심 가치 루프). `scenario.persona`·`covers`(→UCS/SRS) 명시 — bpcheck 커버리지가 판정. `note`에 여정별 LLM 사용량/비용 등 운영 주석 권장.
- **갱신 규율(비파괴)**: 갱신 지시(낡음 배너·기획 후속·[재생성·갱신]) 시 기존 노드·pos·설명 보존, **변경분만** 반영(전면 재생성 금지 — 필요한 엣지/시나리오 추가는 허용).

## 절차

0. **설계 조사(DR) 선행 — BP 깊이의 원천**: 이 프로젝트에 DR(DesignResearch) 아티팩트가 없으면 **설계 조사를 먼저 수행**해 `.ouroboros/docs/design-research/DR-001.json`(CODE.json 래퍼 · type="DesignResearch" · status:"Draft")을 발급한다 — 요구 전체(URS/UCS/SRS·BS·PRD)를 읽고 심층 조사. doc 섹션 표준(H2 5개): ①도메인 모델·비즈니스 로직 심층(핵심 엔티티·상태 흐름·도메인 규칙) ②기술 선택지·트레이드오프(대안 비교표·결정 후보→ADR 예고) ③수치·용량·성능 목표(추정 근거 명시) ④위험·미해결 질문 ⑤아키텍처 스케치(존·컴포넌트 후보·데이터 흐름 초안). 각 항목에 요구 코드(URS/UCS/SRS) 인라인 인용 · 필요시 WebSearch로 외부 근거 보강(출처 명시). **DR이 이미 있으면 읽고 근거로 사용**(부족분만 갱신). 상세 = `_BLUEPRINT-METHODOLOGY.md` §0.
1. **근거 수집(추측 금지)**: plm `doc_get`/`artifact_get`으로 DR·SAD·ADR·SRS·Code(code_refs)·기존 BP를 읽고, 필요하면 소스 저장소 구조를 확인 — 설계도는 실존 근거로만 그린다.
2. **모델 저작/갱신**: 대상 BP를 정한다 — 갱신이면 그 `BP-<NNN>.json`, 신규면 다음 번호(첫 장은 `BP-001.json`). doc = H2 제목 + code_block(plm-blueprint 모델) + 설명 문단(읽는 법). **노드 `design`·`basis`에 DR의 결론(수치·선택지·근거)을 인용**한다 — basis에 `DR-001` 표기 → 탭이 딥링크 칩으로 렌더. 갱신 시 DR 갱신분(새 수치·선택지 변경)도 반영.
3. **검증(에러 0까지)**:
   ```bash
   python3 "$DIR/scripts/bpcheck.py" --project <PLM프로젝트>        # docs/blueprint/BP-*.json 전량
   python3 "$DIR/scripts/bpcheck.py" --file <path>                  # 특정 파일 1개만
   ```
   (`DIR` = 이 플러그인 루트 `plugin/plm-hub`. `--project` 생략 시 `.ouroboros/config/plm.json` 바인딩.)
4. **동기**: Write/Edit 도구로 저장하면 `plm-sync` 훅이 자동 upsert(래퍼 메타 + doc). 훅 미작동 시 폴백: plm MCP `import` + `PUT /artifacts/{project}/{code}/doc`.
5. **확인**: 대시보드 **[아키텍처] 탭**을 새로고침해 존 배치·엣지·시나리오 하이라이트·딥링크 칩을 눈으로 확인(겹치면 `pos`로 보정 후 재동기). 탭은 같은 모델로 **[설계도|컴포넌트 문서]** 2-뷰를 렌더 — 노드 설명이 충실해야 문서 뷰도 충실하다.

## bpcheck 검사 항목 (에러 = exit 1)

| 구분 | 검사 |
|------|------|
| 래퍼 | JSON 파스 · 필수키(id/type=Blueprint/doc) · id↔파일명 일치 |
| 모델 | code_block(language="plm-blueprint") 존재 · 모델 JSON 파스 · version==1 · zones/nodes/edges 필수 필드 · persona/covers 형식 |
| 무결성 | node.zone→존 실존 · edge.from/to→노드 실존 · 시나리오 steps의 nodes[]/edges[] 실존 · 중복 id |
| 실존 | nodes[].artifacts[]·scenarios[].covers[] 코드가 PLM 프로젝트에 실존(GET /export 대조 · 미도달 시 경고 강등) |
| 품질(경고) | kind 어휘 밖 · role/design/io/basis 전부 빈 노드 · hue 범위 · 빈 edges · **DR 근거 미인용**(프로젝트에 DR이 있는데 어떤 노드 basis에도 인용 없음 — DR 부재 자체는 경고 안 함) |
| **커버리지(경고·비차단)** | 말미 `▍BP 커버리지:` 블록 — 프로젝트 UCS·SRS 중 노드 artifacts∪시나리오 covers 어디에도 없는 코드 + covers 없는 시나리오를 크게 표면화(wfscan SAE 동형). 액션: 여정 시나리오를 저작해 covers로 연결 |

## 주의

- **미추적** 타입 — 게이트·매트릭스 밖, 대시보드 표시 위해 동기(Status 전이는 PLM 소유).
- 에러 상태로 "완료·탭 확인" 안내 금지 — bpcheck 에러 0을 만든 뒤 회신.
- 모든 HTTP는 `user-agent` 명시(Cloudflare가 python-urllib 기본 UA 차단 → 403). 탭 챗 원격 구동 시 질문은 message(kind="question") 규약(§CLAUDE.md 파트 E).
