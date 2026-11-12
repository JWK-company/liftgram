-- 이달의 리프터(SPEC-063 · SRS-117) — 월간 시상·쿠폰 전달.
--
-- award_months: 달마다 한 행. 그 달 화면을 처음 열 때 서버가 씨앗(난수)을 만들고 해시만 공개한다(커밋-공개 · REV-153).
--   확정하면 status 가 announced 가 되고 씨앗 원문을 공개한다. 확정 전에는 awards 행이 없다(미리보기는 계산만).
-- awards: 수상 한 건 = 쿠폰 한 장. 한 사람은 한 달에 상 하나(UNIQUE(month, user_id)).
--   탈퇴하면 user_id 가 NULL 이 되고 「탈퇴한 수상자」로 보인다(지급 기록은 남는다 · REV-153).
--   쿠폰 번호에 UNIQUE 를 걸지 않는다 — 제약 위반 오류 상세에 번호가 찍혀 로그에 남지 않게.
CREATE TABLE IF NOT EXISTS award_months (
  month            text        PRIMARY KEY CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  seed             text        NOT NULL,
  seed_hash        text        NOT NULL,
  status           text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'announced')),
  candidates_hash  text,
  announced_at     timestamptz,
  announced_by     text        REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS awards (
  id              text        PRIMARY KEY,
  month           text        NOT NULL REFERENCES award_months(month),
  category        text        NOT NULL CHECK (category IN ('steady', 'popular', 'pick')),
  user_id         text        REFERENCES users(id) ON DELETE SET NULL,
  rank            integer     NOT NULL DEFAULT 1,
  reason          text,
  days            integer,
  likes           integer,
  public          boolean     NOT NULL DEFAULT true,
  coupon_code     text,
  coupon_item     text,
  coupon_expires  date,
  coupon_set_by   text        REFERENCES users(id) ON DELETE SET NULL,
  coupon_set_at   timestamptz,
  claimed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, user_id),
  UNIQUE (month, category, rank)
);

CREATE INDEX IF NOT EXISTS awards_user_idx ON awards (user_id);

-- 인정 좋아요 집계는 그 달에 눌린 좋아요만 읽는다.
CREATE INDEX IF NOT EXISTS post_likes_created_idx ON post_likes (created_at);

-- 내 현황(한 사람의 그 달 운동)은 사람부터 찾는다 — 통계 인덱스(created_at, user_id)는 그 달 모든 사람을 훑는다(REV-154).
CREATE INDEX IF NOT EXISTS sync_records_user_workouts_idx
  ON sync_records (user_id, created_at) WHERE collection = 'workouts' AND deleted = false;
