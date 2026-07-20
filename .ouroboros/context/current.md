<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->

## 세션 상태

| 상태 | 시작 |
|------|------|
| **autorun 6/6 완료 — 커밋·배포 단계** | 2026-07-20 |

## 활성 작업

| SRS | 내용 | 상태 |
|-----|------|------|
| SRS-037 | 착용장비 도메인(카테고리·정규화·링크 해석·고지 판정) | 완료 |
| SRS-038 | 작성 시 수동 태그(피드 컴포저·운동 요약) | 완료 |
| SRS-039 | 클릭 집계 서버(GearClick·config·stats) | 완료 |
| SRS-040 | 피드 카드 표시·고지 라벨·링크 열기·집계 | 완료 |
| SRS-041 | 내 장비함 데이터 계층(로컬 v14 @json) | 완료 |
| SRS-042 | 내 장비함 화면·진입점·컴포저 재사용 | 완료 |

- spec: `.ouroboros/docs/spec/20260720_gear-domain_spec.md` (rev3)
- 브라우저 검증: 컴포저 선택기·내 장비함 저장·v14 마이그레이션(웹 LokiJS) 확인. 미확인 1건 = 컴포저 모달의 "내 장비함에서 빠르게 추가" 행(로그인 필요)

## 작업 범위 (이번 세션 변경분 — 미커밋)

**코드 (SRS-037)**
- `app/src/domain/gear.ts` (신규) · `app/src/domain/__tests__/gear.test.ts` (신규 · T1~T20)
- `app/src/domain/index.ts` (배럴 1줄) · `app/src/i18n/locales/{ko,en}.ts` (`gear.cat.*` 8키 쌍)

**아티팩트 (신규 10)**
- `decisions/ADR-027.json` · `requirements/URS-017.json` · `requirements/SRS-037~042.json`
- `roadmap/RM-016.json` · `design/SAD-020.json` · `product/BS-003.json`(PLM→로컬 회수)

**아티팩트 (개정 3)** — `requirements/SRS-026.json` · `design/SAD-018.json` · `roadmap/RM-013.json` → Phase 1+/P3 축소

**문서** — `docs/research/20260720_coupang-partners-policy_research.md` · `docs/spec/20260720_gear-domain_spec.md`

## 현재 위치

- **마지막 완료**: SRS-037 전체 체인. `typecheck` 0 error · `npm test` **103 pass / 0 fail**(기준선 83 → +20) · T1~T20 20그룹 · 변이 테스트로 카테고리 결속 검증
- **PLM**: 신규 10건 등재, 관계 39건, **게이트 orphan 0**(G1·G2·G3 pass)
- **다음**: 사용자가 ⓐ강도↓ / ⓑ현행 / ⓒ중단 / ⓓ선별 중 택일 → SRS-038부터 재개
- **미커밋**: 직전 세션 버그픽스 4파일(analyticsRepository·workoutRepository·oneRepMax·domain.test)도 함께 미커밋 상태

## 확정 계약 (ADR-027 · SAD-020 · rev3 spec 일치)

- 서버(SRS-039)가 `{ enabled, links }` 제공. `links`=사전 생성 딥링크(`link.coupang.com/a/…`)를 **문자 그대로** 사용, 가공 금지(운영정책 4.1 링크 조작 = A등급)
- `resolveGearLink(c, cfg, ctx)`가 **URL 획득 유일 경로** — 고지 렌더 사실을 인자로 요구. 검색어 사전·URL 조립기·호스트 판정은 전부 모듈 내부
- **정리 A**: `kind:'deeplink'` ⟺ 고지 필요 && 고지 렌더됨 / **정리 B**: `enabled!==true` → links 전면 무시, 추적 0개 검색 URL
- 고지 트리거 = `enabled===true` **또는** 허용 호스트 딥링크 존재. 라벨은 게시물 **첫 부분**(작성자명 아래), 끝부분 표기 폐지(2024-12-01)
- 수익 크레딧 환원 **영구 배제**(약관 제7조·운영정책 2.2) · 사진 위 오버레이 태그 금지 · 카테고리 8종만

## 차단 요소

- **진행 방식 사용자 결정 대기** (autorun `status: paused`)
- 쿠팡 파트너스 가입·매체 등록(앱스토어 출시 후)·최종승인 = 사람이 외부 처리. Phase 0 진행은 막지 않음
- SRS-036: 카카오 REST 키 발급 — 미해소(별건)
- 직전 세션 미결: UCS-017 제목 정정 · dead column 정리 · BS-002 잔여 백로그 **5건**(변형 3건 #21·#19·#26은 2026-07-20 완료 재판정, 표시 보강분만 BS-002 '후속 개선(별건)' 절로 이관)

## 알려진 함정 (이번 세션 확인)

- **워크플로우 서브에이전트의 Write에는 plm-sync hook이 발동하지 않는다** → 아티팩트 생성 후 `sync_bulk.py import --project liftgram` 수동 실행 필요(`.ouroboros/env/.env` 로드 선행)
- 소스에 제어문자를 리터럴로 넣지 말 것 — 정규식 문자클래스는 `\uXXXX` 이스케이프로
