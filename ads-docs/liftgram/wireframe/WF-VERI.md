# WF-VERI — S-37 VERI 이메일 확인

> 타입 Wireframe · 그룹 liftgram/wireframe · ADStudio가 `WF-VERI.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **covers** → SRS-052

### 이메일 확인

loc: `penpot:db87d5a1-69f7-81b3-8008-eab602483349:b867e8df-6599-4931-8894-105235e7602a`

screen_code: VERI · route: /verify-email

**노트: **S-37 · 열자마자 이메일 확인 · 조건: 토큰 필요

#### 화면 요소 (상태·액션·이펙트)

| 요소코드 | 유형 | 라벨 | 상태 | 액션 | 이펙트 |
| --- | --- | --- | --- | --- | --- |
| VERI.01 | display | 이메일 확인 | 기본 / 토큰 필요 |  | 열자마자 이메일 확인 |
| VERI.02 | button | 무효 토큰 안내 | 기본 | 누름 | →AUTH 계정·로그인 |
