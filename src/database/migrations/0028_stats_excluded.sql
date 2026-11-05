-- 운영자 통계(SPEC-032 Phase 2) — 지인·시험 계정을 통계에서 뺀다, 동기 기록 집계용 부분 인덱스.
-- 값은 운영자가 DB에서 직접 켠다. 일 집계는 소급하지 않는다(최근 7일 재계산 범위 밖).
ALTER TABLE users ADD COLUMN IF NOT EXISTS stats_excluded boolean NOT NULL DEFAULT false;
