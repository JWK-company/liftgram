# QA code: 같은 버전 업데이트 알림 · 운동 중 종목 추가 전체 화면 피커 (SRS-085 후속 · SRS-093 · v0.55.0)

> 2026-10-30 · 독립 코드 검토. 코드는 고치지 않았고 읽기만 했다.
> 대상: worktree `liftgram-wt-picker` · 브랜치 `feat/web-stack-tarae` 위 커밋 전 변경(`git diff`) 35개 파일
> 기준 문서: `.ouroboros/docs/spec/20261027_manual-update/spec.md` · `.ouroboros/docs/qa/20261027_manual-update-code_qa.md` · 위임 지시문
> **실행하지 않은 것**: 서버·e2e(3200 포트를 다른 작업이 쓰고 있어서 지시대로 실행 안 함). worktree 에 `tsc`·core 테스트 실행기가 깔려 있지 않아 타입 검사와 단위 테스트도 돌리지 못했다. 아래 내용은 모두 코드를 읽고 추론한 것이다. 실측이 아닌 항목은 「추측」이라고 적었다.

## 판정

**조건부 배포 가능.** 높음 0건 · 중간 4건 · 낮음 8건.

- A(같은 버전 알림): 보고된 증상(새로고침한 뒤 대기 워커가 지금 버전과 같음)은 고쳐진다. 다만 **버전 묻기가 1초 안에 끝나지 못하면 예전 증상이 그대로 다시 나온다**(M-1). 그리고 **지금보다 낮은 버전의 대기 워커를 「새 버전」으로 권하는** 길이 남아 있다(M-2). 조용한 활성화가 운동 중·다른 탭·캐시 정리와 부딪히는 문제는 큰 것을 찾지 못했다.
- B(운동 중 피커): 순서값을 최댓값+1 로 바꾼 것은 moveRow·슈퍼셋·finishRoutine 과 잘 맞는다. e2e 에서 빠진 삽입도 없다. 다만 **체크인 시트와 history 칸이 섞이는 문제**(M-3)와 **busy 잠금이 정말 잠그지는 못하는 문제**(M-4)가 있다.

## 참여 전문가

| 역할 | 전문 분야 | 본 관점 |
|------|----------|---------|
| PWA·서비스워커 엔지니어 | SW 수명주기·skipWaiting·clients.claim·캐시 세대·메시지 채널 | 조용한 활성화의 안전성 · 진짜 업데이트를 놓치는 길 · statechange/controllerchange 경합 |
| 프런트엔드 상태·상호작용 검토자 | React 상태·포털 모달·history 칸·포커스·스크롤 잠금 | 피커 열림·닫힘 수명주기 · busy 잠금 · 다른 시트와의 겹침 |
| 오프라인 데이터 검토자 | WatermelonDB/LokiJS 쓰기 직렬화·순서값·다중 탭 쓰기 주인(SRS-089) | 순서값 변경의 파급 · 중간 실패 의미 · 다른 탭 영향 |

---

## A. 수동 업데이트 알림 — 같은 버전 대기 워커

### 중간

**M-1. 버전 묻기가 시간 안에 끝나지 못하면 같은 버전도 「업데이트」로 권하고, 「새 버전 v(현재)」까지 나온다. 원래 증상이 다시 나온다.**
- 근거: `lib/appUpdate.ts:117` 은 `askWorkerVersion` 을 1초만 기다린다. 시간이 넘으면 `null` 이 오고, `swUpdatePolicy.workerUpdateKind(null)` 은 `'offer'` 다. 그러면 `setWaitingChecked`(:191~)가 `setWaiting(sw)` 를 부른다. 그런데 `setWaiting`(:162~) 은 **같은 워커에 버전을 한 번 더 묻는다.** 이때는 워커가 이미 깨어 있어서 답이 올 가능성이 높고, 그 답(=현재 버전)이 `newVersion` 에 들어간다. 이 값은 다시 대조하지 않는다.
- 실패 시나리오: 저사양 안드로이드에서 앱을 열면 부팅 부하가 걸린다. 그때 대기 워커를 처음 깨워 스크립트를 실행하는 데 1초가 넘게 걸린다 → 첫 질문 시간 초과 → offer → 두 번째 질문은 성공 → 프로필에 점이 뜨고 「새 버전 v0.55.0」(=현재)이 나온다. 피드백 증상과 똑같다(추측: 실제 기기에서 깨어나는 시간은 재지 않았다).
- 덧붙임(경합): 이렇게 `state.waiting = B`(같은 버전)인 채로 B 가 활성화되면 두 신호가 겹친다. B 의 statechange 리스너(:169)는 `activated` 가 되면 `activatedElsewhere: true` 를 세운다. 한편 `onControllerChangeChecked`(:218~)의 「same」 갈래는 waiting 만 비우고(:225) `activatedElsewhere` 는 내리지 않는다. 그래서 controllerchange 쪽 질문보다 `activated` statechange 가 먼저 오면, 점이 「새로고침하면 적용」 상태로 남는다(추측: 실제 순서는 활성화 핸들러의 캐시 정리 시간에 달려 있다).
- 권장: (a) `null` 을 받았을 때 「옛 워커」와 「시간 초과」를 구분한다. 하나는 2~3초로 늘려 한 번 더 묻는 방법이고, 다른 하나는 `setWaiting` 의 버전 답 콜백에서 `workerUpdateKind(v.version) === 'same'` 이면 `setWaiting(null)` 을 부른 뒤 `adoptSameVersion` 으로 넘기는 방법이다. (b) 「same」 갈래에서 `activatedElsewhere: false` 도 함께 내린다(지금 문서가 그 버전이므로 새로고침할 것이 없다).

**M-2. 대기 워커가 지금 문서보다 낮은 버전이어도 「새 버전」으로 권한다. 누르면 낮은 버전으로 내려간다.**
- 근거: `swUpdatePolicy.ts` 의 `workerUpdateKind` 는 같음(0)일 때만 `same` 이고, 나머지는 모두 `offer` 다. 테스트도 `workerUpdateKind('0.54.0','0.54.1') === 'offer'` 를 그대로 고정한다(`__tests__/swUpdatePolicy.test.ts:123`).
- 실패 시나리오: 며칠 전에 받아 둔 대기 워커 B(0.54.0)가 있다. 오늘 화면 문서는 네트워크에서 새로 받은 C 번들(0.55.0)이다(SWR 셸은 뒤에서 새로 받아 둔 HTML 을 다음 열기에 준다 — sw.template `page()`). 등록 직후 `reg.update()` 로 C 를 설치하는 동안, `setWaitingChecked(B)` 는 offer 로 판정해 「새 버전 v0.54.0」을 보인다. C 설치(정적 파일 전부 `addAll`)가 체육관의 불안한 망에서 실패하면 B 가 계속 권해진다. 사람이 누르면 B 가 활성화되고, B 의 PAGES 캐시에 든 0.54.0 셸이 SWR 로 나간다. 서버는 0.55 인데 화면은 0.54 로 **내려간다**. DB 스키마가 올라가 있었다면 다운그레이드 가드(schemaGuard)에 걸린다(추측: 가드가 어떻게 동작할지는 보지 않았다).
- 권장: `-1`(대기 워커가 더 낮음)은 `'older'` 로 따로 두고, 권하지도 조용히 활성화하지도 않는다. 그 대신 `reg.update()` 만 다시 부른다. 테스트의 기대값도 이에 맞춰 바꾼다.

### 낮음

**L-1. 같은 버전이지만 빌드가 다르면(재배포하면서 버전을 안 올린 경우) 조용히 넘기고, 이 문서의 정적 조각 캐시를 지울 수 있다.**
비교는 SemVer 세 자리뿐이다. 문서는 자기 BUILD_ID 를 모른다(`lib`·셸 어디에도 빌드 ID 노출이 없음). activate 핸들러는 「자기 빌드 + 바로 앞 세대(`/__current_build`)」만 남긴다. 그래서 문서의 빌드가 둘 다 아니면 그 빌드의 STATIC 캐시가 지워진다. 그 뒤 오프라인에서 지연 로딩되는 조각이 ChunkLoadError 를 낼 수 있다. 「배포마다 SemVer 를 올린다」는 규칙이 있어 실제로 일어날 가능성은 낮다. 근본적으로 고치려면 문서에 빌드 ID 를 심고 `version+build` 로 비교한다.

**L-2. 조용한 활성화는 진행 중 운동을 확인하지 않는다. 다른 탭에 주는 영향은 「표시」뿐이라 큰 문제는 아니다.**
`startUpdate` 는 진행 중 운동이 있으면 하지 않는데(①), `adoptSameVersion`(:203) 에는 그 확인이 없다. 탭 1(옛 번들 · 운동 중)과 탭 2(새 번들)가 열려 있으면, 탭 2 가 B 를 활성화하고 `clients.claim` 으로 탭 1 도 가져간다. 탭 1 에서는 `onControllerChangeChecked` 가 버전이 다르다고 판단해 `activatedElsewhere` 표시만 한다. 새로고침은 없다. 탭 1 의 옛 STATIC 은 「앞 세대」라 남는다. 화면 이동 데이터(RSC)는 원래 워커를 거치지 않으므로 서버가 새 버전인 것과 같은 상황이다. 결론적으로 새로 생긴 위험은 작다. 다만 「사람이 누를 때만 워커를 바꾼다」는 스펙 문구(SRS-085 확정 1)와는 어긋난다. 스펙에 「문서가 이미 그 버전이면 워커 교체는 사람 확인 없이 한다」는 예외를 적어 둘 것을 권한다.

**L-3. 조용한 활성화가 매 로드마다 숨은 iframe 찌르기를 일으킬 수 있다. v0.52 이전 워커가 제어 중이면 찌르기 문서를 앱 셸로 받을 수 있다.**
`/sw-nudge.html` 을 네트워크로만 받는 규칙(`nudgeDoc`)은 v0.52.0(6e10f26)에 들어갔다. iframe 요청은 **지금 제어 중인 옛 워커**가 처리한다. 그 워커가 0.52 이전 템플릿이면 `page()` 로 처리되어 3초 시간 초과 뒤 `/offline` 앱 셸이 iframe 에 뜰 수 있다. 0.52 이전 셸에 프레임 가드(SRS-089 `isFramedDocument`)가 있었는지는 확인하지 않았다(추측). 예전에는 사람이 누를 때만 일어나던 일이 이제 자동으로 일어나므로 노출 빈도가 늘었다. 0.52 이전 사용자는 거의 남아 있지 않을 것으로 보여 L 로 둔다.

**L-4. 활성화가 멈춘 채 풀리지 않는 경우가 이제 사람이 누르지 않아도 생길 수 있다.**
`swActivate.ts` 머리말의 실측에 따르면, 멈춘 뒤 그 탭을 새로고침하면 20초 넘게 끝나지 않는다. `waitForLoadSettled`(load 뒤 800ms) 덕분에 멈춤은 드물다. 그래도 예전에는 사람이 누른 경우에만 생기던 위험이 매 로드로 넓어졌다. `activateWaiting` 이 `false` 로 끝나면(멈춤) 다음 로드까지 다시 시도하지 않는 지금 동작은 괜찮다. 실패 횟수를 로그로 남겨 두기를 권한다.

**L-5. `setWaitingChecked` 가 질문하는 동안 워커가 `activated` 가 되면(다른 탭이 넘김) 활성화된 워커를 대기로 등록할 수 있다.**
`:197` 은 `redundant` 만 거른다. 시간 초과로 offer 가 되면 `setWaiting(activated sw)` 가 되어 점이 뜬다. 이 경우는 이어서 오는 controllerchange 의 「same」 갈래(:225, `state !== "installed"`)가 대개 비워 준다. 하지만 도착 순서가 바뀌면 남는다. `sw.state !== "installed"` 이면 `setWaiting` 을 건너뛰기를 권한다.

### 확인한 것(문제 없음)
- **applying 경합**: `adoptSameVersion` 은 시작할 때와 `stillWanted` 에서 `applying`·phase 를 본다. 넘기는 도중에 필수 업데이트가 시작되면, 양쪽 모두 skip-waiting 을 보내도 문제가 없고, controllerchange 는 `applying` 이므로 reload 로 간다. 같은 버전 워커는 `state.waiting` 에 들어가지 않으므로 사람이 그 워커로 「업데이트」를 누를 수도 없다.
- **진짜 새 버전을 놓치는가**: B(같음)를 넘기는 중에 C(새 버전)가 설치되면 B 는 redundant 가 되고 `activateWaiting` 이 `false` 로 끝난다. C 는 updatefound → `setWaitingChecked(C)` → offer 로 간다. E10b 도 이 길을 지킨다. M-1 과 M-2 말고 놓치는 길은 찾지 못했다.
- **`onControllerChangeChecked` 의 waiting 정리(:225)**: `installed` 가 아닌 waiting(=방금 자리 잡은 워커)만 비우고, 다른 설치 완료 워커(진짜 새 버전)는 남긴다. 이 판단은 옳다. 다만 `activatedElsewhere` 를 내리지 않는다(M-1 덧붙임).
- **캐시 정리**: 같은 버전 문서는 새 워커 빌드의 STATIC 을 쓰고, 옛 탭은 「앞 세대」로 남는다. 세대 하나만 보존하는 규칙과 어긋나지 않는다(L-1 은 예외).

---

## B. 운동 중 「종목 추가」 전체 화면 다중 선택

### 중간

**M-3. 체크인 시트(WeighInSheet)와 피커가 둘 다 history 칸을 쌓고 popstate 를 무조건 듣는다. 하나를 닫으면 다른 하나도 닫힌다.**
- 근거: 피커(`ExercisePickerScreen.tsx:118~126`)와 체크인(`WeighInSheet.tsx:156~167`)은 모두 `{...history.state, 플래그}` 로 칸을 쌓는다. 그래서 위 칸이 아래 칸의 플래그까지 물려받는다. 두 리스너 모두 popstate 가 오면 **자기 칸인지 보지 않고** 닫는다. 정리할 때의 `history.state?.플래그` 검사도 물려받은 플래그 때문에 통과한다.
- 실패 시나리오: 빠른 운동을 시작하고 곧바로 「종목 추가」를 누른다. 그동안 체크인 판정(`WeighInCheckin` 의 비동기 import·쿼리, `ActiveWorkout.tsx:467`)이 끝나서 체크인 시트(z-50)가 피커(z-45) 위에 뜬다. 이 상황에서 (a) 안드로이드 뒤로 가기를 한 번 누르면 popstate 하나에 **두 리스너가 다 반응해** 체크인과 피커가 함께 닫히고, 고른 종목도 날아간다. history 에는 칸 하나가 남는다. (b) 체크인을 「저장」 버튼으로 닫으면, cleanup 이 `history.state.liftgramWeighIn`(맨 위 칸)을 보고 `back()` 하고, 그 popstate 를 받은 피커가 닫힌다. 체크인은 설정을 켠 사람에게만, 운동 시작 직후(세트 0개)에만 뜬다. 바로 그때가 종목을 추가하는 순간이라 겹칠 가능성이 있다(추측: 판정이 끝나는 데 걸리는 시간은 재지 않았다).
- 권장: 칸마다 고유 토큰을 쓴다(`{liftgramLayer: id}`). popstate 에서는 `history.state?.liftgramLayer !== myId`(내 칸이 더는 맨 위가 아님)일 때만 닫는다. cleanup 에서도 `history.state?.liftgramLayer === myId` 일 때만 back 한다. 또는 피커가 떠 있는 동안 체크인을 미룬다.

**M-4. busy 잠금이 정말 잠그지는 못한다. 여러 개를 넣는 도중에 「완료」가 다시 눌리는 길이 있다.**
- 근거: `guard`(`ActiveWorkout.tsx:200~216`)는 들어갈 때 busy 를 확인하지 않고(재진입 허용), 끝날 때 무조건 `setBusy(false)` 한다. 여러 개 추가는 종목마다 `resolveStartVariant`·지난 기록 2건·플레이트 읽기·write 를 거친다(`workoutRepository.ts:1434~1490`). 5~8개면 저사양 기기에서 수 초가 걸린다(추측). 그동안 busy 로 막히지 않는 버튼이 있다. 일시정지(`btn-pause` → guard), 블록 이동 화살표(`moveRow` → guard), 슈퍼셋 묶기, 블록 「교체」(`onSwap` → 피커 다시 열림)다. 이 중 하나의 guard 가 먼저 끝나면 busy 가 false 가 되고 `btn-complete`(loading=busy)가 다시 눌린다.
- 실패 시나리오: 6개 추가 중에 일시정지를 누른다 → busy 가 해제된다 → 「완료」 → `finishWorkoutWithPrompt` 가 세트 0 블록을 지우고 운동을 끝낸다. 그동안 남은 루프는 끝난 운동에 블록을 계속 만든다. 결과적으로 완료된 운동에 빈 블록이 생기거나, 요약·루틴 반영(finishRoutine)과 어긋난다. 주석 「다 넣기 전에 끝나지 않는다」(:509)는 보장되지 않는다.
- 권장: busy 를 카운터로 바꾸거나(guard 중첩 수), 여러 개 추가 동안만 쓰는 ref 잠금을 두고 「완료」·「취소」가 그 잠금을 확인하게 한다. 가장 작은 수정은 「완료」 onPress 와 확인창 onConfirm 에서 `addingRef.current` 를 확인하는 것이다.

### 낮음

**L-6. 중간에 실패하면 일부만 들어간 채로 끝나고, 무엇이 들어갔는지 알 수 없다. 다시 고르면 겹친다.**
루프(`:521~`)의 k 번째 `addExerciseToWorkout` 이나 `applyPick` 이 던지면, 앞의 k 개는 남고 토스트만 뜬다. 피커는 이미 닫혀 있고 고른 목록은 사라졌다. 화면 목록은 `observe` 구독이라 앞의 k 개는 보인다. 그러나 사람이 같은 묶음을 다시 고르면 앞의 것이 두 번 들어간다. `afterWrite`(내려쓰기)도 건너뛰지만 LokiJS 자동 저장(500ms)이 받아 준다. 로컬 DB 쓰기가 실패하는 일 자체가 드물어 L 로 둔다. 「k/N 개 추가됨」 토스트를 권한다.

**L-7. (기존 결함 · 이번에 운동 화면으로 번짐) 피커가 열릴 때 포커스가 덮개로 옮겨지지 않는다.**
`ExercisePickerScreen.tsx:134` 의 `dialogRef.current?.focus()` 는 마운트 effect 안에 있다. 그런데 첫 렌더는 `root` 가 null 이라 `null` 을 그린다(:241). 그래서 그 effect 가 돌 때 `dialogRef.current` 는 null 이고, `root` 가 정해진 다음 렌더에서는 effect 가 다시 돌지 않는다. 그 결과 Tab 가두기(`trapTab`)는 포커스가 안에 들어온 다음에야 동작한다. 키보드나 스크린 리더로 쓰면 포커스가 뒤의 「종목 추가」 버튼에 남는다(코드를 읽고 내린 결론 · v0.54.0 qa M-3 조치가 실제로는 동작하지 않는 것으로 보임). `root` 를 의존성으로 하는 effect 로 옮기기를 권한다.

**L-8. 피커가 휴식 막대를 가린다.**
피커는 z-45 이고 RestBar 는 sticky z-40 이라, 고르는 동안 남은 휴식 시간이 보이지 않는다. 타이머와 알람은 시각 기반이라 계속 돈다(SRS 메모의 Web Audio 예약). 기능상 문제는 없다. 원하면 피커 머리줄에 남은 휴식을 작게 보여 준다.

### 확인한 것(문제 없음)
- **순서값 최댓값+1**: `database.write` 안에서 읽고 쓰고, 루프는 `await` 로 차례로 돌기 때문에 고른 순서가 그대로 유지된다. 겹치는 순서값(지운 뒤 추가)이 사라져 `moveRow` 의 행 교체가 결정적이 된다. `reorderWorkoutExercises` 는 0..n-1 로 다시 매기고, `finishRoutine.ts:41~55` 는 sort_order→만든 시각으로 다시 순위를 매기므로 틈이 있어도 문제가 없다. 슈퍼셋 묶기는 순서값을 건드리지 않는다. 지운 행(`prepareMarkAsDeleted`)은 쿼리에서 빠진다.
- **중복**: 한 번 고르는 안에서는 Map 이 중복을 막는다. 이미 운동에 있는 종목을 다시 넣는 것은 예전 시트에서도 허용하던 동작이다.
- **body overflow 복구**: 피커가 이전 값을 저장했다가 되돌린다. 다른 시트와 열고 닫는 순서가 엇갈리지 않는 한 괜찮다(체크인은 overflow 를 건드리지 않는 것으로 보임 · 확인은 grep 수준).
- **교체(single)**: 누르면 바로 `onDone` 이 불리고 피커가 닫힌다(history 칸 되돌림). 예전과 같다.
- **e2e 삽입**: `btn-add-exercise` 를 쓰는 30개 파일을 대조했다. 고르고 확정하는 곳에는 모두 `picker-confirm` 이 있다. 확정이 없는 파일(`opengym-bodyweight`·`multi-tab`·`discovery`·`catalog-search`/`catalog-revamp` 의 검색만 하는 테스트)은 버튼이 보이는지만 보거나 검색만 하고 끝나므로 확정이 필요 없다. `picker-sheet` 를 가리키는 테스트는 남아 있지 않다. 남은 `import-picker-sheet` 는 ImportFlow 의 다른 시트다.
- **버전**: `src/frontend/package.json` 이 0.55.0 이다(기능 추가이므로 minor). 이전 릴리스들도 이 파일 하나만 올렸다. `app/` 은 옛 RN 이라 대상이 아니다.

---

## 권장 조치 순서
1. M-1(시간 초과 → 같은 버전 권함) · M-2(낮은 버전 권함) — `workerUpdateKind` 에 `older` 를 추가하고, `setWaiting` 의 버전 답 콜백에서 다시 판정한다. 「same」 갈래에서 `activatedElsewhere` 를 내린다.
2. M-4 — 여러 개 추가 동안 「완료」·「취소」를 실제로 잠근다.
3. M-3 — 레이어 고유 토큰으로 history 칸을 구분한다(피커·체크인 공통 도우미).
4. L 항목은 다음 정리 때 처리한다.

---

## 조치 (2026-10-30 · 구현 세션)

| 항목 | 조치 | 확인 |
|------|------|------|
| M-1 버전 묻기 시간 초과 | 대기 워커·새 제어 워커 버전은 3초까지 기다림 · `useAppUpdate.available` 이 워커 버전 ≤ 현재면 거짓(늦게 와도 점이 남지 않음) · 같은 버전 갈래에서 `activatedElsewhere` 도 내림 | e2e E10 |
| M-2 낮은 버전 권함 | `workerUpdateKind` 에 `older` — 권하지도 넘기지도 않음 · 단위 테스트 갱신 | e2e E10c · 단위 |
| M-3 체크인·피커 서로 닫힘 | 칸마다 고유 토큰 `liftgramTop` — 위 칸이 닫혀 돌아온 popstate 무시 · 맨 위가 내 칸일 때만 back(피커·WeighInSheet 둘 다) | 정적 · 체중 e2e 회귀 통과 |
| M-4 busy 가 완료를 못 막음 | `adding` 별도 잠금 → 「완료」 loading · 「운동 추가」 disabled | 정적 |
| L-7 포커스 안 옮겨짐 | 포털 자리(root) 잡힌 뒤 포커스 | 정적 |

수정 전 빌드로 E10 재현 확인(새 워커가 대기로 남음 → 점) · 전체 e2e 301: 282 통과·15 건너뜀·4 실패(dm:157 메일·opengym-import 3건 E2E_FAULTS 빌드 필요 — 환경 기지) · 조치 뒤 관련 44 통과 · 단위 546.
