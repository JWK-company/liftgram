# WF-GYM — S-15 GYM 주변 헬스장

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-GYM.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-035, SRS-036, SRS-054, SRS-066, SRS-071, UCS-013

### 주변 헬스장

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:33c3de1d-b705-4082-8873-6712ea86cfbd`

screen_code: GYM · route: /gyms

**노트: **S-15 · 위치 기반 헬스장 검색 · 조건: 위치 권한 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| GYM.01 | display | 주변 헬스장 | 기본 / 위치 권한 필요 |  | 위치 기반 헬스장 검색 |
| GYM.02 | nav | 뒤로 | 기본 | 누름 | →FEED 피드 |
| GYM.03 | nav | 뒤로 | 기본 | 누름 | →PRF 프로필 |
| GYM.04 | button | 검색 | 기본 | 누름 | →SGEO 브라우저 위치 권한 창 |
