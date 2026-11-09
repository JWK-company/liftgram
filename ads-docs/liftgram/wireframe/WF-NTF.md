# WF-NTF — S-25 NTF 알림

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-NTF.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-054, SRS-066, SRS-071, SRS-080

### 알림

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:eab24ded-b476-4e60-8afd-8373f513f35d`

screen_code: NTF · route: /notifications

**노트: **S-25 · 알림 목록, 열면 모두 읽음 · 조건: 로그인 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| NTF.01 | display | 알림 | 기본 / 로그인 필요 |  | 알림 목록, 열면 모두 읽음 |
| NTF.02 | button | 팔로우 알림 | 기본 | 누름 | →UPRF 공개 프로필 |
| NTF.03 | button | 좋아요·댓글 알림 | 기본 | 누름 | →CMT 댓글 |
| NTF.04 | button | 코칭 요약 알림 | 기본 | 누름 | →DMC 대화방 |
| NTF.05 | button | 대화를 못 열었을 때 | 기본 | 누름 | →DMS 메시지 |
| NTF.06 | button | 글이 없을 때 | 기본 | 누름 | →FEED 피드 |
| NTF.07 | nav | 뒤로 | 기본 | 누름 | →FEED 피드 |
