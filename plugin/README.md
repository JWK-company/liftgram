# plugin

<!-- @plm SRS-001  도메인 repo 경계 -->
JWK-company 통합 플랫폼의 **plugin** 도메인 repo. 우산: [claude-workflow-plm](https://github.com/JWK-company/claude-workflow-plm) (submodule 핀·조합 릴리스 태그·기획 거버넌스 — PLM project: claude-plm-architecture)

## 경계 (SAD-001)

Claude Code 플러그인 3종(plan·code·plm-hub, 워크플로우 3세대) + 마켓플레이스 + 번들 빌드 파이프라인(SRS-005). 비소유: 프로젝트 시드·installer(workflow).

## 규약

- 시크릿 실값 커밋 금지 — pre-commit 게이트(gitleaks). `*.enc.yaml`(sops)만 커밋 대상
- 구현 코드에 `@plm <SRS/SAD>` 역링크 주석 → /plm-hub:codescan 추적
- 릴리스: repo 태그 → 우산 핀 범프 (버전 정책: 우산 _intent.md)

## 클론 후 1회

```bash
bash scripts/setup-hooks.sh   # 시크릿 커밋 차단 게이트 활성화
```
