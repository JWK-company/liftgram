# 운동 영상 제작 도구(SPEC-034)

앱 코드에서 import 하지 않는 별도 도구다. MPFB(GPL-3.0-or-later) 코드를 쓰므로 이 폴더는 **GPL-3.0-or-later** 로 공개한다(전문 `src/scripts/motion/COPYING`).
자산은 MPFB 기본 자산(CC0)만 쓴다. 유료 에셋·타사 앱 캡처는 입력으로 쓰지 않는다(ADR-058).

순서: `export-specs.ts`(카탈로그 → 자세) → `grades.py`(제작 목록·제외 사유) → `build_base.py`(사람 모델) →
`render_queue.py` + `motion3d.py`(Blender N·마스크) → `refine.py`(Wan 2.2) → `composite.py`(합성·인코딩·지표) →
`qc.py`(판정) · `make_sheet.py`(눈 검수) → `gen-map.py`(앱 표 `src/core/src/data/exerciseMotion.data.ts`).

- 원형별 값 조정: `overrides.json`(키 = 원형, 원형__기구, 전체 키).
- 재시작: 단계마다 입력 지문(`.done`·`info.json`)이 같고 파일 수가 맞을 때만 건너뛴다. 조정값·프롬프트가 바뀐 클립은 자동으로 다시 만든다. 코드를 고쳤는데 일부 클립만 영향이면 `render_queue.py` `--loose-code`. 실패는 `failed.txt`, 종료 코드 1.
- 사전 점검: `render_queue.py <keys> <출력> 25 1 64 --probe` 로 렌더 없이(CPU) 전 클립 지표를 뽑아 `qc.py` 로 본다.
- 왕복 재생만 지원한다. 탄도·순환·이동 동작은 `grades.py` 에서 제외한다.
- ffmpeg 는 `MOTION_FFMPEG` 또는 PATH 에서 찾는다.
- 서버 준비물: `~/liftgram_motion/` 의 Blender 4.5.15, `bl_user/`(MPFB 2.0.18), `base.blend`, ComfyUI + Wan 2.2 TI2V-5B.
- 영상은 git 에 넣지 않는다. `release/`(추가 전용) → 배포 스크립트가 `frontend/public/motion/` 로 복사한다.
