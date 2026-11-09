# WF-OAUTH — S-38 OAUTH 로그인 완료

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-OAUTH.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-052, SRS-095

### 로그인 완료

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:adef64b2-ab59-487a-a8f5-344621514c43`

screen_code: OAUTH · route: /auth/complete

**노트: **S-38 · 소셜 로그인 착지, 코드 교환 · 조건: 코드 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| OAUTH.01 | display | 로그인 완료 | 기본 / 코드 필요 |  | 소셜 로그인 착지, 코드 교환 |
| OAUTH.02 | button | 실패 때 | 기본 | 누름 | →AUTH 계정·로그인 |
| OAUTH.03 | display | 성공 후 | 기본 | 자동 | →WKT 운동 |
