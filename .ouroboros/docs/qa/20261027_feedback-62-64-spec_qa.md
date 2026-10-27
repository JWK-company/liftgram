# QA spec — 피드백 #62·#63·#64 (2026-10-27)

> 대상: `.ouroboros/docs/spec/20261027_feedback-62-64/spec.md` · SRS-084
> 참여 전문가(역할 = 이름): **오프라인 동기·데이터 무결성 검토자**(WatermelonDB·동기·배수 의미) · **화면 정리 디자이너**(색 2·글자 4단계·44px·빈 값 생략) · **테스트 엔지니어**(수정 전 실패·회귀 e2e)
> 결론: **조건부 통과** — 아래 H 1건·M 4건을 스펙에 반영하고 착수.

## 지적과 조치

| # | 등급 | 관점 | 지적 | 조치(스펙 반영) |
|---|------|------|------|----------------|
| H-1 | High | 데이터 | 적재 축이 있는 family 에 **어시스트 머신**(assisted_chin_up·assisted_dip·assisted_pull_up)과 맨몸 기준 머신(back_extension·dips 등)이 있다. 이들에 ×2 기본을 주면 `effectiveWeightKg` 가 `체중 − 보조×2` 로 계산해 볼륨·PR 이 틀어진다(보조 머신은 거의 핀 스택 카운터웨이트) | 후보 조건에 **하중 모드 external** 추가: `machine && family load 축 && resolveLoadMode(ex)==='external'`. 단위 테스트에 어시스트 제외 케이스 |
| M-1 | Mid | 데이터 | 기존 `getPlateOneSideMap` 은 행의 null 을 false 로 접는다 → 「안 정함」과 「양쪽 합」이 구분되지 않아 질문 판정이 불가 | tri-state 전용 `getPlateOneSideChoice(Map)` 추가(기존 함수 보존). `setPlateOneSide(off)` 는 행이 없으면 쓰지 않아 「양쪽 합」 답이 기억되지 않음 → `setPlateOneSideChoice` 가 false 도 행을 만든다 |
| M-2 | Mid | 데이터 | 질문 전 기본(×2)으로 체크한 세트를 「양쪽 합」 답 뒤에도 ×2 로 두면 거짓 볼륨. 반대로 기존 토글 규칙(한 세트 보존·안 한 세트 환산)을 질문 답에 쓰면 숫자가 절반·두 배로 바뀐다 | 질문 답은 **재표기(retag)** — 블록 세트 전부의 배수만 바꾸고 숫자는 그대로(Q5). 칸 시트 토글은 기존 규칙 유지. 순수 함수 `planBlockMultiplierRetag` 단위 테스트 |
| M-3 | Mid | 테스트 | `declutter-block` 「머리의 순서 화살표 0」 단언은 블록 안 `btn-move-down` 개수를 센다 → 도구 줄로 꺼내면 의도(머리에 없음)와 달리 실패 | 단언을 「세트 표 **앞**(머리)에 순서 버튼 0 · 표 **뒤** 도구 줄에 있음」으로 바꾼다. 「⋯ 메뉴의 아래로 이동」 테스트는 도구 줄 버튼으로 |
| M-4 | Mid | 테스트 | 서비스워커 동작은 운영 빌드에서만 켜지고(NODE_ENV) 진짜 새 버전을 두 번 빌드해 재현하기 어렵다 | e2e 는 `addInitScript` 로 `navigator.serviceWorker.register`(가짜 registration — waiting.postMessage 기록)·`controller`(non-null) 를 대체해 판정만 잰다. 판정은 순수 함수로 빼 core 단위 테스트(경로·진행 중·waiting 조합, controllerchange 3갈래) |
| L-1 | Low | 디자인 | 도구 줄이 블록마다 44px 를 더해 페이지가 길어진다 | 머리(첫 세트까지)는 불변 — 화면 정리 측정(≤170·≤320)을 그대로 통과해야 한다. 블록 전체 높이 전후를 보고서에 기록 |
| L-2 | Low | 디자인 | 질문 줄의 「선택됨」을 `QuietChip active`(브랜드 테두리)로 그리면 「표 아래 빨강 0」 규칙(declutter-block)과 충돌 | 선택 표시는 체크 아이콘 + 진한 글자(ink)로, 빨강 없음 |
| L-3 | Low | 디자인 | 메모 미리보기가 길면 도구 줄이 꺾인다 | 미리보기는 첫 줄·말줄임(`truncate`·`min-w-0 flex-1`), 아이콘은 줄지 않게 |
| L-4 | Low | 데이터 | 진행 중 운동이 배포 시점에 있으면 그 블록 세트는 옛 null — 열 때 자동으로 바꾸면 사람이 적은 숫자의 뜻을 바꾼다 | 자동 재표기하지 않는다. 질문이 보이므로 답하면 맞춰진다(R6) |
| L-5 | Low | 테스트 | 「미답 완료 → 다음에 안 물음」은 완료 처리의 쓰기 순서에 기댄다 | `settleUndecidedPlateOneSide` 를 완료 flush 전에 await · e2e 로 다음 운동에 `plate-ask` 0 확인 |

## 그대로 둔 것(근거)
- `/workout` 밖의 입력 중 화면(루틴 편집·글쓰기) 자동 적용 보류는 범위 밖(R5) — 루틴 편집은 바꿀 때마다 저장한다.
- 첫 세션 PR 축하 폭증(R1)은 소급 없음 결정의 대가 — 억제 규칙은 판정 경로를 바꾸므로 이번엔 하지 않고 사용자에게 알린다.
