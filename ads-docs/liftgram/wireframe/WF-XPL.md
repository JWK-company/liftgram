# WF-XPL — S-17 XPL 발견

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-XPL.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-066, SRS-071

### 발견

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:728a59fd-7d86-4f7a-92a3-8de38544ee1d`

screen_code: XPL · route: /explore

**노트: **S-17 · 검색, 인기 태그, 추천, 인기 글 · 조건: 로그인 필요. 비로그인은 안내 없이 빈 화면

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| XPL.01 | display | 발견 | 기본 / 로그인 필요. 비로그인은 안내 없이 빈 화면 |  | 검색, 인기 태그, 추천, 인기 글 |
| XPL.02 | button | 태그 | 기본 | 누름 | →HASH #태그 |
| XPL.03 | button | 추천·검색 결과 | 기본 | 누름 | →UPRF 공개 프로필 |
| XPL.04 | button | 글 카드 말풍선 | 기본 | 누름 | →CMT 댓글 |
| XPL.05 | nav | 뒤로 | 기본 | 누름 | →FEED 피드 |
