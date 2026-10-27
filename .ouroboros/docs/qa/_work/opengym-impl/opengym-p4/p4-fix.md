# openGym P4 /qa code 조치 — 결과 보고 (2026-10-27)

- worktree `/Users/woobi/Desktop/tarae/liftgram-wt-opengym-p4` · 브랜치 `feat/opengym-p4` · 커밋 **`90af052`**(20fc3b0 위) · 미배포 · push·merge 안 함
- 본인 파일 19개만 add 했다(`.ouroboros-work/`·`lefthook.yml` 은 커밋하지 않음). **서버 Go·proto·DB·로컬 스키마·공용 ui 변경 0**. AuthProvider 도 건드리지 않았다(세션 감시는 대기열 모듈 안에 넣었다).

## 지적별 조치

### 보안(P4S)
| ID | 조치 |
|---|---|
| **P4S-1 / P4U-1(필수)** | `buildPeriodSummary` 가 **늘 체중 없이** 계산한다. `input.bodyweightKg` 는 읽지 않는다([원본] 주석 보존). 맨몸은 추가 무게만, 보조는 입력 무게 그대로이고, 이는 트레이너 리포트와 같은 규칙이다. **총 볼륨도** 수행 세트를 체중 없이 다시 센 합으로 바꿨다. `total_volume_kg` 캐시에는 완료 때 체중이 실려 있어서다. 세트가 하나도 없는 운동만 캐시로 메운다. 저장소는 `getUserBodyweightKg` 호출을 주석으로 막았다. 보조 종목은 체중 없이는 「기록」 방향이 거꾸로라 새 기록 목록에서 뺀다. 화면에는 「맨몸 종목은 추가 무게만 셉니다」 한 줄(`ps-bw-free`)을 넣었다 |
| P4S-2 | core `deviceOwnerMatches(userId)` 를 추가했다(syncOwner · 읽기 전용). 주인 표시·멈춤 깃발을 저장소에서 직접 읽고, 판정 전이나 저장소가 없으면 false 다. 이 판정으로 ① 보내기 버튼(`ownerOk === true` 일 때만 켬 · 2초마다·online 때 다시 읽음 · false 면 「다른 계정 기록」 안내) ② `sendSummary`(새 이유 `owner` · 쌓지 않음) ③ `runFlush`(항목마다 · 남겨 두고 멈춤) 세 곳을 막는다 |
| P4S-3 | 대기열 모듈이 `onSessionChange` 와 다른 탭의 `storage`(liftgram.session) 이벤트를 듣는다. 세션이 없어지면 `stopSummaryOutbox`(전부 지움)를 부른다. 로그인 결과가 blocked 일 때는 `pruneSummaryOutboxesFor(userId)` 로 지금 사람 것만 남기고, 보내기는 시작하지 않는다(syncTransport · [원본] 주석) |
| P4S-4 | 대기 항목에 만든 시점의 `grantId`·`consentAt` 을 적는다(CoachRef 에도). 재전송 때 listGrants 로 지금 관계와 비교해 다르면(해지 뒤 재계약 포함) 「못 보냄 · 코칭 중인 관계가 아니에요」로 옮긴다. 관계를 못 읽으면(망) 다음 방아쇠로 미룬다. 옛 항목처럼 기준이 없으면 서버 검사에 맡긴다 |
| (추가로 찾음) | e2e 가 잡은 경쟁이다. 재전송이 기다리는(owner·listGrants) 사이에 로그아웃하면, 세션 없이 A 의 항목을 보냈다(서버 `unauthenticated` 1건). 그래서 보내기 직전에 `currentUser·hasSession·항목이 아직 대기열에 있는지` 를 다시 본다. 기다린 뒤 지운 대기열을 다시 쓰지 않게 쓰기마다 사용자도 확인한다 |

### 화면(P4U)
| ID | 조치 |
|---|---|
| P4U-2 | 체중 섹션만 `bodyweightUnitOf(unit)` 로 그린다(kg 고정 · SRS-067). 무게·볼륨은 보는 사람 단위 그대로다 |
| P4U-3 | 목록을 만들 때(회원)는 `prCount` 가 목록 전체 개수(50개로 자르기 전)다. 머리 줄도 목록 개수를 쓰고, 50개로 잘렸을 때만 「새 기록 n개 · 최근 50개만 보여요」로 보인다. 트레이너는 계속 캐시 `pr_count` 합이다(아래 「남은 것」) |
| P4U-4 | **안내**로 판단했다(기준 통일은 트레이너 일치 ADR-040 비용이 크다). 회원에게는 기간 줄 아래 「운동 시작 날짜 기준 · 통계 화면과 다를 수 있어요」, 받는 쪽·트레이너에게는 「운동 시작 날짜 기준」(`ps-basis`)을 보인다 |
| P4U-5 · P4U-18 | `/stats/summary` 를 sw.template.js `SHELLS` 와 `shellCache.SW_SHELLS` 에 넣었다(대조 테스트 통과 · 그 줄에 `biome-ignore format` — 테스트가 한 줄 JSON 으로 읽는다). 코치 목록을 한 번도 받아 본 적 없는 기기(readOutbox().coaches === null)가 오프라인이면 「연결되면 코치를 불러와요」(`ps-coach-unknown`)와 다시 시도 버튼을 보이고 보내기는 없다 |
| P4U-6 | 영구 실패가 있으면 보내기 버튼 아래(접힌 목록 밖)에 「못 보낸 요약 n · 이유 보기」(누르면 목록을 편다 · 44px)를 보인다. 백그라운드에서 실패가 늘면 toast 「못 보낸 요약이 있어요」를 한 번 띄운다. 토글 라벨은 「보낸 요약 n · 대기 m · 못 보냄 k」다 |
| P4U-7 | 「많이 한 종목」의 처음→끝을 value 에서 부제 둘째 줄로 옮겼다(`wrapSubtitle` · `ps-top-change`). 360 리포트 Panel 에서 종목 이름 칸은 246px(390: 276px)이다 |
| P4U-8 | 두 시트 제목을 `h2 tabIndex=-1` 로 만들고 열 때 포커스를 준다. 닫을 때·보낸 뒤에는 `ps-send` / `ps-period-custom` 으로 포커스를 돌려준다. e2e 에서 activeElement 로 확인했다 |
| P4U-9 | 코치 이름 기억을 누적 합치기(id→이름 · 20개)로 바꿨다. 모르는 코치는 「?」 대신 「이전 코치」로 보인다 |
| P4U-10 | radiogroup 을 `fieldset aria-label="받을 코치"` 로 바꿨다(biome a11y 권장 · 칩은 aria-pressed 그대로). 칩 줄 간격은 xs → sm(8px)이다 |
| P4U-11 | 입구 `min-h-[44px]`. QuietChip(공용)은 손대지 않았다 |
| P4U-12 | SummaryBubble 이 부모의 「맨 아래로」 뒤(rAF 두 번)에 한 번 더 굴린다([원본] 주석) |
| P4U-13 | 트레이너 리포트 이름을 `getExerciseDisplayNameMap(ids)` 로 바꿨다(받은 카드와 같은 함수) |
| P4U-14 | SummaryOpen: `Code.Unknown` 은 더 이상 오프라인으로 보지 않는다. 오프라인은 `navigator.onLine === false` 이거나 Unavailable 일 때만이고, 나머지는 「다시 시도」다. 리포트 error 상태에도 「다시 시도」(`report-retry`)를 넣었다 |
| P4U-15 | en 문구를 라벨형으로 바꿨다: 「New records: n」 「Weigh-ins: n」 「Sets n · Sessions n」 |
| P4U-16 | 「다음 처방 판단은 코치가 합니다」는 회원 본인(viewer=member)에게만 보인다. 코치에게는 「기록을 그대로 모은 숫자예요.」(`ps-factonly`). ko 문구는 「부위별은 이제 볼륨(kg) 대신 세트 수로 보여요」로 고쳤다 |
| P4U-17 | e2e 표본에 맨몸 풀업(체중 72.5 · 0kg×10)을 넣었다. 스냅샷 전체(요청 본문과 서버 저장본)의 **숫자 값**에 72.5·725·1325 가 없는지 확인한다(시각 ms 우연 일치를 피하려고 문자열이 아니라 값으로 비교). 포커스 검사, 오프라인 첫 진입, 영구 실패 표시(toast·라벨·Fold 밖), 오프라인으로 연 기기의 주인 멈춤(대기 항목이 나가지 않음)을 추가했다. coaching.spec 은 `ps-factonly` testid 로 바꿨다. 덧붙여 P3 뒤 낡은 `체중_입력`(bodyweight-input)을 체중 기록 시트 경로로 고쳤다 |

## 검증
| 항목 | 결과 |
|---|---|
| `bun run test:core` | **482/482**(+1: 맨몸·보조 표본 직렬화에 체중 값 없음 · 트레이너와 같은 숫자) · 기대값 갱신 3건(볼륨 = 체중 없이 다시 셈 · PR 수 = 목록 개수 · 맨몸 최고 세트 회원 = 트레이너) |
| tsc frontend·core · biome | 0 오류(경고 3 은 기존 것) |
| `make verify` | **EXIT 0**(go build/vet/test 포함 — Go 는 바꾸지 않음) |
| 3600/3601 운영 빌드 e2e `opengym-summary` | **6/6**(기존 4 + 새 2) |
| coaching·dm·analytics·sync·data-safety·offline·opengym-* 묶음 | 222 통과 · 실패 2: `local-db`(/diag/db 시드 중복 `seed-walking` — 단독 실행 통과 · 반복하면 2번 중 1번 실패 · 요약과 무관한 진단 화면, **기준 커밋에서 따로 재현하지는 않았다**) · `sync:234`(로그아웃 클릭이 먹지 않음 — 단독 2회 반복 통과 · 플레이크). 첫 묶음 실행에서 잡힌 `opengym-summary` A→B 실패는 위 경쟁 수정 뒤 통과. 마지막 빌드로 다시 돌린 opengym-summary·coaching·dm 은 16 통과, `dm:157` 1건은 이 환경의 알려진 실패(메일) |
| 캡처 `.ouroboros-work/shots/p4-fix/` | `{summary(전체),send-sheet,report,dm-open}-{360,390}-{light,dark}.png` 16장 |

## 남은 것 · 주의
- **새 기록 개수 차이**: 트레이너 리포트는 기준선 이력이 없어 캐시 `pr_count` 합이다. 회원·받은 요약은 체중 없이 다시 센 목록 개수다. 맨몸 종목이 있으면 다를 수 있다(캡처 표본: 회원 2개 · 리포트 4개 — 캐시는 완료 때 체중 72.5 로 풀업 PR 을 셌다). 세트 숫자·총 볼륨·부위별은 같다.
- **총 볼륨 정의가 바뀌었다**(체중 없이 다시 셈). 맨몸 종목이 있으면 운동 완료 요약·통계 카드(체중 포함)와 다르다 → 「통계 화면과 다를 수 있어요」 안내로 덮었다. 스펙·SRS-079 수용 기준에 「요약은 체중 없이 계산」을 적어야 한다(원래 폴더 소관).
- 보조 종목은 새 기록 목록에서 빠진다. 많이 한 종목에는 입력(보조) 무게 그대로 보인다(트레이너와 같은 규칙).
- 1년 표본 e2e 가 `.ouroboros-work/p4-measure.json` 을 새 측정으로 덮어썼다(커밋 대상 아님).
- `current.md`·`state.json`·SRS 문서는 원래 폴더 소관이라 갱신하지 않았다.
- 병합 주의(다른 단계도 만지는 파일): `ko.ts`·`en.ts`·`syncTransport.ts`·`sw.template.js`·`shellCache.ts`·`syncOwner.ts`.

## 정리
3600·3601 종료 · DB `e2e_og_p4fix_10272100` 삭제(남은 `e2e_og_p4fix_%` 0) · `.media/`·`test-results/` 삭제 · `next-env.d.ts` 원복 · 임시 캡처 spec 삭제.
