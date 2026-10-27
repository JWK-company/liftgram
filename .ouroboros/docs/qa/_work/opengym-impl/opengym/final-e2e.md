<!-- 2026-10-27 작업 폴더 정리 사고로 원본 파일이 지워져, 에이전트 실행 기록(Write·Edit)에서 되살린 사본 -->
# v0.42.0 배포 직전 e2e 최종 확인 (2026-10-27)

- 대상: worktree `/Users/woobi/Desktop/tarae/liftgram-wt-opengym` · 브랜치 `feat/opengym-recs` · HEAD `577a100`(v0.42.0, b5ab38f v0.41.3 위 rebase)
- 환경: 운영 빌드(`bun run build` EXIT 0 · sw 미리 받기 104개) · 웹 3300 · API 3301 · DB `e2e_og_final_10271844`(docker liftgram-db-1, 마이그레이션 19/19 적용) · Redis 6381 · Mailpit 1026 · `AUTH_RATE_LIMIT=0`
- 3100·3400·3401·원래 폴더는 건드리지 않음. 코드 수정 없음.

## 1. 지정 묶음 (90건, 5.8분)
opengym-qa1 · opengym-rir · prefs-race · home-primary · routines · session · workout · analytics · profile · sync · data-safety · offline · declutter-*

- **85 통과 · 0 실패 · 5 건너뜀**
- 건너뜀 5 = `declutter-shots.spec.ts`(`DECLUTTER_SHOTS` 환경 변수가 없으면 건너뛰는 캡처 전용 spec). 정상.
- stats 전용 spec은 없다. 분석 화면은 analytics.spec.ts와 opengym-rir/qa1의 `/stats` 검증으로 확인함.

## 2. 지난번 흔들리던 자리 반복 (24건)
- `opengym-rir.spec.ts:273` 좌표(360·390) + `prefs-race.spec.ts` 4건을 `--repeat-each=4`로 실행 → **24/24 통과**
- release1-verify에서는 :273이 약 50% 실패했다. 이번에는 0/8 실패다. a824115(키별 쓰기 대기 표식)로 경합이 고쳐진 것으로 판단한다.

## 3. 전체 e2e 1회 (215건, 6.9분)
- **202 통과 · 1 실패 · 12 건너뜀**
- 실패 1 = `dm.spec.ts:157` 알림(`feed-notifications` 클릭이 30초 안에 끝나지 않음). 단독으로 다시 돌려도 같은 자리에서 실패한다. 이전 보고서들과 같은 **기존 환경 실패**이고 이번 변경과는 무관하다.
- 건너뜀 12 = 환경 게이트(OAuth 4 · declutter-shots 5 · 피드백 내부자 1 · 제휴 링크 1 · 모더레이션 검토자 1). 지난번과 같다.
- flake: 없음.

## 4. 캡처 — `.ouroboros-work/shots/final/` (360×640 · 라이트 · 2x)
데이터: 벤치프레스 운동 1회(60×10 RIR 3 · 70×8 RIR 1) 완료 + 진행 중 운동(1세트 완료, RIR 2)

| 파일 | 내용 | 판정 |
|---|---|---|
| home-360x640-light.png | 운동 탭: 주간 목표 1/3 · PR 2, 루틴 없음 → 「빠른 운동 시작」 빨강 주 행동, 내 루틴 빈 상태, 최근 운동 | 정상 |
| workout-rir-on-360x640-light.png | 세트 줄 RIR 켬: 완료 세트 칩 「2」, 다음 세트 「힘든 정도」 칩이 둘째 줄에, 휴식 막대 | 겹침·잘림 없음. 종목명은 「바벨 벤치프…」로 줄여 보임(기존 동작) |
| stats-360x640-light.png | 분석 첫 화면: 7일 볼륨 1160kg · 세션 1/워킹 2 · 추정 1RM 88.5kg | 정상 |
| stats-effort-360x640-light.png | 근육군 분포 · 세트 힘든 정도 카드(「평균 여유 2개 · 여유 3개 이하 100%」, 기록한 세트 2/2, 구간 막대) | 정상 |

## 5. 정리
- 3300·3301 종료 · DB `e2e_og_final_10271844` 삭제 · 임시 캡처 spec 삭제 · `.media/`·`src/frontend/test-results/` 삭제 · `next-env.d.ts` 원복
- 남은 미추적 파일: `.ouroboros-work/`, `lefthook.yml`(작업 전부터 있었음)

## 배포 판단
**배포 가능.** 지정 묶음은 모두 통과했다. 지난번 유일하게 남았던 RIR 끄기 경합도 8회 반복에서 재현되지 않았다. 전체 실행에서 실패한 것은 기존 환경 실패인 dm:157 하나뿐이다.
