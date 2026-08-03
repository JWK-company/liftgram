# app 세션 화면 구조 지도 (RN → React DOM 이관용)

> 조사 대상: `app/src/features/session/` 5파일(ActiveWorkoutScreen 536 · ExerciseBlock 1112 · ExerciseName 70 · ExerciseTipPanel 144 · SessionGuides 115)
> 작성: 2026-08-03 · 목적: 웹 스택(src/) 세션 화면을 **같은 UI·같은 규칙**으로 재현하기 위한 사양

## 1. ActiveWorkoutScreen

**골격**: 커스텀 헤더(닫기 chevron-down · 경과 `MM:SS` + 이름(연필 아이콘, 일시정지면 warning색) + 골드 라이브 볼륨 · 일시정지/재개 · 완료 pill 버튼) → RIR/웜업 가이드 버튼 2개 → 종목 리스트(패딩 16, 슈퍼셋은 primary 테두리 컨테이너로 묶임) → 푸터(운동 추가 secondary / 운동 취소 danger) → 하단 플로팅 **골드 휴식 바** → 모달(이름변경 · 슈퍼셋 상대선택) + PR 폭죽.

**경과 계산**: `ref = (state==='paused' && pausedAt) ? pausedAt : now` → `round((ref - startedAt - accumulatedPauseMs)/1000)`, 0 하한. 1초 인터벌(일시정지면 정지).

**상태**: base/workout(useModelData) · now · finishing · renaming/nameDraft · liveVolume(1.5초 폴링) · ssVersion(슈퍼셋·순서·교체 후 강제 재조회) · supersetTarget · exercises(useQueryData).

**저장소 호출**: getWorkout · queryWorkoutExercises · getWorkoutLiveVolume · pause/resumeWorkout · renameWorkout · addExerciseToWorkout · reorderWorkoutExercises · swapWorkoutExercise · group/ungroupWorkoutExercisesSuperset · getWorkoutUndoneSetCount · completeWorkout · discardWorkout.

**reorderRows**: `supersetGroup`이 있고 멤버 ≥2면 `{kind:'group'}` 한 행으로 접는다.

**휴식 바**(하단 절대위치 left/right/bottom 16): bg `colors.pr`(#FFD23F) · pill · timer-outline 18(bg색) · "휴식 MM:SS"(body bold, bg색) · `+15s`(startRest(remaining+15)) · `건너뛰기`(clearRest).

## 2. 휴식 타이머 = 전역 (state/sessionContext.tsx)

- `startRest(sec)`: 이전 예약 취소 → `restEndRef = Date.now()+sec*1000` → 소리 예약(웹=오디오 클록·keep-alive / 네이티브=OS 알림) → MediaSession 진행바.
- 틱 **500ms**, 남은 초 = `round((restEndRef - Date.now())/1000)` — **월클럭 기준**이라 백그라운드 복귀에도 정확.
- 0 이하 → null + 소리/진동. `clearRest()` 즉시 null.
- 화면을 벗어나도 유지 · 다른 화면에서는 `GlobalWorkoutBar`가 같은 값 표시(휴식 중 골드, 아니면 primary).
- **이관 판정**: sessionContext는 `react-native` Platform·`utils/sound`·`utils/restAlarm`에 묶여 있어 **재작성 대상**(ADR-032의 '서버·플랫폼 책임'). 규칙(월클럭·500ms·전역 1개)만 그대로 옮긴다.

## 3. ExerciseBlock (핵심)

**렌더 순서**
1. 헤더: ▲▼(20px) · `ExerciseName`(heading, base, revealOnTap) · info · 슈퍼셋(git-merge-outline, 그룹이면 primary) · 교체(swap-horizontal-outline) · 삭제(trash-outline)
2. 메타 칩 행(gap8 wrap): `VariantSelector` · 슈퍼셋 배지 · **`PR {무게} × {횟수}`**(pr 골드 caption) · 볼륨 칩(primaryMuted pill, "볼륨 …" 또는 "총 N회") · 체중 미설정 경고(warning) · (팁 없을 때) 이전기록 지우기
3. `ExerciseTipPanel`(근력만) — 우측에 이전기록 지우기 병치
4. 그리드 헤더: 세트(34) · 이전(66) · 무게(flex) · 횟수(flex) · 체크(40) · 더보기(34). 무게 라벨은 loadMode에 따라 "보조"/"가중"/"무게 (kg)"
5. 세트 행들(SetRowEdit 또는 SetRowCardio)
6. 유산소면 CardioSummary("총 …")
7. 세트 추가(secondary)
8. 메모 TextField(multiline, minHeight 38)
9. 지난 메모("지난 메모: …")
10. 메모 이력 타임라인(토글 · 날짜 `YY.M.D` + 메모)
11. 휴식 시간 `NumberStepper`(step 15, 0~600, suffix "초") — **설정값일 뿐, 카운트다운은 전역 1개**

**파생값**: `exVol`(완료 && !warmup && !failed의 Σ 유효무게×횟수) · `variantKey = canonicalVariantKey(variant)` · `hasTip = !isCardio && getExerciseMedia(nameKo)` · `bwMissing` · 라벨(`normalCount`는 일반 세트만 증가; W/D/F/T/숫자)

**저장소**: getPreviousExerciseSets(exerciseId, variantKey) · getExercisePR · getPreviousExerciseNote · getExerciseNoteHistory · setWorkoutExerciseNote · setVariant · addSet · removeWorkoutExercise · evalLiveSetPr · updateSetLog · setSetDone/Type/Arm/Grip · deleteSetLog.

## 4. 세트 타입

- 데이터: `isWarmup`·`isDrop`·`isFailed`(상호배타 — `setSetType`이 셋을 동시 갱신) + 처방용 `setType('warmup'|'top'|'backoff'|null)`·`targetRir`
- 칩: minWidth 28 · radius 8 · bg surfaceAlt · hairline border. 색 — warmup=pr, drop=primary, failed=danger, 그 외 textMuted
- 탭 → 액션시트(일반/워밍업 W/드롭 D/실패 F/**플레이트 계산**/취소). **웹에서는 Alert 대신 커스텀 시트**

## 5. 세트 행(SetRowEdit)

`[타입칩][이전 칩][무게][횟수][체크][▼]` · 완료 행은 **전체가 primaryMuted로 칠해짐** · 완료 시 입력 잠김(체크 해제로만 복원)
- 이전 칩: `10×9` 또는 깔짝 있으면 `10×(9+1)`, 단위 생략, border primary. 탭하면 그 값을 그대로 채운다. 그립·팔 축약이 있으면 아래 줄에
- 처방 라인: "목표 4-7회" + "RIR 2"
- 제안 라인: "제안 {무게} — {근거}" + [적용] → `suggestNextSetWeightKg`(warmup>warmup ×1.12 · warmup>top ×1.35 · top>backoff ×0.85)
- 상세 펼침: 부분반복(깔짝) 입력 · 변형 칩(팔·그립 시트) · 삭제
- **체크 체인**: setSetDone → (완료면) `onStartRest(restSecondsForSetType(setType, restSeconds))` — 웜업 45 / top 180 / backoff 120 / 그 외 종목 설정값 → MediaSession 갱신 → `evalLiveSetPr` → PR이면 폭죽

## 6. 유산소 행

컬럼 = metrics(`cardioMetricsFor`)에 따라 시간(분)/거리(km)/경사(%)/단계/속도(km/h). 이전 칩은 `formatCardioSet`. 삭제는 close 아이콘(즉시).

## 7. ExerciseTipPanel

- 종목명(nameKo) 기준 접힘 상태를 **앱 수명 동안 기억**(기본 접힘)
- 미디어 있으면 `TwoFrameLoop`(gif 1장 또는 start/end 1100ms 교차, 높이 150) · 탭하면 단계 설명으로 전환(상호 토글)
- 단계 설명: 18×18 원형 번호(primaryMuted) + 본문(caption textMuted)

## 8. ExerciseName

`baseExerciseName`(기구 토큰 제거) 사용 · 기본 1줄 말줄임 · `revealOnTap`이면 탭 시 펼치고 **3초 뒤 자동 접힘**.

## 9. SessionGuides

RIR 가이드(4쪽) · 웜업 가이드(3쪽) 모달 — 도트 페이지네이션 + 이전/다음(마지막은 "확인"). 본문은 i18n `guide.*`에 전부 존재.

## 10. PR 축하

모듈 이벤트 버스 → 전체화면 오버레이(pointer-events:none). 파티클 14개(7색, 무작위 각도·거리 60~130·회전 ±270°, 850ms ease-out) + pill(border `colors.pr`) "🎉 {종목} 중량 PR·볼륨 PR 달성!" + "역대 최고 기록! 운동 완료 시 저장돼요". 총 2400ms(페이드인 180 → 유지 → 페이드아웃 420).

## 11. 웹 이관 시 주의

1. `Alert.alert` 5곳(운동 종료·운동 취소·종목 삭제·세트 타입 시트·플레이트 계산) → 커스텀 다이얼로그
2. 드래그 재정렬보다 **▲▼ 원클릭 이동이 주 UX** — 드래그 없이도 완전 동작해야 한다
3. `useQueryData`는 **필드 변경 시 재방출되지 않는다** → 원본은 `ssVersion` 범프·1.5초 폴링으로 우회. 같은 우회가 필요
4. 휴식 타이머는 전역 + 월클럭(endAt) + 500ms 틱
5. 완료 세트는 입력 잠김
6. 무게/횟수 입력은 `min-width:0` 없으면 flex 축소가 막힌다(웹도 동일)

## 12. 만들어야 할 컴포넌트

ActiveWorkoutScreen · WorkoutHeader · RenameWorkoutDialog · SupersetPickerDialog · SupersetContainer · RestBar + SessionProvider · GlobalWorkoutBar · SessionGuideButtons/GuideModal · ExerciseBlock · ExerciseName · ExerciseTipPanel/TwoFrameLoop · VariantSelector(완료) · SetRowEdit/SetTypeMenu/PlateCalcDialog · SetVariantSheet · SetRowCardio/CardioSummary · PrCelebrationHost · NoteHistoryPanel · IconButton · ConfirmDialog
