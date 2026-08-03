-- @plm SRS-019  미디어 자산 — 올라간 파일의 **메타**만 여기 있다
--
-- 바이트는 저장소(로컬 디스크 또는 R2)에 있고, 이 표는 "누가 무엇을 올렸는가"와
-- "그 파일을 서브해도 되는가"를 답한다. 컬럼 이름·의미를 옛 Prisma MediaAsset과 맞췄다 —
-- 전환 시점에 이미 올라간 사진의 메타를 그대로 옮기기 위해서다.
--
-- ── key와 url을 둘 다 두는 이유 ─────────────────────────────────────────────
-- key = 저장소 안의 이름. url = 브라우저가 쓰는 주소(`/media/file/<key>`).
-- 지금은 url이 key에서 결정되지만, 나중에 CDN을 앞에 두면 url만 절대주소로 바뀐다.
-- 그때 이미 올라간 글의 본문을 고치지 않으려고 **주소를 값으로 저장한다.**
--
-- ── flagged ─────────────────────────────────────────────────────────────────
-- 자동 스캔이 위반으로 본 파일. 이 표시가 서 있으면 바이트도 서브하지 않는다(404) —
-- "내려갔다"는 말이 참이려면 파일도 안 보여야 한다(ADR-017).

CREATE TABLE IF NOT EXISTS media_assets (
  id           text        PRIMARY KEY,
  owner_id     text        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 저장소 안의 이름. 무작위라 주소를 아는 것이 곧 권한이다(capability URL).
  key          text        NOT NULL UNIQUE,
  url          text        NOT NULL,
  content_type text        NOT NULL,
  -- image | video(후속)
  kind         text        NOT NULL DEFAULT 'image',
  bytes        bigint      NOT NULL DEFAULT 0,
  flagged      boolean     NOT NULL DEFAULT false,
  flag_reason  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- "내가 올린 것"을 훑는 방향(용량 정리·소유자 확인).
CREATE INDEX IF NOT EXISTS media_assets_owner_idx ON media_assets (owner_id, created_at DESC);
