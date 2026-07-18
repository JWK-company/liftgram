# workflow

<!-- @plm SRS-001  도메인 repo 경계 -->
JWK-company 통합 플랫폼의 **workflow** 도메인 repo. 우산: [claude-workflow-plm](https://github.com/JWK-company/claude-workflow-plm) (submodule 핀·조합 릴리스 태그·기획 거버넌스 — PLM project: claude-plm-architecture)

## 경계 (SAD-001)

로컬 installer(오너/참여자 모드) + 프로젝트 시드 template + 통합 docs(ADR-003). 소유: 사용자 로컬 Claude Code 환경 구축(SRS-008)·셀프호스트 문서(SRS-007). 비소유: 서버 프로비저닝(infra의 terraform).

## 규약

- 시크릿 실값 커밋 금지 — pre-commit 게이트(gitleaks). `*.enc.yaml`(sops)만 커밋 대상
- 구현 코드에 `@plm <SRS/SAD>` 역링크 주석 → /plm-hub:codescan 추적
- 릴리스: repo 태그 → 우산 핀 범프 (버전 정책: 우산 _intent.md)

## 클론 후 1회

```bash
bash scripts/setup-hooks.sh   # 시크릿 커밋 차단 게이트 활성화
```
