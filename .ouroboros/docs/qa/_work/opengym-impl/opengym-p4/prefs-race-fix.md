# 동기 설정 되돌림 경합 수정 (2026-10-27)

- worktree `/Users/woobi/Desktop/tarae/liftgram-wt-opengym` · 브랜치 `feat/opengym-recs` · 커밋 **5a9fb5d** (미배포·push 안 함)
- 환경: 운영 빌드 웹 3300 · API 3301 · DB `e2e_og_pf_10271758`(끝난 뒤 삭제). 3100·3200·3201은 건드리지 않음.

## 1. 원인 확정
- `setPref`는 localStorage에 동기로 쓰고, `writeToProfile`(동적 import → `updateUserSettings` → `flushLocalDb` → `scheduleSync`)은 따로 비동기로 돈다.
  이 쓰기가 **디스크(IndexedDB)와 서버에 모두 닿기 전에** 문서가 사라지면 다음 부팅의 로컬 DB에는 옛 `app_prefs`가 남는다.
  그러면 `PrefsBridge` → `applyProfilePrefs`가 그 옛 값을 localStorage에 다시 덮어쓴다. `SYNCED_PREF_KEYS` 6개 모두 같은 경로를 탄다.
- 결정적 재현(이전 빌드): 한 문서 안에서 IndexedDB readwrite 트랜잭션을 막고 동기 Push를 끊은 뒤 끄고 새로고침했다. 결과는 **매번 "1"로 되돌아감**(효과 3/3, 테마 2/2 실패).
  ※ 디스크만 막고 Push를 살려 두면 서버를 거쳐 "0"이 다시 내려와 가려진다. 되돌림은 디스크 쓰기와 서버 올리기가 **둘 다** 끝나기 전에 닫혔을 때 생긴다.
- 같은 틱 새로고침(클릭 → `location.reload()`)으로는 이전 빌드에서도 대부분 통과했다(테마 1/16 실패). 새 문서 응답이 올 때까지 옛 문서가 살아 있어 쓰기가 끝나는 경우가 많다. 흔들림의 정체가 이것이다.
- 덧붙여 찾은 문제 둘(같이 고침)
  1. `flushLocalDb`는 저장 콜백의 오류를 무시하고 늘 true를 돌려줬다. 그래서 실패한 내려쓰기도 성공으로 보였다.
  2. `writeToProfile` 두 번이 겹치면 둘 다 같은 옛 `app_prefs`를 바탕으로 합친다. 그래서 앞 키가 사라질 수 있었다(lost update).

## 2. 수정
- `core/src/domain/prefsPending.ts`(새 파일, 순수 함수): `parsePendingPrefs`·`prunePendingPrefs`(7일)·`planProfilePrefsApply`(표식이 있는 키는 건너뜀)·`settlePendingPrefs`(value와 at이 같은 표식만 지움)·`mergeAppPrefs`. 충돌 규칙은 주석으로 적었다. **이 기기에서 마지막으로 바꾼 값이 우선**이고 시각은 비교하지 않는다.
- `frontend/lib/prefs.ts`
  - `setPref`(동기 키): `liftgram.prefsPending`에 `{value, at}`를 **값보다 먼저** 남긴 뒤 localStorage에 쓰고 `writeToProfile(patch, settle)`을 부른다.
  - `writeToProfile`: 프로미스 체인으로 한 줄로 세워 lost update를 막았다. 같은 값이면 DB에 쓰지 않고 내려쓰기만 한다. **"saved"일 때만** 내가 쓴 표식을 지운다. "failed"면 표식을 남기고, "unreachable"이면 예전처럼 자동 저장을 믿고 지운다(/diag/db가 잡는다).
  - `applyProfilePrefs`: 표식이 있는 키는 덮지 않는다.
  - `resumePendingPrefs`(새 함수): 부팅 때 오래된 표식을 버린다. 남은 표식은 그 값을 localStorage에 다시 맞추고 프로필에 써서 마무리한다.
- `PrefsBridge.tsx`: 마운트할 때 `resumePendingPrefs()`를 부른다. 앞 세션에서 올리다 만 `writeToProfile`의 거부도 삼킨다.
- `frontend/lib/localDb.ts`(작업 범위를 조금 넓힘, 최소 변경): `flushLocalDbResult()`를 추가했다. 결과는 "saved"·"failed"·"unreachable" 중 하나다. `flushLocalDb()`는 반환 의미가 같도록 이 함수 위에 얹었다.
- 권장안과 다른 점: **프로필 값이 표식 값과 같아져도 화면 쪽(applyProfilePrefs)은 표식을 지우지 않는다.** PrefsBridge가 받는 값은 메모리 DB의 것이라 아직 디스크에 없을 수 있다. 그 순간 지우고 새로고침하면 다시 되돌아간다. 그래서 표식은 내려쓰기를 확인한 쓰기 경로 한 곳에서만 지운다.

## 3. 테스트
- 단위 `core/src/domain/__tests__/prefsPending.test.ts` 8건: 재현·건너뛰기·settle(더 새 표식은 보존)·parse 방어·prune 경계·merge·전체 흐름.
- e2e `frontend/e2e/prefs-race.spec.ts` 4건, `--repeat-each=10`으로 **40/40 통과**
  1. 힘든 정도: 끄고 같은 틱에 새로고침하면 꺼진 채 유지되고, 한 번 더 새로고침해도 꺼짐
  2. 테마: 다크에서 시스템으로 바꾸고 같은 틱에 새로고침하면 시스템으로 유지
  3. 힘든 정도: 디스크 쓰기와 Push를 막은 채 끄고 새로고침해도 "0" 유지. 부팅 마무리 뒤 표식이 지워지고 재부팅해도 "0"(이전 빌드에서는 결정적으로 실패)
  4. 테마: 같은 실패 시나리오에서 라이트 유지(이전 빌드에서는 결정적으로 실패)
- `opengym-rir.spec.ts:273` 좌표 `--repeat-each=8`(360·390): **16/16 통과**(이전 약 50% 실패)

## 4. 검증
- `make verify`(src): **EXIT 0**. biome 오류 0(경고 3·정보 2는 기존 것), tsc frontend/contracts/core, go build/vet/test 통과. core 테스트 **453/453**(445 + 새 8건). core-check·catalog-check·docs-check 통과.
- 관련 e2e(opengym-rir·opengym-qa1·profile·profile-edit·sync·data-safety·unit-toggle·local-db·offline): **42/42 통과**

## 5. 남은 점(차단 아님)
- 계정 전환: 앞 계정의 표식이 마무리되지 않은 채 로그아웃하고 다른 계정으로 로그인하면, 7일 안에는 그 값이 새 계정 프로필에 올라갈 수 있다. 다만 기존에도 localStorage 설정값 자체가 계정 사이에 남는 구조라 같은 수준의 문제다.
- 테스트 중 다른 세션이 3301 API를 한 번 내렸다(18:06). 원래 폴더 세션이 3200·3201을 띄운 시각이다. 다시 띄워서 진행했다.

## 6. 정리
- 3300·3301 종료(3100 유지) · DB 삭제 · `.media/`·`test-results/` 삭제 · `next-env.d.ts` 원복. 디버그용 임시 spec은 삭제했다.
