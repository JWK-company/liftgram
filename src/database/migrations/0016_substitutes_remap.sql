-- @plm SRS-055  대체 운동 참조 정리 — 0002 시절의 substitute_ids 가 0014 에서 보관(통합)된 종목을 가리키지 않게
--
-- 0014 는 merge/delete 종목을 보관(is_archived)만 하고 다른 종목의 substitute_ids 는 손대지 않았다. 그래서 상세의
-- 「대체 운동」에 보관 종목(예: 로프 푸시다운)이 뜨거나 404 로 빠졌다. 보관 id 는 통합 대상으로 바꾸고,
-- 자기 자신·중복·없는/보관 종목은 뺀다. 원래 순서(큐레이션 랭킹)는 유지한다.
-- 멱등: 이미 정리된 행은 IS DISTINCT FROM 에 걸리지 않아 updated_at 도 그대로다.
-- 매핑 = 마스터 표의 보관 행(status merge·delete → merge_into) — core/src/data/catalog/catalog.master.csv

WITH m(src, dst) AS (
  VALUES
    ('seed-close-grip-pulldown', 'seed-lat-pulldown'),
    ('seed-military-press', 'seed-overhead-press'),
    ('seed-rope-pushdown', 'seed-triceps-pushdown'),
    ('seed-high-bar-squat', 'seed-barbell-squat'),
    ('seed-leg-curl', 'seed-lying-leg-curl'),
    ('seed-single-arm-lat-pulldown', 'seed-lat-pulldown'),
    ('seed-hammer-strength-chest-press', 'seed-chest-press-machine'),
    ('seed-converging-chest-press-machine', 'seed-chest-press-machine'),
    ('seed-single-arm-chest-press-machine', 'seed-chest-press-machine'),
    ('seed-wide-grip-push-up', 'seed-push-up'),
    ('seed-reverse-grip-pushdown', 'seed-triceps-pushdown')
),
fixed AS (
  SELECT e.id,
    COALESCE((
      SELECT array_agg(t.nid ORDER BY t.ord)
      FROM (
        SELECT DISTINCT ON (u.nid) u.nid, u.ord
        FROM (
          SELECT COALESCE(m.dst, s.sid) AS nid, s.ord
          FROM unnest(e.substitute_ids) WITH ORDINALITY AS s(sid, ord)
          LEFT JOIN m ON m.src = s.sid
        ) u
        WHERE u.nid <> e.id
          AND EXISTS (SELECT 1 FROM exercises x WHERE x.id = u.nid AND NOT x.is_archived)
        ORDER BY u.nid, u.ord
      ) t
    ), '{}') AS subs
  FROM exercises e
)
UPDATE exercises e
SET substitute_ids = f.subs, updated_at = now()
FROM fixed f
WHERE f.id = e.id AND e.substitute_ids IS DISTINCT FROM f.subs;
