-- @plm SRS-001  운동 카탈로그 테이블
--
-- 규칙: 재실행해도 결과가 같도록 IF NOT EXISTS 를 쓴다.
-- 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다(이미 적용한 환경이 따라오지 못한다).
-- 이 디렉터리는 sqlc가 **schema의 source of truth**으로도 읽는다(sqlc.yaml) — 정의가 두 곳에 생기지 않는다.
--
-- ── id가 uuid가 아닌 이유 ────────────────────────────────────────────────────
-- 시드 종목의 id는 name_en에서 파생한 결정적 문자열이다(`seed-<슬러그>`). 기기가 달라도 같은
-- 종목이 같은 id를 갖게 하려는 것으로, app/의 로컬 DB(WatermelonDB)가 이미 쓰는 규칙이다.
-- 여기서 uuid로 바꾸면 나중에 로컬↔서버 기록을 잇는 순간 같은 종목이 둘로 갈라진다.
--
-- ── enum을 text로 두는 이유 ──────────────────────────────────────────────────
-- 계약(proto)에서는 enum이지만 저장은 text다. Postgres enum은 값 추가가 마이그레이션을 요구해
-- 카탈로그 확장(band 축 추가 같은)마다 스키마가 흔들린다. 값의 권위는 proto가 갖고,
-- 여기서는 문자열로 받아 적는다 — app/의 로컬 스키마와도 표현이 같아 이행 중 대조가 쉽다.
--
-- ── null의 뜻(레거시 계승) ───────────────────────────────────────────────────
--   kind      null = 근력(strength)      · 'cardio'만 명시된다
--   load_mode null = 외부하중(external)  · 'assisted' | 'bodyweight'만 명시된다
-- app/이 그렇게 저장해 왔고, 그 의미를 그대로 옮긴다(읽을 때 proto enum으로 매핑).

CREATE TABLE IF NOT EXISTS exercises (
  id text PRIMARY KEY,
  -- 표시 이름. 대체운동 큐레이션이 이 이름으로 종목을 가리키고, 정렬·커서 키이기도 하다.
  name_ko text NOT NULL,
  -- 시드의 **안정 키**. 이름을 정리해 name_ko가 바뀌어도 이 값이 같으면 같은 종목이다.
  -- 커스텀 종목은 null이며, Postgres는 null을 서로 다르게 보므로 unique와 공존한다.
  name_en text,
  primary_muscles text[] NOT NULL DEFAULT '{}',
  secondary_muscles text[] NOT NULL DEFAULT '{}',
  equipment text NOT NULL,
  kind text,
  load_mode text,
  -- 대체운동 id 배열. 큐레이션 결과이므로 외래키를 걸지 않는다 —
  -- 종목이 사라져도 목록 조회가 실패하는 대신 그 항목만 비어 보이는 쪽이 낫다.
  substitute_ids text[] NOT NULL DEFAULT '{}',
  image_url text,
  is_custom boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- 커서 페이지네이션의 정렬 키 — unique여야 커서가 흔들리지 않는다.
  -- 시드 336종은 name_ko가 전부 유일하다(생성 스크립트가 매번 확인한다).
  CONSTRAINT exercises_name_ko_unique UNIQUE (name_ko),
  CONSTRAINT exercises_name_en_unique UNIQUE (name_en)
);

CREATE INDEX IF NOT EXISTS exercises_equipment_idx ON exercises (equipment);
-- 근육군 필터는 배열 포함 검사라 GIN이 필요하다.
CREATE INDEX IF NOT EXISTS exercises_primary_muscles_idx ON exercises USING gin (primary_muscles);
