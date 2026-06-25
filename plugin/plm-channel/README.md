# plm-channel — PLM-Hub 채널 플러그인

웹 대시보드의 **[Sync] 버튼**이 누른 작업을, **이 터미널에서 켜져 있는 Claude Code 세션**으로 실시간 push 한다. (Claude Code의 `claude/channel` 메커니즘 = 디스코드/텔레그램 채널과 동일한 방식.)

## 구조
```
웹 [Sync] → PLM 백엔드(ChannelHub) → SSE → 로컬 릴레이(relay/plm-channel.mjs)
          → notifications/claude/channel → 세션에 <channel> 주입 → Claude 처리 → report → done
```
릴레이는 **Node 의존성 0**, `.ouroboros/config/plm.json`(api_url·project)과 `.ouroboros/env/.env`(PLM_API_TOKEN)를 CWD에서 위로 **자동 발견**한다.

## 설치 (3단계 — 전부 1회)
1. **플러그인 설치**: `claude plugin install plm-channel@jwk-platform` (또는 `make setup`).
2. **채널 정책 활성화**(sudo·멱등): `make channels` — Claude Code managed-settings에 `channelsEnabled`+`allowedChannelPlugins` 병합. 커스텀 채널은 정책 게이트로 막히므로 이 승인 필요.
3. **토큰**: `/plm-hub:link <project>` — 영속 `plmhub-` 토큰을 `.ouroboros/env/.env`에 발급(만료 없음).

## 사용
```bash
claude --channels plugin:plm-channel@jwk-platform
```
세션이 대기 상태로 떠 있으면, 웹에서 [Sync]를 누른 작업이 `<channel>`로 도착하고 Claude가 처리 후 `report` 도구로 백엔드에 회신한다(work state→done).

## 왜 managed-settings(sudo)가 필요한가
Claude Code는 보안상 커스텀(`server:`/`plugin:`) 채널의 인바운드 주입을 **정책 게이트**로 차단한다. 게이트는 `allowedChannelPlugins`(정책 스코프=managed-settings)에 등록된 플러그인만 통과시킨다. dev 플래그(`--dangerously-load-development-channels`)는 주입을 활성화하지 못한다(검증됨). 따라서 마켓플레이스 플러그인 + managed-settings allowlist가 정식 경로다.
