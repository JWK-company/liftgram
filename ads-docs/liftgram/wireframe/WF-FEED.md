# WF-FEED — S-03 FEED 피드

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-FEED.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-037, SRS-039, SRS-040, SRS-054, SRS-065, SRS-067, SRS-071, SRS-080

### 피드

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:4a579e93-89fa-4ba8-adc5-37a7d85a8afd`

screen_code: FEED · route: /feed

**노트: **S-03 · 추천(기본)·팔로잉 두 탭, 두 탭 모두 스토리, 공식 예시 글(공식 배지·AI 사진 고지·루틴 칸), 공개 범위를 고르는 글쓰기, 추천은 3글마다 광고 · 조건: 로그인 필요. 비로그인은 안내와 /account 버튼

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| FEED.01 | display | 피드 | 기본 / 로그인 필요. 비로그인은 안내와 /account 버튼 |  | 추천(기본)·팔로잉 두 탭, 두 탭 모두 스토리, 공식 예시 글(공식 배지·AI 사진 |
| FEED.02 | display | S-03.1 앱바 | 기본 |  | 탐색 · 메시지 · 알림 |
| FEED.03 | display | S-03.2 탭 | 기본 |  | 추천 · 팔로잉 · 발견 |
| FEED.04 | display | S-03.3 주변 헬스장 줄 | 기본 |  |  |
| FEED.05 | display | S-03.4 스토리 줄 | 기본 |  |  |
| FEED.06 | display | S-03.5 추천 목록 | 기본 |  |  |
| FEED.07 | display | S-03.6 발견 탭 | 기본 |  |  |
| FEED.08 | display | S-03.7 팔로잉 글 목록 | 기본 |  | 글 카드 · 광고 · 끝없이 불러오기 |
| FEED.09 | display | S-03.8 + 글쓰기 | 기본 |  |  |
| FEED.10 | button | 피드 카드에서 시작 | 기본 | 누름 | →ACT 운동 중 |
| FEED.11 | button | 주변 헬스장 찾기 줄 | 기본 | 누름 | →GYM 주변 헬스장 |
| FEED.12 | button | 머리 돋보기 | 기본 | 누름 | →XPL 발견 |
| FEED.13 | button | 머리 메시지 | 기본 | 누름 | →DMS 메시지 |
| FEED.14 | button | 머리 종 | 기본 | 누름 | →NTF 알림 |
| FEED.15 | button | 글 카드 말풍선 | 기본 | 누름 | →CMT 댓글 |
| FEED.16 | button | 글 작성자 | 기본 | 누름 | →UPRF 공개 프로필 |
| FEED.17 | button | 본문 #태그 | 기본 | 누름 | →HASH #태그 |
| FEED.18 | button | 비로그인 안내 「프로필로 가기」 | 기본 | 누름 | →AUTH 계정·로그인 |
| FEED.19 | button | 스토리 누르기 | 기본 | 누름 | →SSTORY 스토리 뷰어 |
| FEED.20 | button | 글쓰기 버튼 | 기본 | 누름 | →SCOMPO 새 글 |
| FEED.21 | button | 새로 시작 | 기본 | 누름 | →SACTIV 진행 중인 운동이 있어요 |
| FEED.22 | button | ⋯ 신고 | 기본 | 누름 | →SREPOR 신고 |
| FEED.23 | button | 내 글 ⋯ | 기본 | 누름 | →SOWNME 게시물 수정(메뉴) |
| FEED.24 | button | 메뉴 선택 | 기본 | 누름 | →SCAPTI 캡션 수정 |
| FEED.25 | button | 메뉴 선택 | 기본 | 누름 | →SRMPOS 게시물을 삭제할까요? |
| FEED.26 | button | 루틴 가져오기 버튼 | 기본 | 누름 | →SIMPOR 루틴 가져오기 |
| FEED.27 | button | 공식 글 루틴 가져오기 | 기본 | 누름 | →SOFFIC 공식 글의 루틴 |
