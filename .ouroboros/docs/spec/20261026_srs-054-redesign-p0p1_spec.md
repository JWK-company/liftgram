# SRS-054 화면 재설계 — P0 공용 조각 · P1 운동 흐름 (Feature)

시안: https://claude.ai/artifact/3CVyQDuS3Ky1s1qBdrXudT · 결정 D1~D6 = 전부 A (2026-10-26 승인)

## P0 공용 조각 → v0.24.0
| 조각 | 파일 | 내용 |
|---|---|---|
| 앱바 2형 | ui/AppBar.tsx · ui/ScreenHeader.tsx | 탭 첫 화면 = 로고/큰 제목 + 아이콘 ≤2 · 하위 = ← · 가운데 제목 · 오른쪽 한 자리. ScreenHeader 호출부(20+)는 그대로 새 형을 입는다(back 유무로 분기). screen-title 유지 |
| 탭바 | ui/TabBar.tsx | 5칸(운동·기록·피드·분석·프로필) · 직접 그린 라인 아이콘 · 현재 탭 위 강조선 · /calendar 는 기록 탭 · insider 피드백 탭 유지 · /workout 에서 숨김(D2) |
| 목록 줄 | ui/rows.tsx | SectionLabel · ListGroup · ListRow · Segmented · UnderlineTabs · KpiRow |
| 바닥 시트 | ui/Dialog.tsx | Overlay placement="bottom" · ActionSheet·SheetShell 은 바닥 시트, ConfirmDialog 는 가운데 |
| ⋯ 메뉴 | ui/MoreMenu.tsx | 위험·드문 동작을 시트로 |
| 기록 탭 | analytics/RecordsHeader.tsx | 기록 앱바 + 목록/달력 구간 선택기(링크 — 주소가 상태) |
| 탭 루트 적용 | Routines(로고) · History · Calendar · Stats · Profile | 큰 제목 → AppBar |

## P1 운동 흐름 → v0.25.0
- 01 운동 홈 요약형: 이번 주(연속·목표 진행) 카드 → ▶ 빈 운동 시작 → 내 루틴 줄(줄마다 시작) → 최근 운동 → 그 밖(스케줄·추천·콘셉트·프로그램·헬스장)은 아래 「더 하기」 묶음. 진행 중 카드의 폐기는 ⋯ 안으로.
- 02 운동 중 집중 모드: 탭바 숨김 · ⌄로 내리면 진행 중 막대 · 「운동 취소(삭제)」 버튼 → 머리 ⋯ 메뉴(확인창 유지) · 종목 머리 아이콘(정보·교체·삭제) → 종목 ⋯ · 완료 세트는 초록 체크·흐린 입력.
- 03 운동 추가: 화면 이동 대신 바닥 시트(기존 피커 재사용 가능 범위).
- 04 완료: 축하 한 줄 + KpiRow + 깬 기록 목록 + 하단 고정 「피드에 공유」·「완료」.
- 11 진행 중 막대: GlobalWorkoutBar 를 탭바 위 막대로(휴식·현재 종목·열기).

## 불변
기록 데이터·동기화·오프라인 저장·휴식 알림 Web Audio 예약·세션 저장·로그인 로직 무변경. data-testid 유지(옮긴 버튼은 같은 testid로 ⋯ 안에). data-safety·offline e2e 필수 통과.

## 검증
tsc · biome · e2e 전체(BASE=http://localhost:3100) · 라이트/다크 390 캡처 · 배포 후 readyz·운영 캡처.
