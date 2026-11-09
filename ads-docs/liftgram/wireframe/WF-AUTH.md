# WF-AUTH — S-31 AUTH 계정·로그인

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-AUTH.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-052, SRS-054, SRS-072, SRS-081, SRS-083, SRS-095

### 계정·로그인

loc: `penpot:db87d5a1-69f7-81b3-8008-eab63c19b554:c3aa53b6-35a0-4a3f-adfb-f789bd48703a`

screen_code: AUTH · route: /account

**노트: **S-31 · 로그인 폼, 또는 계정·보안·백업·가져오기·삭제 · 조건: 상태에 따라 내용이 다름

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| AUTH.01 | display | 계정·로그인 | 기본 / 상태에 따라 내용이 다름 |  | 로그인 폼, 또는 계정·보안·백업·가져오기·삭제 |
| AUTH.02 | display | S-31.1 하위 앱바 | 기본 |  | 「계정」 |
| AUTH.03 | display | S-31.2 계정 카드 | 기본 |  | 이름 · 주소 · 로그아웃 |
| AUTH.04 | display | S-31.3 프로필 편집 | 기본 |  |  |
| AUTH.05 | display | S-31.4 로그인·보안 | 기본 |  |  |
| AUTH.06 | display | S-31.5 서버 동기 | 기본 |  |  |
| AUTH.07 | display | S-31.6 백업 파일 | 기본 |  |  |
| AUTH.08 | display | S-31.7 다른 앱 기록 가져오기 | 기본 |  |  |
| AUTH.09 | display | S-31.8 계정 삭제 | 기본 |  |  |
| AUTH.10 | display | S-31.9 로그인 전 · 소셜 버튼 | 기본 |  |  |
| AUTH.11 | display | S-31.10 로그인 전 · 이메일 양식 | 기본 |  |  |
| AUTH.12 | display | S-31.11 로그인 전 · 링크 | 기본 |  | 비밀번호 찾기 · 약관 · 가입 전환 |
| AUTH.13 | button | 가져오기 카드 | 기본 | 누름 | →IMPT 다른 앱 기록 가져오기 |
| AUTH.14 | button | 비밀번호 찾기 링크 | 기본 | 누름 | →FRGT 비밀번호 찾기 |
| AUTH.15 | button | 가입 동의 | 기본 | 누름 | →TERMS 이용약관 |
| AUTH.16 | button | 가입 동의 | 기본 | 누름 | →PRIV 개인정보처리방침 |
| AUTH.17 | button | 앱: 웹 계정으로 계속 | 기본 | 누름 | →APPC 앱에 로그인 |
| AUTH.18 | nav | 뒤로 | 기본 | 누름 | →PRF 프로필 |
| AUTH.19 | button | 가져오기 이력 | 기본 | 누름 | →SIMPUA 이 가져오기를 되돌릴까요? |
| AUTH.20 | button | 로그인 폼 | 기본 | 누름 | →SHUMAN 사람 확인(Turnstile) |
| AUTH.21 | button | 파일 고르기 | 기본 | 누름 | →SFILES 시스템 파일 선택창 |
| AUTH.22 | button | 계정 충돌 | 기본 | 누름 | →SOWNER 이 기기에 다른 계정의 기록이 있어요 |
| AUTH.23 | button | 로고 | 기본 | 누름 | →WKT 운동 |
