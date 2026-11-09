# WF-WDT — S-08 WDT 기록 상세

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-WDT.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-029, SRS-060, SRS-061, SRS-065, SRS-067, SRS-073

### 기록 상세

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:088ee626-971c-43a9-b7b8-1fcaf1ee1cdd`

screen_code: WDT · route: /history/[id]

**노트: **S-08 · 지난 운동 상세, 수정, 삭제, 다시 시작 · 조건: 없는 id는 「세션을 찾을 수 없어요」

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| WDT.01 | display | 기록 상세 | 기본 / 없는 id는 「세션을 찾을 수 없어요」 |  | 지난 운동 상세, 수정, 삭제, 다시 시작 |
| WDT.02 | display | S-08.1 하위 앱바 | 기본 |  | 「기록」 + ⋯ 다시 시작·루틴 만들기·삭제 |
| WDT.03 | display | S-08.2 이름·날짜 | 기본 |  |  |
| WDT.04 | display | S-08.3 숫자 카드 | 기본 |  | 총 볼륨 · 소요시간 |
| WDT.05 | display | S-08.4 「그대로 다시 시작」 | 기본 |  |  |
| WDT.06 | display | S-08.5 종목 카드 목록 | 기본 |  | 머리(이름·추정 1RM·⋯) · 메타 줄 · 세트 줄(✎ 고치기 칩) |
| WDT.07 | display | S-08.6 1RM 주석 | 기본 |  |  |
| WDT.08 | display | S-08.7 운동 총평 | 기본 |  |  |
| WDT.09 | button | 다시 하기 | 기본 | 누름 | →ACT 운동 중 |
| WDT.10 | display | 기록 삭제 후 | 기본 | 자동 | →HIST 기록 |
| WDT.11 | nav | 뒤로 | 기본 | 누름 | →HIST 기록 |
| WDT.12 | button | 메뉴 「루틴 만들기」 | 기본 | 누름 | →SNAMER 이 운동으로 루틴 만들기 |
| WDT.13 | button | 다시 하기 | 기본 | 누름 | →SACTIV 진행 중인 운동이 있어요 |
| WDT.14 | button | ⋯ 탭 | 기본 | 누름 | →SDMENU 기록 상세 ⋯ 메뉴 |
| WDT.15 | button | 메뉴 삭제 | 기본 | 누름 | →SRMWOR 기록 삭제 |
| WDT.16 | button | 세트 줄 | 기본 | 누름 | →SEDITS N세트 고치기 |
| WDT.17 | button | 수정 시트 | 기본 | 누름 | →SRMSET 이 세트 지우기 |
