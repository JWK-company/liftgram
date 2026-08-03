-- @plm SRS-006  오프라인 동기 저장소 (ADR-002 · SAD-004)
--
-- 옛 서버의 SyncRecord와 **같은 모양**이다 — 앱이 보내는 레코드가 달라지지 않아야 하기 때문이다.
--
-- 서버는 payload의 속을 해석하지 않는다(스키마 권위 = 클라이언트). 그래도 `jsonb`로 두는 이유는
-- 나중에 **읽어야 할 사람**이 있기 때문이다: 트레이너가 회원 리포트를 볼 때 서버가 이 안을 집계한다.
-- text로 두면 그때 전부 파싱해야 한다.
--
-- 삭제는 행을 지우지 않고 표시만 한다 — 지우면 "없다"와 "지웠다"를 구분할 수 없어
-- 다른 기기가 그 레코드를 되살린다.
CREATE TABLE IF NOT EXISTS sync_records (
  id          text        PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 클라이언트 테이블 이름(exercises·routines·workouts…). 서버는 목록을 알지 못한다.
  collection  text        NOT NULL,
  -- 클라이언트가 만든 레코드 id. 서버가 새로 만들지 않는다 — 오프라인에서 이미 정해진 값이다.
  record_id   text        NOT NULL,
  payload     jsonb       NOT NULL,
  deleted     boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- 한 사람의 한 테이블에서 같은 레코드는 하나뿐이다. 이 제약이 곧 upsert의 기준이다.
  UNIQUE (user_id, collection, record_id)
);

-- pull이 하는 질문 그대로: "이 사람 것 중에 이 시각 뒤로 바뀐 것".
CREATE INDEX IF NOT EXISTS sync_records_user_updated_idx
  ON sync_records (user_id, updated_at);
