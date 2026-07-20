<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->

## 세션 상태

| 상태 | 갱신 |
|------|------|
| **완료 — 착용장비 Phase 0 + D5 개정(브랜드 조건부 허용) 배포됨** | 2026-07-20 |

## 완료 작업

| SRS | 내용 | 커밋 |
|-----|------|------|
| SRS-037 | 착용장비 도메인(카테고리 8종·정규화·링크 해석·고지 판정) | `1dcf545` |
| SRS-038 | 작성 시 수동 태그(피드 컴포저·운동 요약) | `1dcf545` |
| SRS-039 | 클릭 집계 서버(GearClick·config·stats) | `1dcf545` |
| SRS-040 | 피드 카드 표시·고지 라벨·링크 열기·집계 | `1dcf545` |
| SRS-041 | 내 장비함 데이터 계층(로컬 v14 @json) | `1dcf545` |
| SRS-042 | 내 장비함 화면·진입점·컴포저 재사용 | `1dcf545` |
| ADR-027 D5 개정 | 브랜드·모델 조건부 허용 — `brand`·`brandSource` 코드 반영 | `7e818fa` |

- spec: `.ouroboros/docs/spec/20260720_gear-domain_spec.md` (**rev4**)
- 실측 근거: `.ouroboros/docs/research/20260720_gear-brand-detection-accuracy_research.md`
- 배포: 서버 Render(`/api/gear/*` 200/401 확인) · 웹 https://comforting-empanada-d0f054.netlify.app
  ⚠ Netlify 크레딧 소진 → **draft 업로드 후 `restore` 승격**으로만 배포 가능(자동 빌드 불가)
  ⚠ CLI 빌드는 `EXPO_PUBLIC_SERVER_URL=https://liftgram-api.onrender.com/api` 필수(미지정 시 localhost 로 굳음)

## 검증 상태

- `npm test` **104 pass / 0 fail** (T1~T21) · app·server `typecheck` 0 error
- 브라우저: 컴포저 선택기 · 내 장비함 브랜드 저장·복원 · v14 마이그레이션(웹 LokiJS) 확인
- 미확인 1건: 컴포저 모달의 "내 장비함에서 빠르게 추가" 행(피드가 로그인 게이트라 렌더 미확인)

## 확정 계약 (ADR-027)

- **D2** 제휴 비활성 출발 — 서버가 `{ enabled, links }` 제공, `links`=사전 생성 딥링크를 **문자 그대로** 사용(가공 금지, 운영정책 4.1 링크 조작 = A등급)
- **D5 개정** 브랜드·모델 **조건부 허용** 3경로: ⓐ사용자 직접 입력(**Phase 0 범위**) ⓑ자동 감지 제안+게시 전 확인(**재측정 통과 후 Phase 1**) ⓒ카테고리 8종 폴백
  - 유일한 금지선: **사용자가 확인하지 않은 자동 감지 결과의 게시·표시**
  - 확인 상태: 별도 boolean 없음 — `brand` 저장 자체가 확인 통과를 뜻함(미확인 제안은 저장 경로 부재)
  - `brandSource`(`user`|`auto`)는 **태그 원천 `source` 와 별개 축** — 합치면 D7 성과 분리 측정이 오염됨
- **D6** 고지 라벨은 게시물 **첫 부분**(작성자명 아래), 끝부분 표기 폐지(2024-12-01)
- **D3** 수익 크레딧 환원 **영구 배제**(약관 제7조·운영정책 2.2) / **D4** 사진 위 오버레이 태그 금지
- 불변식: 정리 A(`kind:'deeplink'` ⟺ 고지필요&&렌더됨) · 정리 B(`enabled!==true` → links 무시, 쿼리 키 `q` 하나)

## 남은 작업

- **브랜드 자동 감지(Phase 1)** — **프로덕션 모델·실사용자 사진 재측정 통과가 선행 조건.**
  판정 지표는 적중률이 아니라 **브랜드 오단정률**(판정선은 측정 전 확정). 표본에 국내 브랜드·저가 노브랜드·
  실사용 조건(모션 블러·역광·거울 셀카·마모 로고) 포함할 것. 게시 전 확인 UI 소유는 SRS-026.
- **쿠팡 파트너스 가입** — 웹 매체 등록은 지금 가능(앱은 스토어 출시 후). **가입 즉시 수수료 적립 시작**,
  지급만 최종승인(누적 판매 15만원)까지 보류 — 소멸이 아니라 에스크로.
  승인 후 Render env `GEAR_AFFILIATE_ENABLED`·`GEAR_AFFILIATE_LINKS` 주입만으로 앱 재배포 없이 활성화.
- Phase 2(인플루언서 외부 링크·성과 리포트·브랜드 과금) — SRS 미발급

## codescan / plm-hub 상태 (2026-07-20 확인)

- G1·G2·G3 **orphan 0** · Code 363건·realizes 378건·문서 `code_refs` 35건 동기 완료
- ⚠ **설치본에만 반영된 임시 패치가 있다.** `plm_codescan.py` 의 `cap_code()`(Code 키 64자 상한 축약)를
  `~/.claude/plugins/cache/jwk-platform/plm-hub/0.6.8/scripts/` 에 직접 복사해 넣었다(`.bak-*` 백업 있음).
  없으면 `/import` 가 `400 code too long (max 64 chars)` 로 **363건 배치 전량 실패**한다(초과 3건 때문).
- **다음 `/plm-hub:update` 시 이 패치가 날아간다.** 마켓플레이스 배포 원본은 liftgram 이 아니라
  `~/desktop/tarae/autotutor/plugin/plm-hub/`(v0.6.11)이고 거기엔 `cap_code` 가 **없다**.
  liftgram 의 `plugin/plm-hub/`(v0.6.8 사본)에만 수정이 고립돼 있다.
  → 영구 해결은 autotutor 원본에 이식 + 버전 범프. **사용자 지시로 이번엔 보류**(다른 리포라 범위 밖).
  같은 플러그인을 쓰는 fda-manager·autotutor 도 경로·심볼명이 길면 동일 증상.

## 알려진 함정

- **워크플로우 서브에이전트의 Write에는 plm-sync hook이 발동하지 않는다** → 아티팩트 생성 후
  `sync_bulk.py import --project liftgram` 수동 실행 필요(`.ouroboros/env/.env` 로드 선행)
- **결정 개정 시 전파 대상은 grep으로 먼저 전수 조사할 것** — 이번 D5 개정에서 3회 연속 누락 발생
  (URS-017·RM-016·SRS-039/042·SAD-018 → BS-003·spec → **i18n 사용자 노출 문자열**). `.ouroboros/docs/**` + `app/src/**` 양쪽
- 소스에 제어문자를 리터럴로 넣지 말 것 — 정규식 문자클래스는 `\uXXXX` 이스케이프로
- Metro 캐시 지연 — 코드 수정 후 첫 스냅샷에 반영이 안 보이면 `--clear` 후 재로드
