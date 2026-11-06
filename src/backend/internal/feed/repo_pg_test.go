// 추천 쿼리 실 DB 시험(SPEC-030). 제외 조건은 SQL 에 있어 가짜 저장소로는 검증할 수 없다.
//
//	LIFTGRAM_TEST_DATABASE_URL=postgres://… go test ./internal/feed -run Recommended
//
// 쿼리가 전체 글을 훑으므로 순서는 이 시험이 만든 글끼리의 상대 순서만 본다. 주소가 없으면 건너뛴다.
package feed

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

type recFixture struct {
	t    *testing.T
	pool *pgxpool.Pool
	repo Repo
	base time.Time
}

func (f *recFixture) user(name string) string {
	f.t.Helper()
	id := "rec-" + uuid.NewString()
	if _, err := f.pool.Exec(context.Background(),
		`INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, 'x', $3)`,
		id, id+"@x.test", name); err != nil {
		f.t.Fatal(err)
	}
	return id
}

type postOpt struct {
	visibility, status string
	ageHours           float64
	likes              int
	exercises          string
}

func (f *recFixture) post(author string, o postOpt) string {
	f.t.Helper()
	if o.visibility == "" {
		o.visibility = "public"
	}
	if o.status == "" {
		o.status = "approved"
	}
	if o.exercises == "" {
		o.exercises = "[]"
	}
	id := "rec-" + uuid.NewString()
	if _, err := f.pool.Exec(context.Background(), `
		INSERT INTO posts (id, author_id, kind, visibility, moderation_status, like_count, exercises, created_at)
		VALUES ($1, $2, 'text', $3, $4, $5, $6::jsonb, now() - make_interval(secs => $7::float8))`,
		id, author, o.visibility, o.status, o.likes, o.exercises, o.ageHours*3600); err != nil {
		f.t.Fatal(err)
	}
	return id
}

func (f *recFixture) exec(sql string, args ...any) {
	f.t.Helper()
	if _, err := f.pool.Exec(context.Background(), sql, args...); err != nil {
		f.t.Fatal(err)
	}
}

// ids — 이 시험이 만든 글만 추천 순서대로.
func (f *recFixture) ids(viewer string, mine map[string]bool) []string {
	f.t.Helper()
	rows, err := f.repo.ListRecommended(context.Background(), viewer, f.base, 0, 2000)
	if err != nil {
		f.t.Fatal(err)
	}
	var out []string
	for _, p := range rows {
		if mine[p.ID] {
			out = append(out, p.ID)
		}
	}
	return out
}

func newRecFixture(t *testing.T) *recFixture {
	pool := testpg.Pool(t)
	return &recFixture{t: t, pool: pool, repo: NewRepo(pool), base: time.Now().Add(-48 * time.Hour)}
}

func TestRecommendedExclusions(t *testing.T) {
	f := newRecFixture(t)
	me, other, friend, blocked, blocker, optOut := f.user("나"), f.user("남"), f.user("친구"), f.user("차단"), f.user("차단자"), f.user("끈사람")
	f.exec(`INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)`, me, friend)
	f.exec(`INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2), ($3, $1)`, me, blocked, blocker)
	f.exec(`UPDATE users SET recommend_opt_out = true WHERE id = $1`, optOut)

	shown := f.post(other, postOpt{})
	followed := f.post(friend, postOpt{})
	hidden := []string{
		f.post(me, postOpt{}),
		f.post(blocked, postOpt{}),
		f.post(blocker, postOpt{}),
		f.post(optOut, postOpt{}),
		f.post(other, postOpt{visibility: "followers"}),
		f.post(other, postOpt{visibility: "private"}),
		f.post(other, postOpt{status: "pending"}),
		f.post(other, postOpt{status: "removed"}),
		f.post(other, postOpt{ageHours: 72}), // 시행 전 글
	}
	liked := f.post(other, postOpt{})
	f.exec(`INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2)`, liked, me)
	reported := f.post(other, postOpt{})
	f.exec(`INSERT INTO reports (id, target_type, target_id, reporter_id, reason) VALUES ($1, 'post', $2, $3, 'spam')`, uuid.NewString(), reported, me)
	hidden = append(hidden, liked, reported)

	mine := map[string]bool{shown: true, followed: true}
	for _, id := range hidden {
		mine[id] = true
	}
	got := map[string]bool{}
	for _, id := range f.ids(me, mine) {
		got[id] = true
	}
	if !got[shown] || !got[followed] {
		t.Fatalf("보여야 할 글이 빠졌다: %v", got)
	}
	for i, id := range hidden {
		if got[id] {
			t.Errorf("제외돼야 하는 글 #%d 이 나왔다", i)
		}
	}
	rows, err := f.repo.ListRecommended(context.Background(), me, f.base, 0, 2000)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range rows {
		if p.ID == followed && !p.AuthorFollowedByMe {
			t.Error("팔로우 표시가 없다")
		}
		if p.ID == shown && p.AuthorFollowedByMe {
			t.Error("팔로우하지 않은 사람인데 팔로우로 나온다")
		}
	}
}

func TestRecommendedOrder(t *testing.T) {
	f := newRecFixture(t)
	me := f.user("나")
	a, b, c := f.user("가"), f.user("나2"), f.user("다")
	old := f.post(a, postOpt{ageHours: 40, likes: 1})
	fresh := f.post(b, postOpt{ageHours: 1, likes: 1})
	popular := f.post(c, postOpt{ageHours: 1, likes: 50})
	got := f.ids(me, map[string]bool{old: true, fresh: true, popular: true})
	if len(got) != 3 || got[0] != popular || got[1] != fresh || got[2] != old {
		t.Fatalf("좋아요·최신 순이 아니다: %v / 인기 %s 최신 %s 옛 %s", got, popular, fresh, old)
	}
}

func TestRecommendedDiversity(t *testing.T) {
	f := newRecFixture(t)
	me := f.user("나")
	a, b := f.user("가"), f.user("나2")
	first := f.post(a, postOpt{ageHours: 1, likes: 10})
	second := f.post(a, postOpt{ageHours: 1.01, likes: 10})
	third := f.post(a, postOpt{ageHours: 1.02, likes: 10})
	other := f.post(b, postOpt{ageHours: 1, likes: 8})
	got := f.ids(me, map[string]bool{first: true, second: true, third: true, other: true})
	if len(got) != 4 || got[0] != first || got[1] != other {
		t.Fatalf("같은 작성자가 위를 독차지한다: %v", got)
	}
}

func TestRecommendedInterestAndBadExercises(t *testing.T) {
	f := newRecFixture(t)
	me := f.user("나")
	a, b, c, d := f.user("가"), f.user("나2"), f.user("다"), f.user("라")
	f.post(me, postOpt{exercises: `[{"ExerciseID":"seed-squat"}]`})
	// 관심도가 같은 값을 PascalCase·camelCase 둘 다 읽고, JSON null 행이 쿼리를 죽이지 않는다.
	pascal := f.post(a, postOpt{ageHours: 1, exercises: `[{"ExerciseID":"seed-squat"}]`})
	camel := f.post(b, postOpt{ageHours: 1.01, exercises: `[{"exerciseId":"seed-squat"}]`})
	plain := f.post(c, postOpt{ageHours: 0.5})
	null := f.post(d, postOpt{ageHours: 3})
	f.exec(`UPDATE posts SET exercises = 'null'::jsonb WHERE id = $1`, null)
	got := f.ids(me, map[string]bool{pascal: true, camel: true, plain: true, null: true})
	if len(got) != 4 || plain == got[0] || plain == got[1] {
		t.Fatalf("관심 종목 글이 위로 와야 한다: %v (plain %s)", got, plain)
	}
}

func TestRecommendedPagingKeepsOrder(t *testing.T) {
	f := newRecFixture(t)
	me := f.user("나")
	a := f.user("가")
	for i := range 3 {
		f.post(a, postOpt{ageHours: float64(i) + 1})
	}
	first, err := f.repo.ListRecommended(context.Background(), me, f.base, 0, 1)
	if err != nil {
		t.Fatal(err)
	}
	second, err := f.repo.ListRecommended(context.Background(), me, f.base, 1, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 1 || len(second) != 1 || first[0].ID == second[0].ID {
		t.Fatalf("쪽이 겹친다: %v %v", first, second)
	}
}

// 검토 중인 글은 작성자에게만 표시와 함께 보이고, 제3자에게는 없는 글이다.
func TestPendingPostVisibleOnlyToAuthor(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	user := func() string {
		id := "held-" + uuid.NewString()
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, 'x', 'n')`, id, id+"@x.test"); err != nil {
			t.Fatal(err)
		}
		return id
	}
	author, other, postID := user(), user(), "held-"+uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO posts (id, author_id, kind, visibility, moderation_status) VALUES ($1, $2, 'text', 'public', 'pending')`, postID, author); err != nil {
		t.Fatal(err)
	}
	repo := NewRepo(pool)
	p, err := repo.GetPost(ctx, author, postID)
	if err != nil || !p.UnderReview {
		t.Fatalf("작성자는 검토 중 표시와 함께 본다: %+v %v", p, err)
	}
	if _, err := repo.GetPost(ctx, other, postID); err == nil {
		t.Fatal("제3자에게는 없는 글이어야 한다")
	}
}

// 공식 글의 표시(ADR-060)는 official_meta 열 하나로 오고, 일반 글에는 없다.
func TestOfficialMetaRoundTrip(t *testing.T) {
	f := newRecFixture(t)
	author := f.user("공식")
	official := f.post(author, postOpt{ageHours: 1})
	plain := f.post(author, postOpt{ageHours: 1})
	f.exec(`UPDATE posts SET official_meta = $2::jsonb WHERE id = $1`, official,
		`{"aiNotice":"virtual_person","creatorRoutineId":"cr-bg-fb-six"}`)

	ctx := context.Background()
	p, err := f.repo.GetPost(ctx, author, official)
	if err != nil {
		t.Fatal(err)
	}
	if p.Official == nil || p.Official.AINotice != "virtual_person" || p.Official.CreatorRoutineID != "cr-bg-fb-six" {
		t.Fatalf("공식 표시가 그대로 와야 한다: %+v", p.Official)
	}
	q, err := f.repo.GetPost(ctx, author, plain)
	if err != nil {
		t.Fatal(err)
	}
	if q.Official != nil {
		t.Fatalf("일반 글에는 공식 표시가 없어야 한다: %+v", q.Official)
	}
	noNotice := f.post(author, postOpt{ageHours: 1})
	f.exec(`UPDATE posts SET official_meta = '{"creatorRoutineId":"cr-bg-fb-six"}'::jsonb WHERE id = $1`, noNotice)
	if n, err := f.repo.GetPost(ctx, author, noNotice); err != nil || n.Official != nil {
		t.Fatalf("AI 고지가 없으면 공식 표시를 하지 않는다: %+v %v", n, err)
	}
	rows, err := f.repo.ListRecommended(ctx, f.user("보는 이"), f.base, 0, 2000)
	if err != nil {
		t.Fatal(err)
	}
	// 시험 글을 남기면 같은 DB 의 다른 시험·화면 시험에 공식 글로 섞인다.
	t.Cleanup(func() { f.exec(`DELETE FROM posts WHERE id = ANY($1)`, []string{official, plain, noNotice}) })
	found := false
	for _, r := range rows {
		if r.ID == official {
			found = r.Official != nil && r.Official.CreatorRoutineID == "cr-bg-fb-six"
		}
	}
	if !found {
		t.Fatal("추천 목록에서도 공식 표시가 와야 한다")
	}
}
