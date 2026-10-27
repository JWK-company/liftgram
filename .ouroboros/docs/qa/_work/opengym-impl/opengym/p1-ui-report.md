<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# openGym P1 화면 — 결과 보고 (2026-10-27)

## 커밋
- `878bbf4` feat(opengym): P1 화면 — 세트 힘든 정도 칩·시트·노력 분석 카드·기록 상세 RIR (SRS-073·074 · 미배포) · 브랜치 feat/opengym-recs (df4bf7e 위) · push·merge·배포 안 함

## 파일 (17개)
- 새 파일: `frontend/lib/effortPref.ts`(설정 훅) · `components/profile/EffortLoggingRow.tsx`(스위치 줄) · `components/session/RirChip.tsx`(칩) · `components/session/RirSheet.tsx`(시트) · `components/analytics/EffortCard.tsx` · `components/analytics/exerciseEffort.ts`(진척 막대 채움) · `e2e/opengym-rir.spec.ts` · `e2e/helpers/opengym.ts`
- 기존 파일(최소 diff): `lib/prefs.ts` +1줄(SYNCED_PREF_KEYS) · `ProfileClient.tsx` +2줄(import·`<EffortLoggingRow />`) · `StatsClient.tsx` +3줄(import·주석·`<EffortCard days={SPAN[period]} />`) · `SetRowEdit.tsx` +24/−5(SetRow.rir·onUpdate 패치 타입·훅 1줄·처방 줄 조건·칩) · `WorkoutDetailClient.tsx`(RPE 열 → RIR 열 + DetailRir) · `ExerciseProgress.tsx`(채움·범례) · core `i18n/locales/{ko,en}.ts` 끝 구역 `effort.*` 39키 · `guideCopy.test.ts` PREFIXES 에 `effort.`
- ExerciseBlock·공용 ui(Dialog·charts·quiet·primitives)·RestBar 는 **건드리지 않음**(칩 저장은 SetRowEdit `onUpdate({rir})` → 기존 블록 `write` 직렬화 그대로).

## 검증
- `bun run test:core` 414/414 · `tsc --noEmit -p core`·`-p frontend` 오류 0 · biome(바꾼 20파일) 통과 · `make verify` exit 0
- 새 e2e `opengym-rir.spec.ts` **9/9 통과**(운영 빌드 3300/3301 · DB e2e_og_20261027163737 — 수정 뒤 재빌드로 한 번 더 9/9):
  1. 켜기 → 칩 「힘든 정도」 → 누르는 자리(폭 ≥44, 보이는 칩 위아래 4px 바깥 elementFromPoint 도 칩 · 합 44) → 「2」 즉시 닫힘·칩 2·포커스 칩 → 3 → 스테퍼 2.5(닫을 때 저장) → 지우기+Esc → 2(같은 값 복귀, 2초 뒤에도 2) → 기록 상세 「2」 → 분석 카드 「평균 여유 2.0개 · 여유 3개 이하 100%」·「적은 세트 1/1」 → 종목 상세 채움 1개·범례 → 동기 → 다른 기기 로그인·동기 → 상세 「2」·설정 "1" 동기
  2. 끄면 `set-rir-*` 0개 → 켜면 생김 → 끄면 0개
  3. 처방 RIR 2 루틴: 꺼짐 「RIR 2」 글자·칩 0 → 켜짐 칩 「목표 2」(빨강 글자 사라짐)·시트 「목표 여유 2개」 → 1 고르면 「1 · 목표 2」
  4·6. 휴식 막대 떠 있는 채 시트: 360×640·390×844 둘 다 선택지 6개·스테퍼 −/+·지우기 가운데 점 = 자기 자신, 휴식 막대 가운데 점 ≠ 막대 · Esc → 포커스 칩
  5·7. 좌표(아래)
  8. v25 모양 DB → v26 이관(아래) + 기록 없을 때 노력 카드 = 접힌 안내, 펼치면 「설정에서 켜면 운동 중에 적을 수 있어요」
  9. 다운그레이드 가드(아래)
- 전체 e2e(3300): **171 통과 · 1 실패 · 10 건너뜀**(6.8분)
  - 실패 `dm.spec.ts:157`(알림 3건) — 이번 변경과 무관. 메모리 「로컬 운영 빌드 e2e」에 「dm:157 은 이 환경에서 원래 실패」로 기록된 항목. 단독 재실행도 같은 자리(`feed-notifications` 클릭 대기 30s)에서 실패.
  - 건너뜀 10 = 환경 게이트(구글·카카오 OAuth 4 · declutter-shots 캡처 3 · 피드백 내부자 1 · 제휴 링크 1 · 모더레이션 검토자 1)
- Go 테스트는 make verify 안의 test 로만(따로 안 돌림).

## 좌표 측정값(첫 블록, 세트 2줄, 안내 띠 닫음, scroll 0)
| 화면 | 꺼짐(기준선) | 켜짐 | 다시 꺼짐 | 증가분 |
|---|---|---|---|---|
| 360×640 | set1 285 · set2 333 · 세트추가 385 | 285 · 371 · 461 | 285 · 333 · 385 | 첫 세트 0 · 둘째 세트 **+38** · 세트 추가 +76(줄 2개) |
| 390×844 | 285 · 333 · 385 | 285 · 371 · 461 | 285 · 333 · 385 | 같음 |
- 첫 세트 `set-done` 은 칩이 그 **아래** 줄에 있어 0px. 상한 +40 은 세트 한 줄당(38px)으로 검사했다. 끈 상태는 켰다 끈 뒤에도 기준선과 같다.
- D-14 v26 첫 동기(새 기기 전량 pull) 161ms(운동 1개 계정 · 의미 있는 수치 아님).

## 이관·가드 측정
- 이관: v26 `{version 26, sets 2, workouts 1, rir 칸 2, 새 표 3}` → v25 로 걷어 냄 `{25, 2, 1, 0, []}` → v26 번들로 열기 `{26, 2, 1, 2, 새 표 3}` · 상세 62.5×8·70×5 그대로 · maxSchemaSeen 26
- 가드: maxSchemaSeen=27 → `schema-guard` 보임 · 진짜 `repset` 내용 전후 동일 · `repset-schema-guard` 생김 · maxSchemaSeen 27 유지(낮추지 않음)

## 캡처(.ouroboros-work/shots/p1/, 커밋 안 함 · chrome-devtools, DPR 2)
set-on/off × 360/390 × light/dark (8) · rirsheet × 360/390 × light/dark (4, 휴식 중) · effortcard × 4 · detail-360-dark · progress-360-light/dark

## 스펙과 다른 점·판단
1. QuietChip 은 className·ref·aria-label 을 받지 않아(공용 파일 수정 금지) RirChip 이 **같은 클래스로 모양을 복제**했다. 누르는 자리 = 버튼 높이 36 + `::before` 위아래 4px(=44) · 최소 폭 44. 늘어난 4px 은 이웃 줄 바깥 여백(py-4) 자리라 다른 버튼과 겹치지 않는다.
2. 칩 글자: 비었고 목표 없음 = 「힘든 정도」 · 값만 = 「2」 · 목표 있음 = 「목표 2」/「2 · 목표 2」. 4+ 를 고르면 4 로 저장되고 칩은 「4」로 보인다(스테퍼로 4.5~10 가능해 「4+」 표시를 따로 두지 않음).
3. 기록 상세: 열 머리 「RPE」 → 「RIR」(열 폭 w-12 → w-16). 적은 값은 숫자, rpe 환산은 「≈RIR n」(작은 회색 글자 · aria-label 에 원래 RPE). 둘 다 없는 종목은 열 숨김(D6 구조 그대로). **rpe 만 있는 세트를 만드는 화면 입력이 없어 「≈RIR」 경로는 e2e 로 확인 못 했다**(core effort 테스트·타입만) — P5 가져오기 e2e 에서 확인 필요.
4. EffortCard 머리 문구는 「평균 여유 1.8개 · 여유 3개 이하 64%」(스펙 예시의 「적은 세트」 대신 U-21 의 쉬운 말 「여유 3개 이하」). 둘째 줄 「적은 세트 n/m」(+RPE 환산 수). 자리는 근육 분포 카드 아래 · 최근 PR 위. 기간 일수는 StatsClient 의 SPAN 을 그대로 넘긴다(기존 화면과 같은 「지금 − N일」 기준).
5. 분포 칸은 core 규칙(올림)대로라 0.5 는 「여유 1개」 칸에 들어간다(캡처에서 1·1·0.5 → 「여유 1개 3세트」). 칸 이름이 「1개」라 0.5 가 거기 있는 것이 어색할 수 있다 — /qa 에서 칸 이름(「1개 이하」 등) 판단 필요.
6. ExerciseProgress 채움: 막대 아래쪽부터 `bg-black/35` 로 진하게, 길이 = (4 − 평균 RIR)/4(평균 0 = 가득, 4 이상 = 없음). 처음 `--color-ink` 로 했다가 다크에서 오히려 밝아져 바꿨다. 범례 「진한 부분이 길수록 그날 세트에 남은 여유가 적었어요」는 채움 있는 막대가 하나라도 있을 때만.
7. 스테퍼 라벨은 360 에서 「0.5 단 / 위」로 끊겨 「0.5 단위로」+`break-keep` 으로 줄였다. 빈 값에서 + 를 누르면 0 부터 시작한다.
8. F4: 원래 폴더 current.md·커밋 e6c3dd7 = 「재현 안 됨, 회귀 가드로만」. 이쪽 e2e 에서도 시트가 휴식 막대 위(360·390 둘 다) — 시트 쪽 추가 조치 없음.
9. 설정 스위치는 프로필 「설정」 묶음(알림음 줄 아래)에 한 줄. 이 기기에서 바꾸면 PREFS_EVENT 를 쏴 열린 운동 화면이 곧바로 따른다.
10. v25 DB 는 v25 번들을 빌드하는 대신 **v26 DB 를 v25 모양으로 걷어 내서**(새 표 3·rir·source·import_batch_id 칸·색인 제거, `_loki_schema_version`=25, 가드 키 제거) 만들었다. 실제 v25 번들이 쓴 DB 와 메타(idbVersionId 등)가 완전히 같지는 않다.

## 남은 위험·후속
- 서비스워커가 새 빌드 뒤 **클라이언트 이동 화면에 옛 청크를 내줬다**(캡처 중 /workout 에서 옛 문구, ignoreCache 새로고침 뒤 해결) — 배포 뒤 첫 열람에서 옛 화면이 잠깐 보일 수 있음(기존 동작, 이번 변경 아님).
- 낙관 표시: 고른 뒤 다른 저장이 먼저 끝나면(같은 블록 쓰기 대기열) 1.5초 폴링 한 번 동안 옛 값이 보일 수 있다(e2e 에서는 재현 안 됨).
- 슈퍼셋 안 세트 줄·유산소 줄(SetRowCardio, 칩 없음) 은 e2e 로 따로 보지 않았다.
- `/plm-hub:codescan` 은 돌리지 않았다(`@plm SRS-073/074` 주석만 달아 둠 — 원래 폴더 합치기 뒤 훅/스캔).
- 정리: 3300/3301 종료 · DB e2e_og_20261027163737 삭제 · `.media/`·`test-results/` 삭제 · 원래 폴더에 만든 임시 캡처 폴더(.og-p1-shots-tmp — chrome-devtools 저장 허용 경로가 원래 폴더뿐이라)는 옮긴 뒤 지움.
