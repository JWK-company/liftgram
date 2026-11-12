// 이달의 리프터 저장소(SPEC-063). 집계는 읽기 전용 트랜잭션 + 문장 5초 상한(src/backend/internal/admin/repo.go 와 같다).
package award

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

const statementTimeoutSQL = `SET LOCAL statement_timeout = '5s'`

type PgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) *PgRepo { return &PgRepo{pool: pool, q: sqlcgen.New(pool)} }

func (r *PgRepo) read(ctx context.Context, fn func(q *sqlcgen.Queries) error) error {
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, statementTimeoutSQL); err != nil {
		return err
	}
	if err := fn(r.q.WithTx(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

func tptr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func sptr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func sval(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func ival(p *int32) int {
	if p == nil {
		return 0
	}
	return int(*p)
}

func i32(n int) *int32 { v := int32(n); return &v }

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

func (r *PgRepo) WorkoutDays(ctx context.Context, from, to time.Time, onlyUser string) ([]DayCount, error) {
	var out []DayCount
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AwardWorkoutDays(ctx, sqlcgen.AwardWorkoutDaysParams{
			Since:    ts(from.Add(-time.Hour)),
			Until:    ts(to.Add(lateWindow + time.Hour)),
			OnlyUser: sptr(onlyUser),
			FromMs:   from.UnixMilli(),
			ToMs:     to.UnixMilli(),
		})
		for _, x := range rows {
			out = append(out, DayCount{UserID: x.UserID, Days: int(x.Days), Late: int(x.Late)})
		}
		return err
	})
	return out, err
}

func (r *PgRepo) Likes(ctx context.Context, from, to time.Time, onlyAuthor string, limit int) ([]LikeCount, error) {
	var out []LikeCount
	err := r.read(ctx, func(q *sqlcgen.Queries) error {
		rows, err := q.AwardLikes(ctx, sqlcgen.AwardLikesParams{
			Lim: int32(limit), FromTs: ts(from), ToTs: ts(to), OnlyAuthor: sptr(onlyAuthor),
		})
		for _, x := range rows {
			out = append(out, LikeCount{UserID: x.AuthorID, Likes: int(x.Likes), Likers: int(x.Likers)})
		}
		return err
	})
	return out, err
}

func toUser(id string, name, avatar *string, role string, excluded bool, ev, age, created pgtype.Timestamptz) User {
	return User{
		ID: id, Name: sval(name), Avatar: sval(avatar), Role: role, StatsExcluded: excluded,
		EmailVerifiedAt: tptr(ev), AgeConfirmedAt: tptr(age), CreatedAt: created.Time,
	}
}

func (r *PgRepo) Users(ctx context.Context, ids []string) ([]User, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	rows, err := r.q.AwardUsers(ctx, ids)
	out := make([]User, 0, len(rows))
	for _, x := range rows {
		out = append(out, toUser(x.ID, x.DisplayName, x.AvatarUrl, x.Role, x.StatsExcluded, x.EmailVerifiedAt, x.AgeConfirmedAt, x.CreatedAt))
	}
	return out, err
}

func (r *PgRepo) SearchUsers(ctx context.Context, q string) ([]User, error) {
	esc := strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q)
	rows, err := r.q.SearchAwardUsers(ctx, sqlcgen.SearchAwardUsersParams{Q: q, QLike: esc})
	out := make([]User, 0, len(rows))
	for _, x := range rows {
		out = append(out, toUser(x.ID, x.DisplayName, x.AvatarUrl, x.Role, x.StatsExcluded, x.EmailVerifiedAt, x.AgeConfirmedAt, x.CreatedAt))
	}
	return out, err
}

func toMonth(m sqlcgen.AwardMonth) Month {
	return Month{Month: m.Month, Seed: m.Seed, SeedHash: m.SeedHash, Status: m.Status, AnnouncedAt: tptr(m.AnnouncedAt)}
}

func (r *PgRepo) EnsureMonth(ctx context.Context, month, seed, seedHash string) (Month, error) {
	if err := r.q.EnsureAwardMonth(ctx, sqlcgen.EnsureAwardMonthParams{Month: month, Seed: seed, SeedHash: seedHash}); err != nil {
		return Month{}, err
	}
	m, err := r.q.GetAwardMonth(ctx, month) // 경합에서 진 쪽도 이긴 쪽의 씨앗을 읽는다
	return toMonth(m), err
}

func (r *PgRepo) GetMonth(ctx context.Context, month string) (Month, bool, error) {
	m, err := r.q.GetAwardMonth(ctx, month)
	if errors.Is(err, pgx.ErrNoRows) {
		return Month{}, false, nil
	}
	if err != nil {
		return Month{}, false, err
	}
	return toMonth(m), true, nil
}

func (r *PgRepo) Announce(ctx context.Context, month, by, candidatesHash string, awards []NewAward) (bool, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	if _, err := q.AnnounceAwardMonth(ctx, sqlcgen.AnnounceAwardMonthParams{
		AnnouncedBy: sptr(by), CandidatesHash: sptr(candidatesHash), Month: month,
	}); errors.Is(err, pgx.ErrNoRows) {
		return false, nil // 이미 확정(다른 요청이 이겼다)
	} else if err != nil {
		return false, err
	}
	for _, a := range awards {
		if err := q.InsertAward(ctx, sqlcgen.InsertAwardParams{
			ID: a.ID, Month: a.Month, Category: a.Category, UserID: sptr(a.UserID), Rank: int32(a.Rank),
			Reason: sptr(a.Reason), Days: i32(a.Days), Likes: i32(a.Likes),
		}); err != nil {
			return false, err
		}
	}
	return true, tx.Commit(ctx)
}

func (r *PgRepo) ListAnnounced(ctx context.Context, limit int) ([]Month, error) {
	rows, err := r.q.ListAnnouncedMonths(ctx, int32(limit))
	out := make([]Month, 0, len(rows))
	for _, m := range rows {
		out = append(out, toMonth(m))
	}
	return out, err
}

func dateStr(d pgtype.Date) string {
	if !d.Valid {
		return ""
	}
	return d.Time.Format("2006-01-02")
}

func toAward(a sqlcgen.Award) Award {
	return Award{
		ID: a.ID, Month: a.Month, Category: a.Category, UserID: sval(a.UserID), Rank: int(a.Rank),
		Reason: sval(a.Reason), Days: ival(a.Days), Likes: ival(a.Likes), Public: a.Public,
		CouponCode: sval(a.CouponCode), CouponItem: sval(a.CouponItem), CouponExpires: dateStr(a.CouponExpires),
		ClaimedAt: tptr(a.ClaimedAt),
	}
}

func (r *PgRepo) AwardsForMonths(ctx context.Context, months []string) ([]Award, error) {
	rows, err := r.q.ListAwardsForMonths(ctx, months)
	out := make([]Award, 0, len(rows))
	for _, x := range rows {
		a := toAward(sqlcgen.Award{
			ID: x.ID, Month: x.Month, Category: x.Category, UserID: x.UserID, Rank: x.Rank, Reason: x.Reason,
			Days: x.Days, Likes: x.Likes, Public: x.Public, CouponCode: x.CouponCode, CouponItem: x.CouponItem,
			CouponExpires: x.CouponExpires, ClaimedAt: x.ClaimedAt,
		})
		a.Name, a.Avatar = sval(x.DisplayName), sval(x.AvatarUrl)
		out = append(out, a)
	}
	return out, err
}

func (r *PgRepo) AwardsByUser(ctx context.Context, userID string) ([]Award, error) {
	rows, err := r.q.ListAwardsByUser(ctx, &userID)
	out := make([]Award, 0, len(rows))
	for _, x := range rows {
		out = append(out, toAward(x))
	}
	return out, err
}

func (r *PgRepo) GetAward(ctx context.Context, id string) (Award, bool, error) {
	a, err := r.q.GetAward(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Award{}, false, nil
	}
	if err != nil {
		return Award{}, false, err
	}
	return toAward(a), true, nil
}

func (r *PgRepo) MarkClaimed(ctx context.Context, id, userID string, claimed bool) (bool, error) {
	n, err := r.q.MarkAwardClaimed(ctx, sqlcgen.MarkAwardClaimedParams{Claimed: claimed, ID: id, UserID: &userID})
	return n > 0, err
}

func (r *PgRepo) SetPublic(ctx context.Context, id, userID string, public bool) (bool, error) {
	n, err := r.q.SetAwardPublic(ctx, sqlcgen.SetAwardPublicParams{Public: public, ID: id, UserID: &userID})
	return n > 0, err
}

func (r *PgRepo) SetCoupon(ctx context.Context, id, code, item string, expires *time.Time, by string) (bool, error) {
	var d pgtype.Date
	if expires != nil {
		d = pgtype.Date{Time: *expires, Valid: true}
	}
	n, err := r.q.SetAwardCoupon(ctx, sqlcgen.SetAwardCouponParams{
		CouponCode: code, CouponItem: item, CouponExpires: d, SetBy: sptr(by), ID: id,
	})
	return n > 0, err
}

func (r *PgRepo) BlockedEither(ctx context.Context, a, b string) (bool, error) {
	return r.q.AwardBlockedEither(ctx, sqlcgen.AwardBlockedEitherParams{A: a, B: b})
}
