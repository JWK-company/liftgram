---
description: 소스코드의 @plm 역링크 주석을 스캔 → PLM에 코드↔요구 딥링크 동기 (Code 아티팩트·realizes·위치 + 문서 code_refs 역기재)
---

코드와 요구를 **양방향 딥링크**로 잇는다. 소스코드에 단 `@plm <CODE>` 주석을 수집해 PLM에 반영한다.

## 역링크 주석 규약
구현 코드(함수/모듈) 위에 주석으로 상위 아티팩트를 명시한다(여러 개 가능):
```rust
// @plm SRS-002  피드 생성 — fan-out-on-read
pub fn build_feed(...) { ... }
```
`//` `#` `<!-- -->` 등 언어별 주석문법 자유. `@plm` 뒤에 `SRS-002 [SAD-001 ...]` + 설명.

> **배치 권장**: `@plm`은 **구현 심볼(함수·클래스) 바로 위**에 둔다 → 스캐너가 다음 선언에서 심볼명을 추출해 Code 키를 **심볼 기반**(라인 이동에 안정)으로 만든다. 파일 최상단에 두면 파일-레벨 링크(라인 폴백).

## 동작
1. 바인딩(project/api_url)·토큰 확인(없으면 `/plm-hub:link`).
2. `scripts/plm_codescan.py` 실행(env `PLM_CODE_ROOT` 또는 프로젝트 루트 하위 소스 스캔):
   - 각 `@plm` 위치마다 **Code 아티팩트** 생성 — `code=CODE-<경로슬러그>-<라인>`, `body` 첫 줄 `` loc: `path:line` ``, `build_state=as_built`, `granularity=function`.
   - **realizes**(Code→SRS/SAD) 관계 생성 → `POST /import`.
   - 참조된 기획 아티팩트의 로컬 `.md` frontmatter에 `code_refs: [path:line, ...]` **역기재**(문서에도 명시).
3. **GC(추적 정합)**: 스캔된 파일·디렉토리에서 **사라진 심볼/삭제된 파일**의 구 Code 아티팩트를 **Superseded**로 표시(이력 보존·하드삭제 아님). 안전판정: loc 경로가 이번 스캔 범위(scanned dirs)일 때만 — 다른 스코프(서브디렉토리 스캔)는 보존.
4. **미존재 대상 경고**: `@plm`이 PLM에 없는 아티팩트(SRS-099 등 오타·미발급)를 가리키면 스캔 시 ⚠ 경고(해당 Code는 realizes 없는 orphan→G3). `/requirement`로 발급하거나 오타 수정.
5. 결과(Code 수·realizes·code_refs·GC·경고) 보고. `/plm-hub:gates`로 G3(구현 갭) 확인. (게이트는 Superseded 제외 — 마이그레이션 0008.)

## 추적 효과
`SRS-002` → (PLM 역참조 `implemented_by`/`realizes`) → `Code` 아티팩트 → `loc: src/feed.rs:42` → 실제 코드. 역으로 소스의 `@plm` 주석 → 요구. 문서 `code_refs`로 .md에서도 구현 위치 확인.

## 스캔 제외 (.plmignore)
죽은/벤더/구이터레이션 코드가 `@plm` 주석으로 Code 아티팩트를 오염·재생성하는 것을 막으려면 스캔 루트에 **`.plmignore`**(gitignore식 glob, 줄당 1패턴, root 기준 relpath)를 둔다. 환경변수 **`PLM_CODE_IGNORE`**(콤마 구분)로도 지정 가능. 예: 폐기된 프로토타입 `Source`, `_archive`, `vendor`, `third_party`, `*/build/*`. 전체 스캔·단일 파일 동기 모두 적용.
