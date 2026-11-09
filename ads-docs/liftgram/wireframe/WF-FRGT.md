# WF-FRGT — S-35 FRGT 비밀번호 찾기

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-FRGT.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-052, SRS-054, SRS-072, SRS-081, SRS-095

### 비밀번호 찾기

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:d683c037-77f2-4c7f-b4b7-181edc8ec512`

screen_code: FRGT · route: /forgot

**노트: **S-35 · 재설정 메일 요청 · 조건: 메일 기능이 켜져 있을 때 링크가 보임

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| FRGT.01 | display | 비밀번호 찾기 | 기본 / 메일 기능이 켜져 있을 때 링크가 보임 |  | 재설정 메일 요청 |
| FRGT.02 | button | 폼 | 기본 | 누름 | →SHUMAN 사람 확인(Turnstile) |
| FRGT.03 | button | 화면 바닥 약관 | 기본 | 누름 | →TERMS 이용약관 |
| FRGT.04 | button | 화면 바닥 처리방침 | 기본 | 누름 | →PRIV 개인정보처리방침 |
| FRGT.05 | button | 로고 | 기본 | 누름 | →WKT 운동 |
