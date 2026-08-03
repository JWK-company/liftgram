-- @plm SRS-001  운동 카탈로그 쿼리 — 여기 있는 것은 SQL뿐이다
--
-- 규칙(무엇이 허용되는가)은 internal/exercise/service.go가 안다.
-- 예외는 저장소가 더 잘하는 것뿐이다 — 필터·정렬·페이지네이션이 그렇다(336종을 다 읽어
-- Go에서 거르면 카탈로그가 커질수록 느려진다).

-- name: GetExerciseByID :one
SELECT * FROM exercises WHERE id = $1 AND is_archived = false;

-- 목록 — 커서 페이지네이션 + 선택 필터 3종.
--
-- 커서: 정렬 키(name_ko)가 unique여야 커서가 흔들리지 않는다. 시드 336종의 name_ko가
--       전부 유일함을 생성 스크립트가 매번 확인하고, 테이블에도 UNIQUE 제약이 있다.
--
-- 검색: LIKE 대신 position()을 쓴다. 사용자가 친 '%'가 와일드카드로 해석되면
--       "전부 일치"가 되어 검색이 조용히 무의미해진다.
--
-- 빈 문자열 = 필터 없음. 삼항 조건을 SQL 한 곳에 모아 Go에서 쿼리를 조립하지 않는다
--       (조립을 시작하면 SQL이 두 곳에 생긴다).
-- name: ListExercisesAfter :many
SELECT id, name_ko, name_en, equipment, primary_muscles, kind, is_custom
FROM exercises
WHERE is_archived = false
  AND (@cursor::text = '' OR name_ko > @cursor::text)
  AND (
    @q::text = ''
    OR position(lower(@q::text) in lower(name_ko)) > 0
    OR position(lower(@q::text) in lower(coalesce(name_en, ''))) > 0
  )
  AND (@equipment::text = '' OR equipment = @equipment::text)
  AND (@muscle::text = '' OR primary_muscles @> ARRAY[@muscle::text])
ORDER BY name_ko
LIMIT @lim;

-- 배포용 전량 조회 — 화면 목록과 달리 **행 전부**를 준다(로컬 저장소를 세우려면 전부 필요하다).
-- 정렬 키는 목록과 같은 name_ko(unique)라 커서가 흔들리지 않는다.
-- name: PullCatalogAfter :many
SELECT * FROM exercises
WHERE is_archived = false
  AND (@cursor::text = '' OR name_ko > @cursor::text)
ORDER BY name_ko
LIMIT @lim;

-- 커스텀 종목 생성. id는 서버가 만든다(시드의 결정적 id와 섞이지 않게).
-- name_ko가 이미 있으면 unique 제약이 거절한다 — service가 그 오류를 도메인 오류로 옮긴다.
-- name: CreateCustomExercise :one
INSERT INTO exercises (id, name_ko, primary_muscles, secondary_muscles, equipment, kind, load_mode, is_custom)
VALUES (@id, @name_ko, @primary_muscles, @secondary_muscles, @equipment, @kind, @load_mode, true)
RETURNING *;

-- 보관 — 지우지 않고 감춘다. is_custom 조건이 SQL 안에 있는 이유는 규칙이 아니라
-- **경합 방지**다(판정과 갱신 사이에 끼어들 틈을 없앤다). 규칙 자체는 service가 먼저 확인한다.
-- 갱신된 행이 0이면 없거나 시드다.
-- name: ArchiveCustomExercise :execrows
UPDATE exercises SET is_archived = true, updated_at = now()
WHERE id = $1 AND is_custom = true AND is_archived = false;

-- 카탈로그의 개정 번호 — 구독자가 "다시 읽어야 하는가"를 판단하는 한 줄.
-- 목록 전체를 비교하지 않으려고 둔다.
-- name: GetCatalogRevision :one
-- 명시적 캐스트가 필요하다 — coalesce의 결과 타입을 sqlc가 유추하지 못해
-- Go 쪽이 interface{}로 생성된다(그러면 시각을 꺼낼 수 없다).
SELECT count(*)::bigint AS count,
       coalesce(max(updated_at), to_timestamp(0))::timestamptz AS updated_at
FROM exercises
WHERE is_archived = false;
