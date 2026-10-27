<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P2 /qa code 조치 보고 (커밋 e102cb0 · 브랜치 feat/opengym-p2 · 미배포)

대상 보고서: `liftgram/.ouroboros/docs/qa/_work/20261027_opengym-p2-code.md` P2-1~P2-11

## 지적별 처리

| ID | 처리 | 내용 |
|---|---|---|
| P2-1 | 고침 | `MuscleLoadItem.isFailed` 추가 → `isExcludedItem`(워밍업·실패) 한 곳에서 판정, `setsByMuscle`이 뺀다(ADR-039 개정). 호출부 3곳(sessionMuscleLoad·periodMuscleLoad·periodSummary) + 새 periodMuscleBalance 는 값만 넘김. 테스트: domain 2건 + periodSummary 1건 + e2e(실패 세트 → 시트 가슴 1·통계 가슴 1) |
| P2-2 | 고침(①) | 그림을 오른쪽 열 「시작」 **아래**로(높이 56→40). 360 이름 칸 켬 188 = 끔 188px(예전 켬 123). 시작 버튼 x·폭·높이·색 켬=끔(e2e 가드). 카드 높이는 79→102(+23) 그대로 — 글자 열 4줄(「…중심」)이 높이를 정한다. ③(추천 카드 문구 합치기)은 360에서 한 줄이 ~19자라 잘려 택하지 않음 |
| P2-3 | 고침 | 창은 위쪽 숫자·전 기간 비교와 같은 「지금 − N일」 롤링 그대로(데이터 겹침 없음). 날짜 대신 「최근 7일」·「7~14일 전」 상대 일수로 표시 → 같은 날짜가 앞뒤에 함께 안 보인다. 보고서의 자정 정렬안(끝 = startOfDay(now) − (k−1)·N)은 k=1 창이 지금 창과 거의 전부 겹쳐 쓰지 않음. 결정은 MuscleBalanceCard 머리 주석에 남김(스펙 문서는 다른 폴더라 수정 안 함) |
| P2-4 | 고침 | 볼륨을 세트와 **같은 세트**(완료·작업 세트·유산소 제외)로 **주근육 각각**에 더한다 + 안내 「볼륨은 주근육으로 쓰인 세트만 더해요」 |
| P2-5 | 고침 | `periodMuscleBalance(start,end)` — getCompletedSets 1회로 세트·볼륨. 카드의 이중 조회 제거(getMuscleDistribution 은 남겨 둠 · 원본 호출 주석 보존) |
| P2-6 | 고침 | 쿼리에서 읽은 값(pending)을 칩 상태가 따라잡기 전엔 주소를 쓰지 않는다(StrictMode 재실행에도 안전). 카탈로그 첫 조회 중복은 lazy 초기값이 SSR 하이드레이션 차이를 만들고 CatalogClient(병렬 세션 공유 파일)를 더 건드려야 해 유지 |
| P2-7 | 고침 | 「기록된 근육이 없어요」(빈 문구 2곳) · aria 「한 근육: …」 · en "logged" |
| P2-8 | 고침 | 줄 선택 시 그림 aria-label 앞에 「표시: ○ ·」(시트·통계) + 선택 줄 왼쪽 2px brand-vivid 막대. e2e로 aria 확인 |
| P2-9 | 고침 | 「…중심」 글자는 결과 받은 뒤에만 그림(빈 줄 자리잡기 제거). 그림 자리는 읽는 중에도 고정. 루틴 종목 줄 구독(`watchRoutineExercises`, 종목·계획 세트 서명)으로 동기 변경을 따른다. 루틴별 마지막 결과로 먼저 그려 다시 열 때 흔들림 없음. 근육 0 루틴은 첫 열람 때 한 번 줄어드는 것은 남음 |
| P2-10 | 일부 | 추가: `plannedWorkingSets`를 domain 순수 함수로 옮기고 단위 테스트(처방 warmup·빈 처방·0·NaN·음수·null), 실패 세트 domain/periodSummary/e2e, 운동 화면을 연 채 다른 탭에서 끄기/켜기 e2e, 360 켬/끔 이름 칸 가드. 남김(이유): RecoCard(추천 status=ok 에 여러 날 기록 필요 — 시드 헬퍼 없음), fullBody 줄(카탈로그 fullBody 주근육 종목 확인 필요·시간), en 로케일 e2e, 저장소 LokiMemory node 테스트(`database` 싱글턴이 데코레이터 모델을 직접 묶어 tsx 로 못 띄움 — 집계 핵심은 domain 테스트로 덮음) |
| P2-11 | 고침 | 조회 실패 시 빈 집계로 → 「기록된 근육이 없어요」 문구(끝없는 aria-busy 제거) |

## 검증
- `bun run test:core` 466/466 · `tsc`(frontend·core) 0 · biome 오류 0(기존 경고 3·정보 2) · `make verify` exit 0
- 3400/3401 운영 빌드(DB `e2e_og_p2fix_10271923`, 끝나고 삭제)
  - opengym-muscle 4 통과 / 1 건너뜀(시안)
  - declutter-block·p3·p4·shots·summary · home-primary · routines · analytics · catalog·catalog-search·catalog-revamp · session·session-assist → 64 통과 / 5 건너뜀 / 실패 0
- 좌표(오늘 카드, 라이트·다크 같음): 360 이름 칸 188px · 시작 233,265 94×36 · 그림 264,305(버튼 아래) · 카드 102px / 390 이름 칸 218px · 시작 263,265
- 360 켬/끔: 이름 칸 188/188 · 카드 102/79 · 시작 버튼 같은 자리·크기·색 · 운동 화면 rir 100/36 · 첫 세트 281(켬=끔)
- 대비: mini 라이트 fill3 9.0 · fill2 3.15 · 윤곽 4.21 / 다크 10.1 · 4.64 · 5.90
- 캡처 `.ouroboros-work/shots/p2-fix/` 16장(home-todaycard·session-sheet·stats-balance·catalog-filter × 360/390 × light/dark)

## 정리
3400·3401 종료 · DB 삭제 · next-env.d.ts 원복 · test-results·빈 .media 삭제. 커밋은 본인 파일 13개만(push·merge·배포 안 함).
