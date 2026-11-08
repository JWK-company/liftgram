# 운동 모션 2판 (SPEC-040)

앱의 운동 영상을 만드는 별도 도구다. 앱 코드에서 import 하지 않는다. MPFB(GPL-3.0-or-later)로 만든 리그를 쓰므로 이 폴더는 **GPL-3.0-or-later** 다(전문 `src/scripts/motion2/COPYING`). 자산은 MPFB 기본 자산(CC0)만 쓴다. 유료 에셋·타사 앱 캡처·유튜브 영상은 입력으로 쓰지 않는다.

## 흐름
1. `src/scripts/motion2/build_catalog.py` 제작 목록 → `src/scripts/motion2/catalog.json`(묶음·고정점·구동·계산식·선언 관절각).
2. `src/scripts/motion2/run.py` 뼈대 검사(CPU) → 렌더(`src/scripts/motion2/render.py`) → Wan(`src/scripts/motion2/wan_profile.json`) → 합성(`src/scripts/motion2/comp.py`). 세 단계 지문이 같으면 건너뛴다.
3. 사람이 컨펌하면 `src/scripts/motion2/confirmed.json` 에 `{키: {sha8, 판, 답}}` 을 적는다.
4. `src/scripts/motion2/publish.py` `export`(서버 release, 추가 전용) → `merge`(맥, 운영 표와 보류 목록).

## 자극 부위 칠하기
컨펌된 합격본에 색만 입힌다(Wan 다시 안 돌림, CPU).
1. `src/scripts/motion2/muscle_table.py` 앱 종목 표의 주동근·보조근 → `src/scripts/motion2/muscles.json`.
2. `src/scripts/motion2/muscle.py`(Blender) 같은 자세로 부위 마스크 → 합성 프레임 위에 `src/scripts/motion2/tint.py`(주동근 빨강·보조근 옅은 빨강, 명암 유지).
3. `src/scripts/motion2/tint_pack.py` 원본 해시·합격을 확인한 뒤 칠한 판 묶음과 새 컨펌 기록(sha8 교체, 검사 기록에 원본 `tint_of`)을 만든다 → 그 묶음으로 `publish.py export`·`merge`.

## 규칙
- 몸만 Wan 을 쓰고 머리·손·신발·옷은 Blender 그대로다. Wan 은 옷에 줄무늬를, 신발에 무늬를 그려 넣는다.
- 표는 `src/scripts/motion2/publish.py` 로만 고친다. 옛 `src/scripts/motion/gen-map.py` 는 막아 두었다.
- 서버 GPU 는 공유한다. 워커는 다른 프로세스가 보이면 멈추고, 끝나면 자기가 띄운 ComfyUI 만 끈다.

## 시험
- `python3 src/scripts/motion2/test_publish.py`, `python3 src/scripts/motion2/test_run.py`(맥·서버)
- `python3 src/scripts/motion2/test_check.py <catalog> <키> <joints.json>`(고의로 망친 표본)
