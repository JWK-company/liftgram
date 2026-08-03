-- @plm SRS-001  스키마 정의에서 유도되지 않는 것 — 사람이 쓰는 마이그레이션
--
-- 테이블·컬럼은 0000_init.sql이 만든다.
-- 확장 설치·초기 데이터·데이터 이관처럼 **스키마 정의에서 유도되지 않는 것**은 이렇게 손으로 쓴다.
--
-- 규칙: 재실행해도 결과가 같도록 IF NOT EXISTS · ON CONFLICT 를 쓴다.
--
-- 카탈로그 시드(336종) 자체는 사람이 쓰지 않는다 — 0002_seed_exercises.sql이 생성물이다
-- (원본은 app/의 TypeScript 시드 · make gen-exercise-seed).

-- 임베딩 기반 종목 검색(비슷한 동작 찾기 등)을 나중에 켤 수 있게 열어 둔다.
-- db 이미지가 pgvector라 설치 비용이 없고, 필요해질 때 마이그레이션을 하나 아낀다.
CREATE EXTENSION IF NOT EXISTS vector;
