// @plm SRS-049  피드백 저장소
//
// [원본] 피드백 본문은 우리 DB에 남지 않는다(아이디어보드가 원본이다). 제출자 이름만 읽었다.
// [개선] SPEC-032 부터 본문을 feedback_items 에 쌓는다. DisplayLabel 은 되돌릴 때를 위해 남긴다.
package feedback

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// PgRepo 는 Repo(와 옛 BoardRepo)의 PostgreSQL 구현이다.
type PgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) *PgRepo { return &PgRepo{pool: pool, q: sqlcgen.New(pool)} }

// DisplayLabel은 표시 이름 → 이메일 → id 순으로 고른다. 셋 다 없을 수는 없다(id는 항상 있다).
func (r *PgRepo) DisplayLabel(ctx context.Context, userID string) (string, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if err != nil {
		return "", err
	}
	if u.DisplayName != nil && *u.DisplayName != "" {
		return *u.DisplayName, nil
	}
	if u.Email != nil && *u.Email != "" {
		return *u.Email, nil
	}
	return userID, nil
}

func (r *PgRepo) UserRole(ctx context.Context, userID string) (string, bool, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return u.Role, true, nil
}

func (r *PgRepo) EmailConfirmed(ctx context.Context, userID string) (bool, error) {
	u, err := r.q.GetUserByID(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if err != nil {
		return false, err
	}
	return u.Email == nil || u.EmailVerifiedAt.Valid, nil
}

func createParams(e NewEntry) sqlcgen.CreateFeedbackItemParams {
	p := sqlcgen.CreateFeedbackItemParams{
		Kind: e.Kind, AuthorID: &e.AuthorID, Title: e.Title, Body: e.Body,
		AppVersion: e.AppVersion, Platform: e.Platform,
	}
	if e.Category != "" {
		p.Category = &e.Category
	}
	return p
}

func (r *PgRepo) Create(ctx context.Context, e NewEntry) (int64, error) {
	return r.q.CreateFeedbackItem(ctx, createParams(e))
}

func (r *PgRepo) CreateUserLimited(ctx context.Context, e NewEntry, since time.Time, limit int) (int64, bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := sqlcgen.New(tx)
	if err := q.LockUserFeedback(ctx, e.AuthorID); err != nil {
		return 0, false, err
	}
	n, err := q.CountUserFeedbackSince(ctx, sqlcgen.CountUserFeedbackSinceParams{
		AuthorID: &e.AuthorID,
		Since:    pgtype.Timestamptz{Time: since, Valid: true},
	})
	if err != nil {
		return 0, false, err
	}
	if n >= int64(limit) {
		return 0, true, nil
	}
	id, err := q.CreateFeedbackItem(ctx, createParams(e))
	if err != nil {
		return 0, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, false, err
	}
	return id, false, nil
}

func (r *PgRepo) List(ctx context.Context, kind string, limit int32) ([]Entry, error) {
	rows, err := r.q.ListFeedbackItems(ctx, sqlcgen.ListFeedbackItemsParams{Kind: kind, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Entry, 0, len(rows))
	for _, row := range rows {
		out = append(out, Entry{
			ID: row.ID, Kind: row.Kind, AuthorID: deref(row.AuthorID), AuthorName: deref(row.AuthorName),
			Category: deref(row.Category), Title: row.Title, Body: row.Body,
			AppVersion: row.AppVersion, Platform: row.Platform,
			Status: row.Status, Resolution: row.Resolution, CreatedAt: row.CreatedAt.Time,
		})
	}
	return out, nil
}

func (r *PgRepo) ApplyStatus(ctx context.Context, id int64, actorID string, decide func(Entry) (Change, error)) (Entry, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Entry{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := sqlcgen.New(tx)
	row, err := q.GetFeedbackItemForUpdate(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Entry{}, errs.New(errs.NotFound, "찾을 수 없습니다")
	}
	if err != nil {
		return Entry{}, err
	}
	cur := Entry{
		ID: row.ID, Kind: row.Kind, AuthorID: deref(row.AuthorID), Category: deref(row.Category),
		Title: row.Title, Body: row.Body, AppVersion: row.AppVersion, Platform: row.Platform,
		Status: row.Status, Resolution: row.Resolution, CreatedAt: row.CreatedAt.Time,
	}
	c, err := decide(cur)
	if err != nil {
		return Entry{}, err
	}
	params := sqlcgen.SetFeedbackStatusParams{ID: id, Status: c.To, Resolution: c.Note}
	if c.ApprovedBodySHA256 != "" {
		params.ApprovedBodySha256 = &c.ApprovedBodySHA256
		params.ApprovedInstruction = &c.Note
	}
	if err := q.SetFeedbackStatus(ctx, params); err != nil {
		return Entry{}, err
	}
	if err := q.InsertFeedbackEvent(ctx, sqlcgen.InsertFeedbackEventParams{
		ItemID: id, ActorID: actorID, FromStatus: cur.Status, ToStatus: c.To, Note: c.Note,
	}); err != nil {
		return Entry{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Entry{}, err
	}
	cur.Status, cur.Resolution = c.To, c.Note
	return cur, nil
}

func (r *PgRepo) PurgeClosedUser(ctx context.Context, before time.Time) (int64, error) {
	return r.q.PurgeClosedUserFeedback(ctx, pgtype.Timestamptz{Time: before, Valid: true})
}
