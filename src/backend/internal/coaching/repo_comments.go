// 코치 코멘트·담당 회원 점검 저장소(SPEC-050 P4) — 쿼리는 database/queries/coaching.sql.
package coaching

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// [원본] func commentFrom(row sqlcgen.CoachingComment) — 0035 뒤 trainer_id·grant_id 가 nullable 이라 조회 행(빈 글자로 바꾼 것)을 받는다
func commentFrom(row sqlcgen.GetCoachingCommentRow) Comment {
	return Comment{
		ID: row.ID, GrantID: row.GrantID, TrainerID: row.TrainerID, MemberID: row.MemberID,
		WorkoutID: row.WorkoutID, Body: row.Body, CreatedAt: tsOf(row.CreatedAt), HiddenAt: tsOf(row.HiddenAt),
	}
}

// InsertCommentCapped — 한 트랜잭션에서 관계를 잠그고(LockGrantByPair · 루틴 보내기·해지와 같은 줄) 활성·logView·차단을
// 다시 본 뒤 하루 개수를 세고 넣는다. 같은 관계의 동시 요청은 잠금에서 줄을 서므로 상한을 넘지 못한다(리뷰).
func (r *pgRepo) InsertCommentCapped(ctx context.Context, c Comment, since time.Time, maxPerDay int) (Comment, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Comment{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	gr, err := q.LockGrantByPair(ctx, sqlcgen.LockGrantByPairParams{TrainerID: c.TrainerID, MemberID: c.MemberID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Comment{}, errs.New(errs.Forbidden, msgNotActive)
		}
		return Comment{}, err
	}
	g := grantFrom(gr)
	if g.Status != StatusActive {
		return Comment{}, errs.New(errs.Forbidden, msgNotActive)
	}
	if !g.Scope[ScopeLogView] {
		return Comment{}, errs.New(errs.Forbidden, msgLogOff)
	}
	blocked, err := q.IsBlockedEitherWay(ctx, sqlcgen.IsBlockedEitherWayParams{A: c.TrainerID, B: c.MemberID})
	if err != nil {
		return Comment{}, err
	}
	if blocked {
		return Comment{}, errs.New(errs.Forbidden, msgBlocked)
	}
	n, err := q.CountCommentsByPairSince(ctx, sqlcgen.CountCommentsByPairSinceParams{
		TrainerID: c.TrainerID, MemberID: c.MemberID, Since: tsAt(since),
	})
	if err != nil {
		return Comment{}, err
	}
	if int(n) >= maxPerDay {
		return Comment{}, errs.New(errs.ResourceExhausted, msgCommentDaily, maxPerDay)
	}
	row, err := q.InsertCoachingComment(ctx, sqlcgen.InsertCoachingCommentParams{
		ID: c.ID, GrantID: g.ID, TrainerID: c.TrainerID, MemberID: c.MemberID, WorkoutID: c.WorkoutID, Body: c.Body,
	})
	if err != nil {
		return Comment{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Comment{}, err
	}
	c.ID, c.GrantID, c.CreatedAt = row.ID, g.ID, tsOf(row.CreatedAt)
	return c, nil
}

func (r *pgRepo) CountCommentsSince(ctx context.Context, trainerID, memberID string, since time.Time) (int, error) {
	n, err := r.q.CountCommentsByPairSince(ctx, sqlcgen.CountCommentsByPairSinceParams{
		TrainerID: trainerID, MemberID: memberID, Since: tsAt(since),
	})
	return int(n), err
}

func (r *pgRepo) ListCommentsForWorkout(ctx context.Context, memberID, workoutID, trainerID string) ([]Comment, error) {
	rows, err := r.q.ListCommentsForWorkout(ctx, sqlcgen.ListCommentsForWorkoutParams{
		MemberID: memberID, WorkoutID: workoutID, TrainerID: trainerID,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, Comment{
			ID: row.ID, TrainerID: row.TrainerID, MemberID: row.MemberID, WorkoutID: row.WorkoutID,
			Body: row.Body, CreatedAt: tsOf(row.CreatedAt), TrainerName: row.TrainerName,
		})
	}
	return out, nil
}

func (r *pgRepo) ListCommentsByPair(ctx context.Context, trainerID, memberID string) ([]Comment, error) {
	rows, err := r.q.ListCommentsByPair(ctx, sqlcgen.ListCommentsByPairParams{TrainerID: trainerID, MemberID: memberID})
	if err != nil {
		return nil, err
	}
	out := make([]Comment, 0, len(rows))
	for _, row := range rows {
		out = append(out, Comment{
			ID: row.ID, TrainerID: row.TrainerID, MemberID: row.MemberID, WorkoutID: row.WorkoutID,
			Body: row.Body, CreatedAt: tsOf(row.CreatedAt), TrainerName: row.TrainerName,
		})
	}
	return out, nil
}

func (r *pgRepo) GetComment(ctx context.Context, id string) (Comment, error) {
	row, err := r.q.GetCoachingComment(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Comment{}, errs.New(errs.NotFound, msgCommentNotFound)
		}
		return Comment{}, err
	}
	return commentFrom(row), nil
}

func (r *pgRepo) HideComment(ctx context.Context, id string) (bool, error) {
	n, err := r.q.HideCoachingComment(ctx, id)
	return n > 0, err
}

func (r *pgRepo) ListMemberDigestRows(ctx context.Context, trainerID string, weekStartMs, toMs, nowMs int64, limit int) ([]DigestRow, error) {
	rows, err := r.q.ListMemberDigestRows(ctx, sqlcgen.ListMemberDigestRowsParams{
		TrainerID: trainerID, WeekStartMs: weekStartMs, ToMs: toMs, NowMs: nowMs, RowLimit: int32(limit),
	})
	if err != nil {
		return nil, err
	}
	out := make([]DigestRow, 0, len(rows))
	for _, row := range rows {
		out = append(out, DigestRow{
			MemberID: row.MemberID, Scope: parseScope(row.Scope),
			DigestCounts: DigestCounts{
				WeekWorkouts: int(row.WeekWorkouts), LastStartedAtMs: row.LastStartedAt, WeekCoachWorkouts: int(row.WeekCoachWorkouts),
			},
		})
	}
	return out, nil
}

func (r *pgRepo) ListCoachMemberRoutineIDs(ctx context.Context, trainerID, memberID string) (map[string]bool, error) {
	ids, err := r.q.ListCoachMemberRoutineIDs(ctx, sqlcgen.ListCoachMemberRoutineIDsParams{TrainerID: trainerID, MemberID: memberID})
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(ids))
	for _, id := range ids {
		out[id] = true
	}
	return out, nil
}
