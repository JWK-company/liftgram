// 신고 자동 숨김 실 DB 시험(SPEC-030). 주소가 없으면 건너뛴다.
package moderation

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/testpg"
)

func TestReportsHoldAndDismissRestore(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	user := func() string {
		id := "mod-" + uuid.NewString()
		// 자동 숨김은 가입 7일 이상·메일 확인 계정의 신고만 센다.
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, display_name, email_verified_at, created_at)
			VALUES ($1, $2, 'x', 'n', now(), now() - interval '8 days')`, id, id+"@x.test"); err != nil {
			t.Fatal(err)
		}
		return id
	}
	newcomer := func() string {
		id := "mod-" + uuid.NewString()
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, 'x', 'n')`, id, id+"@x.test"); err != nil {
			t.Fatal(err)
		}
		return id
	}
	author, postID := user(), "mod-"+uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO posts (id, author_id, kind, visibility) VALUES ($1, $2, 'text', 'public')`, postID, author); err != nil {
		t.Fatal(err)
	}
	status := func() string {
		var s string
		if err := pool.QueryRow(ctx, `SELECT moderation_status FROM posts WHERE id = $1`, postID).Scan(&s); err != nil {
			t.Fatal(err)
		}
		return s
	}
	svc := NewService(NewRepo(pool), uuid.NewString)
	// 새 계정과 의견이 갈리는 사유로는 숨기지 않는다.
	for i := 0; i < 3; i++ {
		if err := svc.Report(ctx, newcomer(), TargetPost, postID, "nudity", ""); err != nil {
			t.Fatal(err)
		}
		if err := svc.Report(ctx, user(), TargetPost, postID, "other", ""); err != nil {
			t.Fatal(err)
		}
	}
	if got := status(); got != "approved" {
		t.Fatalf("새 계정·기타 사유로는 숨기지 않는다: %s", got)
	}
	first := user()
	for _, who := range []string{first, first, user()} {
		if err := svc.Report(ctx, who, TargetPost, postID, "nudity", ""); err != nil {
			t.Fatal(err)
		}
	}
	if got := status(); got != "approved" {
		t.Fatalf("두 명으로는 숨기지 않는다: %s", got)
	}
	if err := svc.Report(ctx, user(), TargetPost, postID, "nudity", ""); err != nil {
		t.Fatal(err)
	}
	if got := status(); got != "pending" {
		t.Fatalf("세 명이면 검토 대기: %s", got)
	}
	if err := svc.Resolve(ctx, adminUser(t, pool), "admin", TargetPost, postID, false, ""); err != nil {
		t.Fatal(err)
	}
	if got := status(); got != "approved" {
		t.Fatalf("기각하면 돌아온다: %s", got)
	}
	// 검토자가 기각한 글은 신고가 다시 쌓여도 자동으로 숨기지 않는다 — 목록에만 오른다.
	for i := 0; i < 4; i++ {
		if err := svc.Report(ctx, user(), TargetPost, postID, "nudity", ""); err != nil {
			t.Fatal(err)
		}
	}
	if got := status(); got != "approved" {
		t.Fatalf("기각 뒤에는 다시 숨기지 않는다: %s", got)
	}
	queue, err := svc.ListQueue(ctx, adminUser(t, pool), "admin", 200)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, it := range queue {
		found = found || it.TargetID == postID
	}
	if !found {
		t.Fatal("다시 들어온 신고는 검토 목록에 있어야 한다")
	}

	// 숨긴 댓글은 신고자가 탈퇴해 신고 행이 사라져도 검토 목록에 남는다.
	commentID := "mod-" + uuid.NewString()
	post2 := "mod-" + uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO posts (id, author_id, kind, visibility) VALUES ($1, $2, 'text', 'public')`, post2, author); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO comments (id, post_id, author_id, body) VALUES ($1, $2, $3, '본문')`, commentID, post2, author); err != nil {
		t.Fatal(err)
	}
	reporters := []string{user(), user(), user()}
	for _, who := range reporters {
		if err := svc.Report(ctx, who, TargetComment, commentID, "harassment", ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, reporters); err != nil {
		t.Fatal(err)
	}
	queue, err = svc.ListQueue(ctx, adminUser(t, pool), "admin", 200)
	if err != nil {
		t.Fatal(err)
	}
	found = false
	for _, it := range queue {
		found = found || it.TargetID == commentID
	}
	if !found {
		t.Fatal("숨긴 댓글이 검토 목록에서 사라졌다")
	}
}

// 나체 신고로 숨기면 파일도 막히고 승인하면 풀린다. 괴롭힘 신고는 파일을 막지 않는다.
func TestHoldBlocksMediaOnlyForSensitiveReasons(t *testing.T) {
	pool := testpg.Pool(t)
	ctx := context.Background()
	user := func() string {
		id := "mod-" + uuid.NewString()
		if _, err := pool.Exec(ctx, `INSERT INTO users (id, email, password_hash, display_name, email_verified_at, created_at)
			VALUES ($1, $2, 'x', 'n', now(), now() - interval '8 days')`, id, id+"@x.test"); err != nil {
			t.Fatal(err)
		}
		return id
	}
	svc := NewService(NewRepo(pool), uuid.NewString)
	author := user()
	setup := func() (string, string) {
		postID, key := "mod-"+uuid.NewString(), "k"+uuid.NewString()+".jpg"
		url := "/media/file/" + key
		if _, err := pool.Exec(ctx, `INSERT INTO media_assets (id, owner_id, key, url, content_type, kind, bytes) VALUES ($1, $2, $3, $4, 'image/jpeg', 'image', 1)`, uuid.NewString(), author, key, url); err != nil {
			t.Fatal(err)
		}
		if _, err := pool.Exec(ctx, `INSERT INTO posts (id, author_id, kind, visibility, media_urls) VALUES ($1, $2, 'image', 'public', ARRAY[$3::text])`, postID, author, url); err != nil {
			t.Fatal(err)
		}
		return postID, key
	}
	flagged := func(key string) bool {
		var f bool
		if err := pool.QueryRow(ctx, `SELECT flagged FROM media_assets WHERE key = $1`, key).Scan(&f); err != nil {
			t.Fatal(err)
		}
		return f
	}
	report := func(postID, reason string) {
		for i := 0; i < 3; i++ {
			if err := svc.Report(ctx, user(), TargetPost, postID, reason, ""); err != nil {
				t.Fatal(err)
			}
		}
	}
	nude, nudeKey := setup()
	report(nude, "nudity")
	if !flagged(nudeKey) {
		t.Fatal("나체 신고로 숨기면 파일도 막혀야 한다")
	}
	if err := svc.Resolve(ctx, adminUser(t, pool), "admin", TargetPost, nude, false, ""); err != nil {
		t.Fatal(err)
	}
	if flagged(nudeKey) {
		t.Fatal("승인하면 파일이 풀려야 한다")
	}
	rude, rudeKey := setup()
	report(rude, "harassment")
	if flagged(rudeKey) {
		t.Fatal("괴롭힘 신고로는 파일을 막지 않는다")
	}
}

// adminUser 는 DB 역할까지 관리자인 계정이다 — 검토 권한은 토큰이 아니라 DB 역할로 판정한다(SPEC-032).
func adminUser(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	id := "mod-" + uuid.NewString()
	if _, err := pool.Exec(context.Background(), `INSERT INTO users (id, email, password_hash, display_name, role) VALUES ($1, $2, 'x', 'n', 'admin')`, id, id+"@x.test"); err != nil {
		t.Fatal(err)
	}
	return id
}
