# @plm 오염 정리 — 2026-10-26

## 무엇이 문제였나
`src/`(tarae-web-stack 이식분)의 `@plm` 주석 일부가 **템플릿의 번호 체계**(SRS-001~012)로 달려 있었다. 같은 번호의 liftgram SRS는 의미가 전혀 달라서(템플릿 SRS-008 compose·entry point ↔ liftgram SRS-008 프로필·PR 공유 등) 스캔하면 가짜 realizes가 붙는다. 그래서 2026-08-01부터 루트 `.plmignore`로 `src/**`를 통째로 막아 두었다.

판별 방법: `src/`의 각 `@plm` 줄이 템플릿 원본(`../../tarae-web-stack`)의 같은 경로에 **같은 줄**로 있으면 템플릿 유래로 본다 → 53개/41파일. 이후 우리가 쓴 인프라 파일도 같은 관례를 따라가 있었다(deploy·backup·compose.prod·render·start-combined = SRS-008, migrate-legacy = SRS-006, 개발 피드백 탭 9파일 = SRS-006).

## 발급한 요구 (Draft · PLM 동기 확인)
| ID | 제목 | derives_from |
|----|------|--------------|
| SRS-049 | 웹 스택 실행·검증·배포 기반 (실행 단위·설정·헬스·배포·백업·데이터 이관·품질 게이트) | URS-008 |
| SRS-050 | API 경계·계약 신뢰성 (계약 단일 원본·프록시·오류 매핑·멱등·요청 제한·실시간 전파) | URS-008, URS-003 |
| SRS-051 | 앱 셸·공통 UI 규약 (화면 프리미티브·상태 3종·토스트·다이얼로그·탭 내비·디자인 토큰) | URS-001, URS-007 |

## 재매핑 (주석 87줄)
- → SRS-049: entry point·config·db 풀·migrate·requestlog·compose 3종·Dockerfile·render·start-combined·next.config·server.mjs(종료)·env.ts·check-*·ci·lefthook·playwright·제너레이터·deploy/backup·migrate-legacy·**개발 피드백 탭 9파일**
- → SRS-050: buf·sqlc·contracts entry·API 프록시·WS 터널·lib/api.ts·errs·오류 매퍼·idempotency·ratelimit(+검증)·realtime bus · `exercise/ws.go`는 SRS-001에 SRS-050 병기
- → SRS-051: States·Toast·globals.css·ui/ 11종·gen-page가 찍는 셸 주석
- **도메인 오태깅 수정**(app 원본과 대조): 루틴 4파일 SRS-003(세트 로깅) → **SRS-002**(루틴 빌더) · 발견·팔로우 목록 4파일 SRS-008 → **SRS-018**
- 설명문 속 번호도 정정(compose·.env.example·config.go의 "(SRS-006/008)") · `src/CLAUDE.md` 예시를 `SRS-NNN`으로(스캔이 예시를 실제 링크로 읽는다)
- 삭제: 없음 — 템플릿 유래 주석은 전부 liftgram에도 실재하는 코드라 의미 있는 요구로 옮겼다
- `proto/feedback` 헤더가 바뀌어 `make proto`로 feedback 생성물 3개를 다시 만들었다(buf/validate의 원격 의존 주석 드리프트는 무관해 되돌림)

## .plmignore
`src/**` 제외를 풀고 **생성물만** 뺀다: `src/backend/gen/**` · `src/contracts/gen/**` · `src/backend/internal/db/sqlcgen/**` · test-results · playwright-report.
⚠ `src/.plmignore`는 패턴이 `src` 기준이라 루트에서 스캔하면 매칭되지 않는다 — 실효 규칙은 루트 파일에 있다.

## 검증
- 스캔 시뮬레이션: src 320파일·참조 605개 — **존재하지 않는 아티팩트를 가리키는 참조 0** · 템플릿 번호가 인프라 경로에 남은 것 0
- `make verify` 통과

## codescan — 400의 원인
전체 스캔(app+src+server) = Code 1,130 · realizes 1,190 · 요청 1.25MB → `400 validation: code too long (max 64 chars)`.
- **원인**: `plugin/plm-hub/scripts/plm_codescan.py:219`가 Code ID를 `CODE-{slug(path)}-{slug(symbol)}`로 만들고 **길이를 자르지 않는다**. 32개가 64자를 넘는다(app 13 · src 19, 최장 82자). app만 스캔하던 때도 13개가 넘었으므로 **src 해제 전부터 있던 400**이다.
- 고칠 곳(범위 밖 — plugin/): ID가 64자를 넘으면 앞부분을 줄이고 해시 접미사를 붙이는 식으로 결정적으로 축약. 기존 ID와 바뀌는 것은 GC(Replaced)가 정리한다.
- 413(sync_bulk)은 별건이나 이 요청도 1.25MB라 서버 한도에 따라 다음으로 걸릴 수 있다 → 청크 전송(예: 300개씩)이 함께 필요해 보인다.
- 따라서 **PLM 딥링크는 아직 동기되지 않았다**(code_refs 역기재도 미실행).

## 남은 것
- codescan ID 축약 + 청크 전송(plugin/plm-hub) → 그 뒤 `/plm-hub:codescan` 전체 실행
- `src/.plmignore` 패턴을 루트 기준으로 쓰거나 스크립트가 파일 위치 기준으로 해석하게 고치기
