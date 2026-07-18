---
description: 우리가 관리하는 모든 워크플로우 플러그인(plan·code·plm-hub·plm-channel)을 서버에 배포된 최신 버전으로 일괄 업데이트.
---

`plan`·`code`·`plm-hub`·`plm-channel` 플러그인을 **서버(`/template/download`)에 배포된 최신 버전**으로 한 번에 업데이트한다.

> 왜 이 명령이 필요한가: `jwk-platform` 마켓플레이스는 **로컬 저장소**를 소스로 등록한다. 그래서 `claude plugin update` 단독으론 옛 로컬 파일만 재읽어 실제 새 버전이 있어도 "이미 최신"으로 정체된다. 이 명령은 서버 배포 스냅샷을 받아 로컬 소스를 먼저 최신화한 뒤 갱신한다(git 유무 무관·universal).

## 수행

1. `${CLAUDE_PLUGIN_ROOT}/scripts/plm_update.sh` 를 실행한다. 스크립트가:
   - `/template/download`(서버 배포 번들·무인증)를 받아 **로컬 마켓플레이스 소스의 `plugin/`·`.claude-plugin/marketplace.json`만 병합**으로 덮어쓴다(submodule `.git`·사용자 `.ouroboros`/`docs`/`.env`·config는 불변).
   - `claude plugin marketplace update` + 각 플러그인 `claude plugin update`(프로젝트 스코프 우선, user 폴백).
2. 스크립트 출력(플러그인별 갱신/최신 여부)을 사용자에게 그대로 보고한다.
3. **반영 안내**: 새 스킬·훅은 **Claude Code 세션 재시작** 후 로드됨을 명시한다.

## 범위·주의

- 이 명령은 **로컬 플러그인만** 업데이트한다. `mcp-server`·대시보드 등 **서버 컴포넌트는 범위 밖**(관리자가 docker로 배포).
- "서버 배포 최신" = `/template/download` 번들 = 마지막 mcp 빌드 시점의 플러그인. 관리자가 플러그인을 바꿨다면 template 재생성 + mcp 재배포가 선행돼야 이 명령에 반영된다.
- 개발용 git 체크아웃에서 로컬 plugin 수정 중이라면, 병합 덮어쓰기가 작업트리를 더럽힐 수 있다(플러그인 개발자는 `git pull` 사용 권장).
