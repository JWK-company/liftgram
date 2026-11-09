# WF-RESET — S-36 RESET 새 비밀번호

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-RESET.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-052

### 새 비밀번호

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:4f78dd1e-7cec-45e2-aeb8-6a680cf71719`

screen_code: RESET · route: /reset

**노트: **S-36 · 메일에서 새 비밀번호 설정 · 조건: 토큰 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| RESET.01 | display | 새 비밀번호 | 기본 / 토큰 필요 |  | 메일에서 새 비밀번호 설정 |
| RESET.02 | button | 완료 후 | 기본 | 누름 | →AUTH 계정·로그인 |
| RESET.03 | button | 실패 때 | 기본 | 누름 | →FRGT 비밀번호 찾기 |
