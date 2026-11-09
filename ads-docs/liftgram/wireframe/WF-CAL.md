# WF-CAL — S-07 CAL 기록(달력)

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-CAL.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-064, SRS-071, SRS-072

### 기록(달력)

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:dacf86ba-24a5-47e8-975a-9a96b63c8f83`

screen_code: CAL · route: /calendar

**노트: **S-07 · 월 달력, 연속일, 주간 목표, 날짜 메모. 다른 달이면 「오늘」 칩 · 조건: 누구나

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| CAL.01 | display | 기록(달력) | 기본 / 누구나 |  | 월 달력, 연속일, 주간 목표, 날짜 메모. 다른 달이면 「오늘」 칩 |
| CAL.02 | display | S-07.1 앱바·전환 | 기본 |  | 「기록」 · ⋯ 이달 자랑하기 · 목록│달력 |
| CAL.03 | display | S-07.2 목표·연속일 줄 | 기본 |  | 누르면 목표 시트 |
| CAL.04 | display | S-07.3 월 이동 | 기본 |  | ‹ ○월 › · 이달 요약 · 「오늘」 칩 |
| CAL.05 | display | S-07.4 달력 칸 | 기본 |  |  |
| CAL.06 | display | S-07.5 고른 날 머리 | 기본 |  | 날짜 + 「메모」 |
| CAL.07 | display | S-07.6 그날 메모 | 기본 |  |  |
| CAL.08 | display | S-07.7 그날 내용 | 기본 |  | 운동 줄 · 수동 표시 · 「운동한 날로 표시」 |
| CAL.09 | button | 목록·달력 전환 | 기본 | 누름 | →HIST 기록 |
| CAL.10 | button | 날짜의 운동 | 기본 | 누름 | →WDT 기록 상세 |
| CAL.11 | button | 이번 달 자랑하기 | 기본 | 누름 | →SSHARE 피드에 공유 |
| CAL.12 | button | 목표 줄 | 기본 | 누름 | →SGOAL 이번 주 목표 |
| CAL.13 | button | ⋯ 탭 | 기본 | 누름 | →SRECME 기록 ⋯ 메뉴 |
