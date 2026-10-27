# /qa code — openGym P4 화면 · 권한·개인정보 보안 감사(클라이언트+서버 결합 지점)

- 검토자: 권한·개인정보 보안 감사관(독립 검토 · 읽기 전용)
- 대상: `/Users/woobi/Desktop/tarae/liftgram-wt-opengym-p4` `feat/opengym-p4` · `git diff 40d6c46..HEAD`(20fc3b0, 21파일)
- 근거: 스펙 Phase 4 · 스펙 보안 검토 S-1~S-20 · 서버 코드 검토(r1) · ADR-040·041 · 구현 보고 3종
- 방법: 코드 읽기와 core 재현 스크립트 한 번(scratchpad의 bun 스크립트로 `buildPeriodSummary` → `omitSections(['bodyweight'])` → `parseSummaryV1`). 운영 빌드(3600/3601)와 e2e DB는 띄우지 않았다. 만들지 않았으므로 정리할 서버·DB도 없다.

## 핵심 의견

1. **가장 큰 문제(P4S-1)**: 체중 섹션을 기본으로 끄는 처리(S-11)는 키 단위로는 맞다. 스냅샷에 `bodyweight` 키가 없고 e2e도 이것만 확인한다. 하지만 회원 쪽 세트 계산에 **현재 체중**을 넣는다. 그래서 맨몸·어시스트 종목의 `topExercises[].first/last.weightKg`와 `prs[].valueKg`에 체중이 그대로 들어간다. 맨몸 풀업만 해도 「풀업 72.5kg × 10」이 코치에게 간다. 기본값 그대로 보내도 신체정보가 기기 밖으로 나간다. SRS-048의 「신체정보 기본 제외」와 S-11의 의도를 우회하는 셈이다. 재현으로 확인했다(아래).
2. **두 번째 문제(P4S-2)**: 「다른 계정 기록이 남아 동기가 멈춘 동안 보내기 막기」는 메모리 상태 `ownerConflict`에만 기대고 있다. 이 상태는 앱 시작 때 `me()`가 성공해야 채워진다. 앱을 오프라인이나 불안정한 망에서 열면 비어 있다. 또 이 화면의 `online` 처리기가 대조(reconcile)를 건너뛰고 `startSummaryOutbox`를 부른다. 그러면 멈춤 상태의 B 계정이 이 기기에 남은 A의 기록으로 요약을 만들어 B의 코치에게 보낼 수 있다.
3. 그 밖의 결합 지점은 잘 닫혀 있다.
   - DM 카드·대화 목록·알림은 숫자 없는 고정 문구만 쓴다(S-7).
   - 서버는 클라이언트가 보낸 `kind=SUMMARY`를 막는다(dm/service.go:277 · S-14). 그래서 refId를 위조한 카드는 만들 수 없다.
   - 열람할 때마다 서버가 권한을 다시 본다. 해지·차단·재계약(consent_at)이면 「코칭이 끝나 볼 수 없어요」가 뜨고, 당사자가 아니면 NotFound다. 받은 스냅샷은 반드시 `parseSummaryV1`을 지나 새 객체로 다시 만들어지고, `dangerouslySetInnerHTML`은 쓰지 않는다.
   - 트레이너 리포트의 원본 응답·계산 결과는 컴포넌트 상태에만 둔다.
   - 「루틴 처방」은 회원 id를 메모리의 Peer로만 넘긴다. 주소는 `?highlight=summary`뿐이다.
   - 옛 `GetMemberReport` 호출은 [원본]/[개선] 규칙대로 주석 처리돼 있다.
4. 대기열은 다음이 맞게 되어 있다.
   - 계정별 키와 항목별 `ownerUserId`로 거른다(prune).
   - 로그아웃·wipe·계정 전환 때 지운다.
   - 영구 실패는 스냅샷을 지우고 이유만 남긴다.
   - 재전송은 같은 client_id·같은 본문으로 하고, 보낼 때마다 새 uuid를 쓴다.
   - flush 루프 안에서도 사용자·세션을 다시 확인한다.

   빈틈은 세션 만료처럼 로그아웃을 거치지 않는 경로뿐이다(P4S-3).

## 지적

### P4S-1 · 높음 · 체중을 꺼도 맨몸·어시스트 종목 무게에 현재 체중이 실려 코치에게 간다
- 위치:
  - `src/core/src/data/periodSummaryRepository.ts:75,81`: `getUserBodyweightKg()` → `summaryInputFromRaw({ bodyweightKg })`
  - `src/core/src/domain/periodSummary.ts:358`: `bw`를 세트 계산에 사용
  - `src/core/src/domain/volume.ts:25-31`: `effectiveWeightKg` = 맨몸이면 `bw + w`, 어시스트면 `bw − w`
  - `ProgressSummaryClient.tsx`의 `preview` = `omitSections(...)`: `topExercises`·`prs` 무게는 그대로 남는다
- 재현(core만 · bun): 체중 72.5, 맨몸 풀업 0kg × 8 / × 10으로 계산하고 `omitSections(s, ['bodyweight'])`를 적용했다. 스냅샷 결과:
  - `"topExercises":[{"name":"풀업","first":{"weightKg":72.5,"reps":8},"last":{"weightKg":72.5,"reps":10}}]`
  - `"prs":[{"type":"maxWeight","valueKg":72.5},{"type":"maxVolumeSet","valueKg":725,...}]`

  `bodyweight` 키는 없지만 체중이 그대로 드러난다.
- 시나리오: 회원이 체중을 프로필이나 체크인에 넣어 두고 아무 토글도 건드리지 않은 채 보낸다. 트레이너 DM 카드를 열면 「풀업 72.5kg」이 보인다. 이것이 서버 `progress_summaries.snapshot_json`에 영구 저장된다.
  - 기간 첫 운동과 마지막 운동이 모두 맨몸 종목이면, 현재 체중 하나만 쓰므로 값이 같다(체중 변화가 드러나지는 않는다). 그래도 절대 체중은 매번 노출된다.
  - 어시스트(`bw − w`)도 마찬가지다.
  - 덧붙여 같은 종목을 트레이너 리포트는 0(가중분만)으로 계산한다. 그래서 「받은 요약 ≠ 리포트」가 맨몸 종목에서 갈린다.
- e2e 공백: `opengym-summary.spec.ts:194,211`은 `"bodyweight" in snap`만 본다. 첫 시나리오에는 맨몸 종목 표본이 없다(`seed-pull-up`은 1년 표본 테스트에만 있다).
- 수정안(택1, 권장 a)
  - a) **보내는 스냅샷과 미리보기는 늘 `bodyweightKg: null`로 계산한다.** 트레이너 리포트와 같은 규칙(맨몸 = 가중분)이다. `buildMemberSummary`에 `bodyweightForSets: false`를 기본으로 두면 된다. 회원 숫자와 리포트 숫자도 함께 맞는다(S-12 확장).
  - b) 체중 섹션이 켜졌을 때만 체중을 넣어 다시 계산한다(토글마다 재계산). 보는 그대로 보낸다는 원칙과도 맞는다.
  - 공통: 계산 결과에 맨몸·어시스트 표시가 없으면 받는 쪽은 구분할 수 없다. 표시가 필요하면 `loadMode` 칸을 추가한다(스냅샷 판 1 안에서는 선택 칸).
  - 공통: e2e를 추가한다. 체중 72.5와 맨몸 풀업 세트를 넣고 기본값으로 보낸 뒤, 서버 스냅샷 문자열 전체에 `72.5`가 없는지 확인한다.

### P4S-2 · 중간 · 「다른 계정 기록이면 보내기 막기」가 앱을 오프라인으로 연 뒤에는 꺼져 있고, 화면의 online 처리기가 대조 없이 대기열을 시작한다
- 위치:
  - `src/frontend/app/components/AuthProvider.tsx:113`: `reconcile`은 `me()`가 성공했을 때만 돈다. 실패하면 catch(117)로 가고 `ownerConflict`는 null로 남는다.
  - `ProgressSummaryClient.tsx:108,227`: `canSend = … && !ownerConflict`
  - `ProgressSummaryClient.tsx:210`: `if (outboxUser() !== user.id) startSummaryOutbox(user.id)`. 대조를 거치지 않는다.
  - `summaryOutbox.ts:272-277` `runFlush`: 사용자·세션만 보고 기기 주인은 확인하지 않는다.
- 시나리오:
  1. 기기 주인 A에게 아직 올리지 않은 기록이 있다.
  2. B가 로그인한다. 결과는 `blocked`이고 AccountGuard가 뜬다. B는 고르지 않고 앱을 닫는다.
  3. 나중에 앱을 오프라인이나 약한 망에서 연다. 깃발은 살아 있고, 캐시에 B가 있으며, `me()`는 실패해 `ownerConflict`가 null이다.
  4. 망이 돌아오고 B가 통계 → 기간 성과 요약으로 들어간다(클라이언트 이동이라 load가 다시 돌지 않는다).
  5. `buildMemberSummary`가 이 기기의 **A 기록**으로 요약을 만든다. `canSend`가 true라 **B의 코치에게** 전송된다.

  화면에 머문 채 online이 되는 경우도 있다. 210행 처리기가 대조 없이 flush를 시작한다. 그러면 오프라인에서 대기열에 쌓인 같은 요약이 나간다.
  - 또 앱을 정상으로 열어도, `reconcile`이 끝나기 전(IndexedDB 카운트) 잠깐은 `ownerConflict`가 null이다. 요약 계산이 더 오래 걸려 실제로 누르기는 어렵지만 경쟁 창이 있다.
- 영향: 제3자(B의 코치)에게 다른 사람(A)의 운동 기록 요약이 서버에 영구 저장된다. 조건은 까다롭지만 「남의 기록으로 만든 요약일 수 있다」는 구현자 본인의 위협 모델을 그대로 뚫는다.
- 수정안: 메모리 상태 대신 **기기 주인(syncOwner OWNER_KEY)과 차단 깃발(setBlocked)을 로컬에서 읽어** 막는다.
  - core에 읽기 전용 `deviceOwnerMatches(userId)`(owner === userId ∧ !blocked)를 둔다.
  - ① `canSend`의 조건으로 쓴다. 판정 전에는 false로 둔다.
  - ② `sendSummary`와 `runFlush`에서 항목마다 이 조건을 확인한다.
  - ③ 210행 처리기는 `startSummaryOutbox` 대신 대조(`onLoggedIn`과 같은 결과 해석)를 거치게 하거나 ②에 맡긴다.
  - `reconcileAccount`는 로컬 전용(syncOwner.ts:62-84)이다. 그래서 `load()`의 catch 경로에서도 캐시된 사용자로 대조를 돌릴 수 있다. 이렇게 하면 AccountGuard도 오프라인 시작에서 뜬다.

### P4S-3 · 낮음 · 로그아웃을 거치지 않는 세션 종료(refresh 401·다른 탭 깃발 하강)는 대기열 스냅샷을 지우지 않는다
- 위치: `AuthProvider.tsx:117,131`의 `setUser(null)`만 있고 `onLoggedOut`·`stopSummaryOutbox`를 부르지 않는다. `summaryOutbox.ts`의 모듈 상태 `currentUser`·online 리스너도 그대로다.
- 시나리오: A가 오프라인으로 요약을 대기열에 넣은 뒤 세션이 만료된다. `liftgram.summaryOutbox:<A>`에 숫자가 든 스냅샷과 코치 id·이름이 남는다.
  - 다음 로그인이 B이고 결과가 `blocked`이면 `startSummaryOutbox`가 불리지 않는다(syncTransport.ts:134). 그래서 A의 대기열이 B 사용 중에도 계속 남는다. 화면에는 안 보이지만 같은 기기를 쓰는 사람이 개발자 도구로 읽을 수 있다.
  - 전송은 `hasSession()`과 prune(ownerUserId) 때문에 일어나지 않는다. 노출만 있고 오발송은 없다.
- 수정안:
  - `onSessionChange`에서 `!hasSession()`이면 `stopSummaryOutbox()`를 부른다(전부 지움 — 「로그아웃 = 지움」과 같은 규칙).
  - `onLoggedIn`이 `blocked`일 때도 `clearSummaryOutboxes(userId)`로 다른 사람 대기열을 지운다. 이때 시작(flush)은 하지 않는다.

### P4S-4 · 낮음(참고) · 대기 중 해지 → 7일 안에 재계약하면 옛 관계 때 만든 스냅샷이 새 관계로 묶여 나간다
- 위치: `summaryOutbox.ts` `runFlush`. 항목에는 `trainerId`만 있고 만든 시점의 관계(consent_at)는 없다. 서버는 보낼 때 현재 grant에 묶는다.
- 시나리오: 회원이 오프라인에서 보내기를 누른다. 연결 전에 해지(회수 의도)하고, 며칠 뒤 같은 트레이너와 다시 계약한다. 그 뒤 연결되면 옛 요약이 전송된다. S-13(재계약 전 요약은 닫힘)과 방향이 반대인 빈틈이다.
- 수정안: 해지·차단할 때(`revoke` 성공 후) 그 `trainerId`의 대기 항목을 실패로 옮긴다(`reason: "ended"`). 또는 항목에 큐잉 시점의 grant id·consent_at을 넣어 서버가 비교하게 한다(서버 변경이므로 다음 판에서).

### 확인 결과 — 문제 없음(근거)
- **체중 키**:
  - `SUMMARY_DEFAULT_OFF=['bodyweight']`(periodSummary.ts:140)이고 `off`는 매번 새 Set이다(기억하지 않는다).
  - `omitSections`가 키째 빼고 `parseSummaryV1`이 다시 만든다. 보내는 스냅샷은 `serializeSummaryV1(preview)`(보는 그대로).
  - 시트에 체중 경고가 있다. e2e는 요청 본문과 서버 저장본 모두 확인한다.
  - 숫자 경로의 누출은 P4S-1로 따로 지적했다.
- **DM·대화 목록·알림·푸시**:
  - 카드는 `progressSummary.card/cardMine` 고정 문구이고, `body`(서버 상수 `SummaryFallbackBody`)는 무시한다.
  - 대화 목록은 `progressSummary.preview`, 알림은 `notif.coaching_summary`({name}만)다.
  - 서버 `Notify(..., "")`는 postId가 없다.
  - 주소는 `?highlight=summary`뿐이다(요약 id·회원 id 없음).
- **위조**:
  - 클라이언트 SUMMARY 전송은 서버가 Validation으로 거절하고 RefID도 지운다(dm/service.go:277-283).
  - `parseSummaryV1`은 모르는 키를 버린다(`__proto__` 포함). 배열·문자열 상한과 유한 숫자만 허용한다.
  - 렌더에는 innerHTML이나 href 생성이 없다.
- **열람 권한**:
  - 열 때마다 `GetProgressSummary`를 부른다.
  - 트레이너는 `assertCoachingAccess`(차단 포함)와 `ConsentAt.Equal`(재계약)을 거친다. 실패하면 PermissionDenied → `ended`가 뜨고, 처방 버튼이 사라진다(e2e 확인).
  - 당사자가 아니면 NotFound → `notFound`다. 존재 여부를 알려 주지 않는다.
  - 오프라인이면 다시 시도 버튼만 있고 캐시는 없다.
- **처방 판 진입**:
  - `viewAs==="receiver" && state.kind==="ok"`일 때만 보인다. 즉 서버가 트레이너 열람을 허가한 뒤에만 열린다.
  - 회원 id는 서버 응답 `row.memberId`를 메모리의 Peer로만 쓴다. 이후 루틴 RPC는 서버가 다시 권한을 본다.
  - 대화 메시지는 서버만 만들므로 sender와 memberId가 어긋날 수 없다.
- **트레이너 리포트**:
  - `MemberReportDialog`는 응답과 결과를 state에만 둔다.
  - `loadSummaryCatalog`·`getExerciseDisplayNameMap`(SummaryOpen)은 쓰기가 없는 읽기 경로다.
  - e2e가 트레이너의 localStorage·sessionStorage·IndexedDB 전체를 덤프해 회원 id가 없음을 확인한다.
  - 세션·총 볼륨(캐시)·부위별 숫자가 같은지도 e2e로 확인한다. 단 맨몸 종목은 P4S-1 참고.
  - PermissionDenied → `ended`, ResourceExhausted → `tooLarge`.
- **옛 호출**: `CoachingClient.openReport`가 [원본] 주석 + [개선] `setReportFor`다. `ReportDialog`는 남아 있지만 `report` 상태를 세팅하는 곳이 없다(죽은 경로 — 원복용).
- **대기열**:
  - 키는 `liftgram.summaryOutbox:<userId>`이고 항목마다 `ownerUserId`가 있다. prune이 주인이 다른 항목을 버린다.
  - 로그아웃(`stopSummaryOutbox` → 전부 지움), wipe·`discardAndAdopt`(전부), 같은/다른 계정 로그인(`keep` 외 지움) 때 정리된다.
  - flush 루프는 항목마다 `currentUser`·`hasSession`·`onLine`을 확인한다.
  - 영구 실패(PermissionDenied·NotFound·FailedPrecondition·InvalidArgument·AlreadyExists·ResourceExhausted)는 스냅샷 없이 실패 목록으로 간다.
  - 일시 실패는 같은 client_id·같은 본문으로 다시 보낸다(서버 멱등). 누를 때마다 `crypto.randomUUID()`를 쓰고, `busy`로 두 번 누르기를 막는다.
  - 대기 10개, TTL 7일.
  - 「마지막 코치 목록」은 내 관계(id·이름 ≤ 20)뿐이고 같은 키에 있어 로그아웃 때 함께 지워진다. 수용 가능하다.
- **로그·오류 보고**: 추가된 `console.warn("[progressSummary] 계산 실패", e)`는 DB 오류 객체만 남기고 스냅샷은 넣지 않는다. Sentry 같은 외부 오류 보고 경로는 frontend에 없다.
- **/stats/summary 오프라인 셸 밖**(sw.js:24 SHELLS에 없음): 셸에 숫자가 캐시되지 않으므로 개인정보 면에서는 유리하다. 오프라인 대기열은 화면을 연 뒤 끊긴 경우에만 쓰인다(기능 제약 · 보안 문제 아님).
- **새 기록 목록 100일 이하**: 긴 「직접」 기간은 개수만 보낸다. 보내는 양이 줄어 최소화 쪽에 유리하다.

## 판정

**조건부 통과** — 지적 4건(높음 1 · 중간 1 · 낮음 2).
- **P4S-1(높음)은 배포 전에 반드시 고친다.** 기본값 그대로 보내도 체중이 코치에게 간다. 맨몸 종목 e2e를 함께 추가한다.
- **P4S-2(중간)도 이번 판에 고칠 것을 권장한다.** 기기 주인과 차단 깃발을 로컬에서 읽어 `canSend`·`sendSummary`·`runFlush` 세 곳을 막는다.
- P4S-3·P4S-4(낮음)는 이번 판 또는 다음 판에서 처리해도 된다.
- 그 밖의 결합 지점(DM·알림 숫자 없음, 위조 차단, 열람 재검사, 처방 판 진입, 트레이너 저장소 무잔존, 옛 호출 주석 처리)은 통과다.
