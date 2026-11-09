# WF-COACH — S-27 COACH 코칭

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-COACH.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-048, SRS-077, SRS-079, SRS-080, SRS-085, UCS-019

### 코칭

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:0e447a0d-146f-4105-9e27-f1f83cfd5501`

screen_code: COACH · route: /coaching

**노트: **S-27 · 코치·회원 관계와 요청 · 조건: 로그인 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| COACH.01 | display | 코칭 | 기본 / 로그인 필요 |  | 코치·회원 관계와 요청 |
| COACH.02 | button | 비로그인 안내 | 기본 | 누름 | →AUTH 계정·로그인 |
| COACH.03 | nav | 뒤로 | 기본 | 누름 | →PRF 프로필 |
| COACH.04 | button | 이력 버튼 | 기본 | 누름 | →SCHIST 코칭 이력 |
| COACH.05 | button | 리포트 버튼 | 기본 | 누름 | →SMREPO 회원 리포트 |
| COACH.06 | button | 처방 버튼 | 기본 | 누름 | →SMRX 회원 루틴 처방 |
