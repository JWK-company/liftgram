# WF-RTE — S-14 RTE 루틴 편집

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-RTE.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-043, SRS-056, SRS-057, SRS-063, SRS-072, SRS-093

### 루틴 편집

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:dbc19892-d03f-4616-bf41-98b787d2e09a`

screen_code: RTE · route: /routines/[id]

**노트: **S-14 · 기존 루틴 편집 · 조건: 없는 id의 결과는 미확인

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| RTE.01 | display | 루틴 편집 | 기본 / 없는 id의 결과는 미확인 |  | 기존 루틴 편집 |
| RTE.02 | display | S-14.1 하위 앱바 | 기본 |  | ← · 루틴 이름 · ⋯ 삭제 |
| RTE.03 | display | S-14.2 루틴 이름 | 기본 |  |  |
| RTE.04 | display | S-14.3 폴더 | 기본 |  | 입력칸 또는 폴더 칩 + 새 폴더 |
| RTE.05 | display | S-14.4 메모 | 기본 |  |  |
| RTE.06 | display | S-14.5 종목 카드 목록 | 기본 |  | 카드 머리 · 휴식·무게 · 세트 표 · 슈퍼셋·교체·🗑 |
| RTE.07 | display | S-14.6 「운동 추가」 | 기본 |  |  |
| RTE.08 | display | S-14.7 하단 고정 | 기본 |  | 「완료」 · 「이 루틴으로 시작」 |
| RTE.09 | display | S-14.8 세트 표 · 세트 방식 | 기본 |  | 「세트 방식: ○○ ▾」 + 안내 + 되돌리기 |
| RTE.10 | display | S-14.9 세트 표 · 머리 | 기본 |  | 세트 · 무게 · 횟수 |
| RTE.11 | display | S-14.10 세트 표 · 세트 줄 | 기본 |  | 종류 번호 · 무게 · 최소–최대 횟수/AMRAP · ⋯ |
| RTE.12 | display | S-14.11 세트 표 · 「다른 세트도 똑같이」 | 기본 |  |  |
| RTE.13 | display | S-14.12 세트 표 · 추가 | 기본 |  | 「세트 추가」 · 「웜업 추가」 |
| RTE.14 | button | 이 루틴으로 시작 | 기본 | 누름 | →ACT 운동 중 |
| RTE.15 | display | 저장·나가기 | 기본 | 자동 | →WKT 운동 |
| RTE.16 | button | 종목 추가·교체 | 기본 | 누름 | →SPICKE 운동 추가·바꾸기(종목 피커) |
| RTE.17 | button | 세트 번호 | 기본 | 누름 | →SRXTYP 세트 타입(처방) |
| RTE.18 | button | ⋯ 탭 | 기본 | 누름 | →SRMENU 루틴 ⋯ 메뉴 |
| RTE.19 | button | 종목 메뉴 | 기본 | 누름 | →SRSS 루틴 슈퍼셋 짝 |
| RTE.20 | button | 종목 메뉴 | 기본 | 누름 | →SRRMEX 종목 삭제 |
| RTE.21 | button | ⋯ 메뉴 | 기본 | 누름 | →SRRM 루틴 삭제(편집기) |
| RTE.22 | button | 뒤로 | 기본 | 누름 | →SREXIT 저장하지 않고 나갈까요? |
| RTE.23 | button | 세트 표 위 「세트 방식」 | 기본 | 누름 | →SRXSCH 세트 방식(루틴 편집) |
| RTE.24 | button | 조건 충족 때 자동 | 기본 | 누름 | →SRXTYA 첫 안내: 세트 번호 누르기 |
