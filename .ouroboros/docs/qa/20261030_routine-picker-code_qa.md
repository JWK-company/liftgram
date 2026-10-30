# /qa code — 루틴 편집 전체 화면 종목 피커 · 홈 새 루틴 버튼 (SRS-093)

- 대상: worktree `/Users/woobi/Desktop/tarae/liftgram-wt-picker` 미커밋 변경 전부 (+ 새 파일 `ExercisePickerScreen.tsx`·`ui/FilterRow.tsx`·`e2e/routine-picker.spec.ts`)
- 요구: `.ouroboros/docs/requirements/SRS-093.json`
- 방법: 정적 리뷰만(서버·e2e 실행 안 함 — 3200 포트 사용 중). 줄 번호는 worktree 기준.
- 참여 전문가(역할):
  - **오프라인 우선 데이터 정합성 검토자** — WatermelonDB/LokiJS 쓰기 순서·sortOrder·비동기 수명
  - **React UI 상태·성능 검토자** — 상태 모델(Map 순서)·재렌더 비용·연타·포털/z-index
  - **웹 접근성 감사관** — dialog/aria-modal·포커스·키보드(Esc·IME)·뒤로가기
  - **e2e 테스트 설계 검토자** — 단정의 변별력·고정 대기·누락 시나리오

## 결론

H 등급은 없다. 요구(SRS-093) 수용 기준은 코드상 모두 충족한다(홈 버튼 같은 크기·noRoutines 시 새 루틴만 빨강, 전체 화면, 칩 좁히기, 고른 순서, 닫기=무추가, 교체=즉시).
M 6건은 대부분 「여러 개를 한 번에」로 바뀌면서 커진 기존 위험과 접근성·테스트 변별력 문제다.

검증 결과 문제 없음(참고): 도우미가 열려 있으면 피커의 Esc 리스너가 떨어져 Esc 한 번에 도우미만 닫힌다(`ExercisePickerScreen.tsx:98-103`, `ExerciseFinderWizard.tsx:55-60`). 같은 keydown 안에서는 피커 리스너가 아직 다시 붙지 않는다(effect가 커밋 뒤에 돈다). z-index: TabBar·GlobalWorkoutBar z-40 < 피커 z-[45] < 도우미·시트 z-50. 피드 작성기(`FeedClient.tsx:392`)와 같은 층이다. 스크롤 잠금은 이전 값을 저장했다가 되돌린다(89-95). 선택은 `Map` 넣은 순서로 유지되고, 해제했다가 다시 고르면 맨 뒤로 간다(153-164). 검색으로 고른 정보는 고를 때의 hit에서 나온다(138). 「비슷한 운동」은 원본처럼 info 없이 넘긴다(339). 17곳의 e2e `picker-confirm` 추가는 빠진 곳이 없다(`btn-add-routine-exercise` 쓰는 파일과 1:1).

---

## M (Medium)

### M-1 추가 루프가 끝나기 전에 「이 루틴으로 시작」/「완료」를 누르면 일부만 반영된다
- 근거: `RoutineEditor.tsx:382-405`. 피커를 먼저 닫고(`setPicking(null)`) 그 뒤 fire-and-forget async에서 `for (pick of picks) { addExerciseToRoutine; applyPick }`를 차례로 await한다. `canStart`(413)는 `exercises.length > 0`만 본다. 시작 핸들러(442-451)는 진행 중인 추가를 기다리지 않는다.
- 실패 시나리오: 기존 종목이 있는 루틴에서 5개를 골라 「5개 추가」 → 바로 「이 루틴으로 시작」 → `startWorkoutFromRoutine`가 루프 중간 상태를 읽어 일부 종목만 든 세션이 생긴다. 원본은 1개라 창이 작았는데, N개(각 항목마다 write 1회 + applyPick의 동적 import·쓰기)로 창이 N배가 됐다.
- 덧붙여: try/catch가 없다. 중간 항목이 실패하면 나머지는 조용히 버려지고 unhandled rejection이 난다. 토스트도 없다(원본과 같지만 이제 항목 여러 개가 걸려 있다).
- 권장: 추가 중 플래그(ref+state)를 두고 그동안 시작·완료·운동 추가 버튼을 막는다(또는 시작이 그 Promise를 await). try/catch 후 토스트. 가능하면 한 `database.write` 안에서 batch로 만든다(L-6과 같이 해결).

### M-2 「sortOrder = 지금 개수」가 고른 순서 = 루틴 순서를 보장하지 않는다(기존 결함이 커짐)
- 근거: `routineRepository.ts:100,111`은 `sortOrder = fetchCount()`. 반면 `removeRoutineExercise`(177-181)는 `markAsDeleted`만 하고 나머지 번호를 다시 매기지 않는다. 정렬은 `sort_order asc`뿐이다(35).
- 실패 시나리오: A(0) B(1) C(2) 중 A 삭제 → 개수=2 → 새로 고른 X가 sortOrder 2로 C와 같은 값이 된다. 같은 값의 순서는 LokiJS 정렬에 달려 있어(추측: 안정성 보장 없음) X가 C 앞에 끼어 보일 수 있다. `RoutineEditor.tsx:394`의 주석 「sortOrder 가 지금 개수라 고른 순서가 곧 루틴 순서다」는 이 경우 거짓이다.
- 권장: 추가 시 `max(sortOrder)+1`을 쓰거나 삭제 시 다시 번호를 매긴다(`reorderRoutineExercises` 267-272 재사용). 다중 추가는 한 write 안에서 base+i로 넣는다.

### M-3 dialog인데 포커스 관리가 없다(원본 autoFocus 제거)
- 근거: `ExercisePickerScreen.tsx:187-193`은 `role="dialog" aria-modal="true"`인데 열 때 포커스를 옮기지 않고, 트랩도 inert도 없다. 원본 `ExercisePicker.tsx`의 검색칸 `autoFocus`도 없어졌다.
- 실패 시나리오: 키보드 사용자가 「운동 추가」를 누르면 포커스가 덮개 뒤 버튼에 남는다. Tab을 누르면 보이지 않는 배경(편집 화면 입력·하단 버튼)을 먼저 돈다. 포털이 body 끝에 있기 때문이다. 스크린리더는 aria-modal 때문에 배경을 무시하라는 신호와 실제 포커스 위치가 어긋난다.
- 권장: 열 때 제목 또는 닫기 버튼에 포커스를 준다(모바일 키보드가 튀어나오지 않게 검색칸 autoFocus는 데스크톱에서만). 닫을 때 「운동 추가」·교체 버튼으로 되돌린다. 배경 컨테이너에 `inert`를 걸거나 간단한 포커스 트랩을 둔다. 기존 `ui/Dialog`에 같은 처리가 있다면 그것을 재사용한다.

### M-4 브라우저/안드로이드 뒤로가기가 피커를 닫지 않고 편집 화면을 떠난다
- 근거: 피커는 history와 묶여 있지 않다(`ExercisePickerScreen.tsx`에 popstate 없음). 같은 코드베이스의 `WeighInSheet.tsx:149-166`과 `ImportFlow.tsx:187-204`는 pushState+popstate로 「뒤로=시트 닫기」를 구현해 두었다.
- 실패 시나리오: 화면 전체를 덮고 ← 앱바까지 있는 피커는 사용자에게 「한 페이지」로 보인다. 여러 개를 고른 상태에서 시스템 뒤로가기를 누르면 피커가 아니라 루틴 편집을 떠나고(직전 화면으로), 고른 것이 다 사라진다. 원본 인라인 카드는 페이지처럼 보이지 않아 덜 문제였다.
- 권장: WeighInSheet 패턴(열 때 pushState, popstate→onClose, 코드로 닫을 때 history.back 정합)을 적용한다. 선택이 1개 이상일 때 ←·Esc로 닫으면 「선택 N개를 버릴까요?」 확인을 고려한다(SRS 「닫기는 아무것도 넣지 않는다」와 충돌하지 않는다).

### M-5 e2e의 「별칭이 표시 이름이 된다」 단정이 공허하다
- 근거: `routine-picker.spec.ts:74-87`. 「벤치」로 검색해 `seed-barbell-bench-press`를 고르고 `rows.nth(2)`에 「벤치」가 있는지 본다. 그런데 대표 이름 「바벨 벤치프레스」에 이미 「벤치」가 들어 있다. matchedKind=name이라 `applyPick`이 아무것도 바꾸지 않아도 통과한다.
- 실패 시나리오: `onDone`이 info를 빼먹거나(예: `info: undefined`) 다른 종목의 info를 붙여도 이 테스트는 초록이다. SRS-056 회귀를 잡지 못한다.
- 권장: 대표 이름에 없는 별칭(예: 카탈로그의 실제 alias 하나, 「롱풀」류)으로 검색해 고르고, 루틴 줄 표시 이름이 그 별칭인지·`pick-alias`가 보였는지 단정한다. 함축 칸(impliedAxes) 별칭이면 그 칸 값까지 확인한다. 다중 선택에서 info가 다른 종목에 엇갈려 붙지 않는지 보도록 별칭 검색 2건을 섞는 것을 권장한다.

### M-6 전 목록 무제한 렌더 + 선택 토글마다 모든 줄 재렌더(성능, 수치는 추측)
- 근거: 원본 피커는 `LIMIT = 60`(`ExercisePicker.tsx:36`)으로 잘랐는데 새 피커는 검색 없을 때 전체(~400행)를 그린다(`ExercisePickerScreen.tsx:122-127, 311-321`). 줄마다 Pictogram(SVG innerHTML)이 붙는다. 선택을 토글하면 `picked`가 바뀌어 `order`가 새로 만들어지고, 모든 `PickRow`가 다시 그려진다(memo 없음, `onPress` 클로저 매번 새로 생성, `order.indexOf`로 O(N·K)). `names` 필터는 원소마다 `new Set(names)`를 만든다(116. CatalogClient의 같은 코드를 그대로 가져옴).
- 실패 시나리오(추측): 저사양 안드로이드에서 줄을 누를 때마다 400개 줄을 재조정해 번호 표시가 늦게 뜨고, 사용자가 안 눌린 줄 알고 다시 눌러 선택을 해제한다. CatalogClient도 전체를 그리지만 거기는 탭 토글이 없다.
- 권장: `PickRow`를 `React.memo`로 감싸고 `position`·`onPress`(id 인자 받는 안정 콜백)만 바뀌게 한다. `order`는 `Map<id, index>`로 만든다. Set은 `useMemo`로 한 번만 만든다. 실기기 프로파일로 확인한다.

---

## L (Low)

- **L-1 Esc가 IME 조합 중에도 닫는다** — `ExercisePickerScreen.tsx:100`이 `e.isComposing`을 확인하지 않는다. 한글 조합 중 Esc(조합 취소 의도)에 피커가 닫히고 선택이 사라진다. `if (e.isComposing) return` 추가 권장.
- **L-2 로딩/빈 상태·i18n** — repo는 있는데 쿼리 첫 값이 아직 안 왔으면 「결과 없음」이 한 번 깜빡인다(300-305. 메모리 「로드 전 []≠0개」). 하드코딩 한국어 3곳: 「카탈로그를 여는 중입니다」·「잠시만 기다려 주세요」(303-304), 「비슷한 운동」(329). en에서 그대로 한국어로 나온다(마지막은 원본에서 옮겨 온 것).
- **L-3 safe-area·스크롤 체이닝** — single 모드는 하단 고정 줄이 없는데 스크롤 영역 하단 패딩(210 `pb-xl`)에 `env(safe-area-inset-bottom)`이 없어 마지막 줄이 홈 인디케이터에 걸칠 수 있다. 목록에 `overscroll-behavior: contain`이 없어 iOS에서 끝까지 스크롤하면 배경 body로 이어질 수 있다(추측. `overflow:hidden`은 iOS 터치 스크롤을 완전히 막지 못한다).
- **L-4 연타 방어 없음** — 「N개 추가」·single 줄 클릭에 재진입 가드가 없다. React 18은 discrete 이벤트 업데이트를 다음 이벤트 전에 반영하므로 실제로 두 번 들어갈 가능성은 낮다(추측). 다만 단일 ref 가드는 비용이 거의 없다.
- **L-5 개별 write N회** — `RoutineEditor.tsx:395-398`이 항목마다 `database.write`를 한 번씩 하고 매번 관찰을 깨운다. N번 재렌더하고, 탭이 루프 중간에 닫히면 마지막 `flush()` 전이라 일부만 디스크에 남는다. 한 write + batch 권장(M-1·M-2와 같이).
- **L-6 새 루틴 버튼의 의미·활성 시점** — `<a href>`가 `Button`+`navigateAfterFlush`가 되어 새 탭 열기·prefetch가 사라졌다(`RoutinesClient.tsx:240-249`). 빠른 운동은 `!homeReady`일 때 막혀 있는데(레이아웃 이동 오탭 방지), 같은 줄의 새 루틴은 늘 활성이다. 새 루틴은 첫 변경 전까지 아무것도 만들지 않으므로 해는 작다.
- **L-7 영문 반폭 버튼 줄바꿈(추측)** — 「Create New Routine」·「Quick Start Workout」+아이콘이 360px 폭의 절반에 들어가는지 확인이 필요하다. home-primary e2e는 ko 너비만 잰다.
- **L-8 빌드 부산물** — `src/frontend/next-env.d.ts`(`.next/dev/types`→`.next/types`)는 dev/prod 빌드 전환 부산물이다. 커밋에서 빼야 한다.
- **L-9 §3.6·잔여** — `CatalogClient.tsx`의 FilterRow 본체를 주석 보존 없이 지웠다(이동이라 동작 변화는 없고 대체 주석은 있다). `routines.newRoutine` 키는 이제 주석에서만 쓰인다(미사용 키).
- **L-10 e2e 허술한 곳** — Esc 테스트(`routine-picker.spec.ts:104-105`)는 `waitForTimeout(800)` 고정 대기다. 새 루틴이라 `routine-exercises` 컨테이너가 없어도 `toHaveCount(0)`이 통과한다. 기존 종목이 있는 루틴에 다중 추가 시 뒤에 붙는지(M-2), 도우미를 연 채 Esc를 누르는 경우(도우미만 닫히고 선택 유지), 추가 직후 시작(M-1) 시나리오가 없다. 교체 테스트는 교체 모드에서 info(별칭)가 넘어가는지 보지 않는다.

---

## 요약 표

| ID | 등급 | 위치 | 한 줄 |
|----|------|------|-------|
| M-1 | M | RoutineEditor.tsx:382-405 | 추가 루프 중 시작/완료 → 일부만 든 세션, 오류 처리 없음 |
| M-2 | M | routineRepository.ts:100-111,177-181 | sortOrder=개수 + 삭제 미재번호 → 고른 순서가 깨질 수 있음(기존) |
| M-3 | M | ExercisePickerScreen.tsx:187-213 | aria-modal인데 포커스 이동·트랩·복귀 없음, autoFocus 제거 |
| M-4 | M | ExercisePickerScreen.tsx(전체) | 시스템 뒤로가기가 편집 화면을 떠나 선택 소실(WeighInSheet 패턴 미적용) |
| M-5 | M | routine-picker.spec.ts:74-87 | 별칭 단정이 대표 이름과 겹쳐 SRS-056 회귀 못 잡음 |
| M-6 | M | ExercisePickerScreen.tsx:114-117,311-321 | 무제한 렌더 + 토글마다 전 줄 재렌더(수치 추측) |

---

## 조치 (2026-10-30 · 구현 세션)

| 항목 | 조치 | 확인 |
|------|------|------|
| M-1 일부만 든 채 시작 | `addExercisesToRoutine` 한 번의 write(batch) · 추가 중 「시작」「완료」 잠금(loading) · 실패 토스트 | e2e routine-picker 3개 추가 |
| M-2 순서값 겹침 | 순서값 = 남은 최댓값+1(`nextSortOrder`) — `addExerciseToRoutine`도 같이(원본 줄 주석 보존) | e2e 「하나 지운 뒤 넣어도 맨 뒤」 |
| M-3 포커스 | 열 때 덮개로 포커스 · Tab 가둠 · 닫으면 연 버튼으로 복귀 | 수동(키보드) |
| M-4 시스템 뒤로 | WeighInSheet 방식 history 한 칸 — 뒤로 = 피커만 닫기 | e2e 「시스템 뒤로 가기」 |
| M-5 별칭 e2e | 대표 이름에 없는 「롱풀」로 단정 | e2e |
| M-6 성능 | 줄 `memo` + 안정 콜백 · 도우미 Set 한 번 | 정적 |
| L IME Esc | `isComposing` 이면 무시 | 정적 |
| L next-env.d.ts | 커밋 제외 | — |

검증: 단위 545/545 · e2e routine-picker 7 + home-primary·routines·manual-update(28 통과·1 건너뜀) · 회귀 14파일 73 통과·1 건너뜀 — 로컬 운영 빌드 v0.54.0(3200/3201 새 DB).
남은 L: 하드코딩 한국어 3곳(카탈로그 화면과 같은 문구) 등 보고서 L 항목은 보류.
