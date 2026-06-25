# PLM Channels(B) 로컬 릴레이

웹 대시보드 **[Sync] 버튼 → 내 터미널 Claude Code 세션** 실시간 push를 받는 로컬 채널 서버.

## 구조

```
[웹 sync 버튼] ─enqueue→ [PLM 백엔드 = 채널 브로커]
                            │ user×project 라우팅 · DB 레지스트리(session_channels) · 큐
                            │ SSE  ▲ 이 릴레이가 토큰으로 구독(outbound, NAT 우회)
                     [plm-channel.mjs (세션 옆 subprocess)]
                            │ notifications/claude/channel (stdio)
                     [claude --channels server:plm-channel]  ← <channel> 태그 수신
```

브로커(라우팅·큐·presence·레지스트리)는 **전부 백엔드**. 릴레이는 Claude Code가 채널을 로컬
stdio MCP로만 받기에 필요한 얇은 릴레이 — 자기 OIDC 토큰으로 자기 `user×project`만 구독.

## ★ Zero-config (자동 발견)

`/plm-hub:link` 로 바인딩한 프로젝트에선 **설정이 필요 없다.** 릴레이가 CWD에서 위로 탐색해:
- `.ouroboros/config/plm.json` → `api_url`(PLM_API)·`project`(PLM_PROJECT)
- `.ouroboros/env/.env` → `PLM_API_TOKEN`(PLM_TOKEN)

을 자동 발견한다. **비밀(토큰)은 `.mcp.json`에 넣지 않는다.** 명시 환경변수가 항상 우선.

## 설치 (자동)

`/plm-hub:link <project>` 또는 `/plm-hub:channel` 이 프로젝트 `.mcp.json`에 `plm-channel` 서버를
자동 등록한다(비밀 없음 — 릴레이가 자동 발견). 그 후:

```bash
claude --channels server:plm-channel --dangerously-load-development-channels
```

## 환경변수 (선택 — 오버라이드)
| 변수 | 기본(자동발견) | 설명 |
|------|---------------|------|
| `PLM_API` | plm.json `api_url` | 백엔드 base URL |
| `PLM_TOKEN` | .env `PLM_API_TOKEN` | 개인 OIDC Bearer 토큰 |
| `PLM_PROJECT` | plm.json `project` | 바인딩 프로젝트 slug |
| `PLM_SESSION` | `hostname-pid` | 세션 식별자(머신별) |

## 동작
- 세션 기동 → 릴레이가 SSE 구독(presence online) → 웹에서 나를 assignee로 [Sync] →
  세션에 `<channel source="plm" work_id=…>` 도착 → 처리 후 `report` 도구로 회신 → 웹 `done`.
- 재접속 시 미처리 `queued` 자동 재생. 끊기면 60s TTL offline → enqueue는 비실행+알림.

## 요구사항 · 한계(정직)
- Node ≥ 18(내장 fetch), Claude Code **v2.1.80+**(channels=연구 프리뷰, 커스텀은
  `--dangerously-load-development-channels` 필요).
- 세션 열림 시에만 수신·전달 보장 없음 → 정합 진실원 = `report`/PLM 상태. 터미널 CLI 전용.
