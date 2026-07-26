<!-- 기획 워크플로우 컨텍스트 뷰. 작업 완료 시마다 갱신. -->

## 세션 상태

| 상태 | 시작 |
|------|------|
| BS-004 구현 autorun 완료 (5/5) | 2026-07-26 |

## 활성 기획

| 이름 | 단계 | 비고 |
|------|------|------|
| BS-004 구현 1~3단계 (SRS-043~047) | **구현 완료** — typecheck·125테스트 통과 | 4단계(SRS-048)는 P2 서버 축과 함께 |
| 와이어프레임 42화면 (시나리오 재편성) | 완료 — 피드백 루프 대기 | penpot file=734044e5-a8b9-818b-8008-629fb599d7bc · 8단계 phase 행·구현상태 테두리(초록24/주황2/보라점선16)·우측 설명 패널 · 신규 ONB·WSCH·RTNC·COACH·MRPT · wfgen v2.1(order/phase/impl/desc) |
| 아키텍처 블루프린트 BP-001 | **완료** (2026-07-26) | DR-002(제품 전체 설계 조사) 신규 발급 + DR-001 인용 · 존 5·노드 15·엣지 18·시나리오 13 · bpcheck PASS(에러 0·경고 0·커버리지 UCS·SRS 67/67) · PLM 동기 완료 |

## autorun 산출 (SRS-043~047 · 전건 @plm 주석 · spec 5건+qa 각 2사이클)

- **SRS-043**: DB v16(prescription·set_type·target_rir) · domain/prescription(캐스케이드 20→22.4 재현·타입별 휴식) · 세션 렌더(RIR 라벨·행 잠금·제안 라인·미완료 종료 카운트) · 루틴 처방 에디터
- **SRS-044**: DB v17(weekly_schedule) · domain/weeklySchedule(월=0·모듈로 롤오버) · 루틴 탭 주간 카드+편집 모달(디로딩 표시만 — ADR-028)
- **SRS-045**: DB v18(experience_level·trainer_intent) · 온보딩 2단계 · 프로필 ExperienceCard · 면책 문구
- **SRS-046**: 접이식 팁 패널(2프레임↔단계 전환) · RIR 4p/웜업 3p 가이드 모달 · 카피 게이트 테스트 (GymVisual 에셋은 ADR-029 구매 후 exerciseMedia 매핑 교체)
- **SRS-047**: 시드 갭 15종(rename 0) · movementPatterns(14패턴·같은 패턴 후보) · 콘셉트 루틴 3종+저장 UI · finder 분류 보강(무결성 테스트가 검출)
- 검증: `npm run typecheck` ✓ · `npm test` 125/125 ✓ (미커밋 — 커밋은 사용자 확인 후)

## 배포 (2026-07-26)

- 커밋 62f8666 (v0.10.0) → origin/main 푸시 → 웹 빌드 → Netlify 드래프트 배포 → restore API로 프로덕션 승격(크레딧-프리 경로)
- 프로덕션 https://comforting-empanada-d0f054.netlify.app 에서 신규 번들(index-3eede08…) 서빙 확인

## 다음 작업

- 3D 움짤 파이프라인 완료(gif 오버레이+ingest 스크립트+/media3d 자체 호스팅+무결성 테스트) — **에셋 라이선스 확보만 남음**: ADR-029 게이트 ① 실집행 결과 GymVisual N-CRFL 원문에 앱 임베드 충돌 소지 발견(DR-001 갱신) → ⓐ GymVisual support 서면 확인 ⓑ Gym Animations/MoveKit 비교 — 사용자 결정 대기
- SRS-048(트레이너 권한·리포트) — P2 서버 컴포넌트와 함께 별도 /spec
- 알려진 이슈: PLM 벌크 동기 한도 — sync_bulk 413·codescan 400(서버 페이로드). 신규 문서 15건은 개별 POST로 동기 완료. codescan은 청크 패치 후 재실행(G3 갱신)

## 게이트

| 게이트 | 상태 |
|--------|------|
| G1 요구 / G2 설계 | pass |
| G3 구현 | @plm 주석 완료·codescan 400으로 딥링크 미동기(청크 패치 후 재실행) |

기존 이슈(범위 밖): ADR-012·013 supersedes dangling(레거시), ADR-025→026 Replaced 전이 필요(대시보드).

## 차단 요소

(없음)
