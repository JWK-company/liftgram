---
description: 웹 [Sync] 버튼 → 이 터미널 Claude 세션 push(Channels) 설정 안내 (plm-channel 플러그인)
---

웹 대시보드 [Sync] 버튼이 **이 터미널의 Claude Code 세션**으로 작업을 push하도록 채널을 설정한다.

> **메커니즘**: 채널 전송은 `plm-channel` **플러그인**(`jwk-platform` 마켓플레이스)으로 한다.
> Claude Code는 커스텀 채널 인바운드 주입을 **정책 게이트**로 막으므로(보안), 마켓플레이스
> 플러그인 + managed-settings allowlist가 정식 경로다. (`server:` raw MCP·dev 플래그로는 주입 안 됨 — 검증됨.)

## 설정 3단계 (전부 1회, 멱등)

1. **플러그인 설치** (이미 `make setup` 했으면 됨):
   ```bash
   claude plugin install plm-channel@jwk-platform
   ```
2. **채널 정책 활성화** (sudo — managed-settings에 `channelsEnabled`+`allowedChannelPlugins` 병합):
   ```bash
   make channels          # = bash plugin/plm-channel/scripts/setup-channels.sh
   ```
3. **토큰 바인딩** (영속 `plmhub-` 토큰을 `.ouroboros/env/.env`에 발급):
   ```
   /plm-hub:link <project>
   ```

## 사용
```bash
claude --channels plugin:plm-channel@jwk-platform
```
세션을 대기 상태로 띄워 두면 동작한다.

## 흐름(설정 후)
- 세션 기동 → 릴레이가 백엔드 SSE 구독(presence online).
- 웹에서 누군가 나를 assignee로 [Sync] enqueue → 세션에 `<channel source="plm" work_id=…>` 도착.
- 처리 후 Claude가 `report` 도구로 결과 회신 → 웹이 `done` 확인.
- 세션 닫히면 60s TTL로 offline → enqueue는 비실행+알림(ADR-018).

> 토큰은 시작 시 1회 로드 — 갱신하면 세션 재시작 필요. 영속 토큰이라 만료 걱정 없음.
> 설계: `plugin/plm-channel/README.md` · SAD-006 · SRS-020. 라우팅·큐·presence는 PLM 백엔드 소유.
