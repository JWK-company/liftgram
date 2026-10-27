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
`//` `#` `<!-- -->` 등 언어별 주석문법 자유. `@plm` 뒤에 `SRS-002 [SAD-001 ...]` + 설명. ※ 주석 문법은 자유지만 **파일 확장자는 자유가 아니다** — 스캐너는 화이트리스트 확장자만 연다(아래 [스캔 대상 · 제외](#스캔-대상--제외)).

> **배치 권장**: `@plm`은 **구현 심볼(함수·클래스) 바로 위**에 둔다 → 스캐너가 다음 선언에서 심볼명을 추출해 Code 키를 **심볼 기반**(라인 이동에 안정)으로 만든다. 파일 최상단에 두면 파일-레벨 링크(라인 폴백).

## 동작
1. 바인딩(project/api_url)·토큰 확인(없으면 `/plm-hub:link`).
2. `scripts/plm_codescan.py` 실행(env `PLM_CODE_ROOT` 또는 프로젝트 루트 하위 소스 스캔):
   - 각 `@plm` 위치마다 **Code 아티팩트** 생성 — `code=CODE-<경로슬러그>-<심볼슬러그>`(주석 아래에서 심볼을 못 찾으면 `CODE-<경로슬러그>-<라인>` 폴백), `body` 첫 줄 `` loc: `path:line` ``, `build_state=as_built`, `granularity=function`.
   - **realizes**(Code→SRS/SAD) 관계 생성 → `POST /import`.
   - 참조된 기획 아티팩트의 로컬 `CODE.json` 래퍼에 `"code_refs": [path:line, ...]` **역기재**(ADR-019 동형, 문서에도 명시).
3-b. **관계 reconcile**: 같은 Code의 `@plm` 대상이 바뀌면(다른 요구로 재태깅) 구 `realizes`를 `DELETE /relations`로 지운다. `/import`는 관계를 **추가만** 하므로 이 단계가 없으면 옛 링크가 영구히 남는다.
3. **GC(추적 정합)**: 스캔된 파일·디렉토리에서 **사라진 심볼/삭제된 파일**의 구 Code 아티팩트를 **Replaced**로 표시(이력 보존·하드삭제 아님). 안전판정: loc 경로가 이번 스캔 범위(scanned dirs)일 때만 — 다른 스코프(서브디렉토리 스캔)는 보존.
4. **미존재 대상 경고**: `@plm`이 PLM에 없는 아티팩트(SRS-099 등 오타·미발급)를 가리키면 스캔 시 ⚠ 경고(해당 Code는 realizes 없는 orphan→G3). `/requirement`로 발급하거나 오타 수정.
5. 결과(Code 수·realizes·code_refs·GC·경고) 보고. `/plm-hub:gates`로 G3(구현 갭) 확인. (게이트는 Replaced 제외 — 마이그레이션 0008.)
5-b. **고아 loc 경고**: 활성 Code의 `loc` 파일이 스캔 루트 아래에 없으면(파일 이동·`PLM_CODE_ROOT` 변경 의심) 경고만 출력한다 — **자동 삭제하지 않는다**(서브디렉토리만 스캔했을 때 오삭제 위험). 이 경고가 뜨면 옛 경로 prefix로 Code가 중복 생성되고 있다는 신호이니, `PLM_CODE_ROOT`을 프로젝트 루트로 고정하고 정리는 사람이 확인 후 한다.

## 추적 효과
`SRS-002` → (PLM 역참조 `implemented_by`/`realizes`) → `Code` 아티팩트 → `loc: src/feed.rs:42` → 실제 코드. 역으로 소스의 `@plm` 주석 → 요구. 문서 `code_refs`로 .md에서도 구현 위치 확인.

## 스캔 대상 · 제외

**스캔은 확장자 화이트리스트에 한정된다** — 목록 밖 확장자에 `@plm`을 달면 **조용히 무시**된다(예: `.mjs`·`.zig`·`.scala`·`.pl`·`.r`). 대상 확장자:
`.rs .ts .tsx .js .jsx .py .go .java .kt .sql .sh .rb .php .c .cpp .h .hpp .cs .swift .vue .svelte .html .htm .css .scss .dart .lua .ex .exs .gd .md .yaml .yml .toml .tf`
(단일 파일 동기 경로도 같은 필터를 먼저 통과해야 한다.)

또 아래 디렉토리는 **`.plmignore` 없이도 항상 제외**된다(하드코딩):
`.git · node_modules · target · .target · .next · dist · build · __pycache__ · venv · .venv · vendor · .ouroboros · .final · .test · Intermediate · Binaries · Saved · DerivedDataCache · .vs · .godot · .tools · .import · plm-hub · guide`
(마지막 두 개는 템플릿 자체 머신러리라 사용자 코드로 오인하지 않기 위한 제외다.)

### 추가 제외 (.plmignore)
죽은/벤더/구이터레이션 코드가 `@plm` 주석으로 Code 아티팩트를 오염·재생성하는 것을 막으려면 스캔 루트에 **`.plmignore`**(gitignore식 glob, 줄당 1패턴, root 기준 relpath)를 둔다. 환경변수 **`PLM_CODE_IGNORE`**(콤마 구분)로도 지정 가능. 예: 폐기된 프로토타입 `Source`, `_archive`, `vendor`, `third_party`, `*/build/*`. 전체 스캔·단일 파일 동기 모두 적용.
