# 디자인 시스템 적용 보고 — v0.23.0 (2026-10-26)

운영: https://liftgram.tarae.org · v0.23.0 (build 291) · 커밋 `fc479ba` · 태그 `v0.23.0` · `feat/web-stack-tarae` = `main`

## 1. 확정 사항 (사용자 2026-10-26)
1. 로고 B1(사선으로 들어 올리는 L) 2. 브랜드 주황 3. 라이트 + 다크 4. 회사 정보 booktarae 동일(같은 회사 제품)

## 2. 바뀐 것
| 영역 | 내용 |
|------|------|
| 토큰 | 원시(`--p-*`) → 의미(`--color-*`) 2층. core `theme/tokens.ts`(colors·darkColors)가 원본, `make sync-core`가 CSS 생성, `make core-check`가 드리프트 차단. 기존 의미 이름은 유지해 화면 400여 곳을 고치지 않고 재도색 |
| 테마 | 기본 = 시스템 설정. 프로필 [화면 테마] 시스템/라이트/다크(키 `liftgram.theme`, 계정 설정 동기). head 인라인 스크립트가 첫 페인트 전에 `data-theme` 적용 |
| 서체 | Pretendard 자체 호스팅(`public/fonts/pretendard`, OFL) + 서비스워커 `/fonts/*` 캐시 우선 |
| 컴포넌트 | 버튼 h48·반경 8·보조 = surface-alt · 입력 테두리 line-strong·포커스 링 · 칩 · 헤더 하단선 · 터치 기기 입력 글자 16px |
| 브랜드 | `Logo`(가로·세로·심볼, 심볼 = 장식 주황 · 워드마크 = currentColor) · manifest 색 #F7F7F7 · 아이콘 192/512/maskable/apple-touch · 파비콘 교체 · `brand/sheet.png` 삭제 · 브랜드 SVG `<title>` |
| 회사 정보 | 로그인·가입·프로필 하단 `BusinessInfo` — 타래(TARAE) · 대표 · 사업자등록번호 + 공정위 사업자정보 확인 링크 · 주소 · 고객센터(booktarae와 같은 값) |
| 소셜 버튼 | 제공자 마크(구글 4색 G · 카카오 말풍선 · 네이버 N — booktarae 자산). 제공자 색은 각 사 가이드 값이라 토큰 예외 |
| 하드코딩 색 | 서비스워커 띠·오프라인 화면 흰 글자 → on-brand · 스토리 뷰어 → on-scrim |

### 「최근」 로그인 배지 (코디네이터 추가 요구 · booktarae `d8790329` 방식)
- 백엔드: OAuth 콜백 성공 리다이렉트에 `&via=<provider>`(연결일 때는 붙이지 않음)
- 화면: `setTokens(tokens, method)` → `/api/session` 이 허용 목록(email·google·kakao·naver) 값일 때만 HttpOnly·SameSite=Lax·1년 쿠키 `lg_last`. 로그아웃은 유지, 회전·비밀번호 변경은 method 없음 → 그대로
- `/account`·`/signin`·`/signup` 서버 페이지가 `cookies()`로 읽어 버튼 오른쪽 위 배지(aria-hidden + 낭독용 "최근에 로그인한 방법"). 미리보기 버튼에는 달지 않음
- 배지 = 브랜드(라이트 #C8381C/흰 글자 5.2:1 · 다크 #FF7A57/검은 글자 7.0:1) + 카드색 링(같은 브랜드색 이메일 버튼 위에서도 분리)

### 함께 고친 결함
- **소셜 로그인 착지 경합**: `/auth/complete`가 refresh 쿠키 저장 요청이 끝나기 전에 이동해 요청이 끊김(ERR_ABORTED 실측) → `setTokens`가 약속을 돌려주고 착지는 기다린다
- **e2e 경합**: auth-formal이 착지 직후 `goto("/account")`로 막 시작된 refresh를 끊어 회전 쿠키를 잃음 → 도착을 기다리도록 수정

## 3. WCAG AA (계산값)
| 쌍 | 라이트 | 다크 |
|----|-------|------|
| 브랜드 버튼 글자 | 흰/#C8381C 5.20 | #161616/#FF7A57 7.04 |
| 브랜드 글자/배경 | #C8381C/#F7F7F7 4.85 | #FF7A57/#2B2B2B 5.51 |
| 브랜드 글자/brand-muted | 4.68 | 5.46 |
| PR 글자 | #A16207/흰 4.92 | #FFD23F |
| 입력 테두리(비글자 3:1) | #747474 4.67 | #A8A8A8 5.95 |
| 로고 주황 #FF5A36(장식·비글자) | 3.10 | — |

## 4. 피그마(booktarae)와 다르게 한 판단
1. **브랜드 2색 분리** — 피그마 주황 #FF5A36은 흰 글자 3.1:1로 AA 미달. 글자·버튼은 #C8381C, 로고·장식만 #FF5A36
2. **다크 브랜드 #FF7A57 + 검은 글자** — 어두운 판 위에서 흰 글자 주황은 대비 부족
3. **PR 색을 진한 황토 #A16207** — 노랑은 밝은 배경 글자로 쓸 수 없음(다크는 #FFD23F)
4. **터치 기기 입력 16px** — iOS 자동 확대 방지(피그마 14px)
5. **기존 의미 토큰 이름 유지** — 화면 구조·testid 무변경 원칙

## 5. 검증
- `make verify` 통과(lint·타입·Go·core 154·문서 drift) · `make core-check` 통과
- e2e 전체 110: 102 통과 · 3 건너뜀 · 5 실패 → dm 실시간·profile-edit 단독 재실행 통과(기존 부하 flake) · offline 3 = 운영 빌드 전용(dev에서 2×15s 대기가 30s 제한 초과) → **운영 대상 실행 4/4 통과**
- auth-formal + auth-last-login 3회 반복 30/30
- 배포: 버전·메일 점검·readyz 200 · 운영 manifest #F7F7F7 · 로그인 화면 logo·business-info·Pretendard 확인
- 스크린샷 390px 라이트/다크 20장: `/private/tmp/claude-501/-Users-woobi-Desktop-tarae-liftgram/cc0fac10-a48f-447f-9b27-a359273dcc6f/scratchpad/design/` (01-signin · 02-signup · 03-workout · 04-session · 05-summary · 06-history · 07-calendar · 08-stats · 09-profile · 10-feed × light/dark)

## 6. 남은 것
- refresh 회전 + 중단된 요청: 갱신 중 페이지를 떠나면 회전된 쿠키가 버려지고 다음 갱신이 옛 토큰(재사용 → 폐기)으로 로그아웃될 수 있다. 실사용 빈도는 낮지만 서버의 짧은 재사용 유예(직전 토큰 수 초 허용) 검토 필요
- offline e2e는 dev 대상에서 건너뛰지 못하고 시간 초과 — 건너뛰기 판정 시간을 줄일 것
- 확대 화면(데스크톱 폭) 시각 점검은 이번 범위 밖(390px만)
- 카카오·네이버는 키 대기라 여전히 "설정 필요" 미리보기
