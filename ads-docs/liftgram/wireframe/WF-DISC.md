# WF-DISC — S-18 DISC 사람 찾기

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-DISC.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-080

### 사람 찾기

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:e344aa6b-651f-4fd1-9b1b-334e43df128e`

screen_code: DISC · route: /discover

**노트: **S-18 · 사용자 검색, 팔로우. 시행 전까지 피드 「발견」 탭에 같은 내용, 시행 뒤에는 팔로잉이 빌 때 피드에 함께 나옴 · 조건: 로그인 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| DISC.01 | display | 사람 찾기 | 기본 / 로그인 필요 |  | 사용자 검색, 팔로우. 시행 전까지 피드 「발견」 탭에 같은 내용, 시행 뒤에는 팔로잉 |
| DISC.02 | button | 사람 줄 | 기본 | 누름 | →UPRF 공개 프로필 |
| DISC.03 | nav | 뒤로 | 기본 | 누름 | →FEED 피드 |
