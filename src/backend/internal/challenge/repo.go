// 그룹 챌린지 저장소(SPEC-064) — sqlc 생성물만 부른다. 트랜잭션마다 문장 5초 상한.
package challenge

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type PgRepo struct{ pool *pgxpool.Pool }

func NewRepo(pool *pgxpool.Pool) *PgRepo { return &PgRepo{pool: pool} }

func (r *PgRepo) InTx(ctx context.Context, fn func(tx Tx) error) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SET LOCAL statement_timeout = '5s'`); err != nil {
		return err
	}
	if err := fn(&pgTx{q: sqlcgen.New(tx)}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

type pgTx struct{ q *sqlcgen.Queries }

func nf(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

func ts(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

func tsp(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{}
	}
	return ts(*t)
}

func tptr(t pgtype.Timestamptz) *time.Time {
	if !t.Valid {
		return nil
	}
	v := t.Time
	return &v
}

func date(d Day) pgtype.Date { return pgtype.Date{Time: d.Time(), Valid: true} }

func dayOf(d pgtype.Date) Day { return DayFromTime(d.Time) }

func sp(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func sv(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func fromRow(c sqlcgen.Challenge) Challenge {
	return Challenge{
		ID: c.ID, OwnerID: sv(c.OwnerID), Title: c.Title, Penalty: c.PenaltyText, Token: c.InviteToken, Status: c.Status,
		CreatedAt: c.CreatedAt.Time, EndedAt: tptr(c.EndedAt), PhotosPurgedAt: tptr(c.PhotosPurgedAt),
		Rule: Rule{StartsOn: dayOf(c.StartsOn), Weeks: int(c.Weeks), RuleKind: c.RuleKind, Weekdays: int(c.Weekdays),
			MinSets: int(c.MinSets), ProofMode: c.ProofMode, PassPerWeek: int(c.PassPerWeek)},
	}
}

func fromRows(cs []sqlcgen.Challenge) []Challenge {
	out := make([]Challenge, 0, len(cs))
	for _, c := range cs {
		out = append(out, fromRow(c))
	}
	return out
}

func (t *pgTx) GetChallenge(ctx Ctx, id string, forUpdate bool) (Challenge, error) {
	var c sqlcgen.Challenge
	var err error
	if forUpdate {
		c, err = t.q.GetChallengeForUpdate(ctx, id)
	} else {
		c, err = t.q.GetChallenge(ctx, id)
	}
	if err != nil {
		return Challenge{}, nf(err)
	}
	return fromRow(c), nil
}

func (t *pgTx) ChallengeByToken(ctx Ctx, token string) (Challenge, error) {
	c, err := t.q.GetChallengeByToken(ctx, token)
	if err != nil {
		return Challenge{}, nf(err)
	}
	return fromRow(c), nil
}

func (t *pgTx) InsertChallenge(ctx Ctx, c Challenge) error {
	r := c.Rule
	return t.q.InsertChallenge(ctx, sqlcgen.InsertChallengeParams{
		ID: c.ID, OwnerID: sp(c.OwnerID), Title: c.Title, StartsOn: date(r.StartsOn), Weeks: int32(r.Weeks),
		RuleKind: r.RuleKind, Weekdays: int32(r.Weekdays), MinSets: int32(r.MinSets), ProofMode: r.ProofMode,
		PenaltyText: c.Penalty, PassPerWeek: int32(r.PassPerWeek), InviteToken: c.Token,
	})
}

func (t *pgTx) UpdateRule(ctx Ctx, c Challenge) (bool, error) {
	r := c.Rule
	n, err := t.q.UpdateChallengeRule(ctx, sqlcgen.UpdateChallengeRuleParams{
		ID: c.ID, Title: c.Title, StartsOn: date(r.StartsOn), Weeks: int32(r.Weeks), RuleKind: r.RuleKind,
		Weekdays: int32(r.Weekdays), MinSets: int32(r.MinSets), ProofMode: r.ProofMode, PenaltyText: c.Penalty,
		PassPerWeek: int32(r.PassPerWeek),
	})
	return n > 0, err
}

func (t *pgTx) SetToken(ctx Ctx, id, token string) error {
	return t.q.SetInviteToken(ctx, sqlcgen.SetInviteTokenParams{ID: id, InviteToken: token})
}

func (t *pgTx) SetOwner(ctx Ctx, id, owner string) error {
	return t.q.SetChallengeOwner(ctx, sqlcgen.SetChallengeOwnerParams{ID: id, OwnerID: sp(owner)})
}

func (t *pgTx) SetStatus(ctx Ctx, id, from, to string, at time.Time) (bool, error) {
	n, err := t.q.SetChallengeStatus(ctx, sqlcgen.SetChallengeStatusParams{ID: id, FromStatus: from, Status: to, At: ts(at)})
	return n > 0, err
}

func (t *pgTx) ListByStatus(ctx Ctx, status string) ([]Challenge, error) {
	cs, err := t.q.ListChallengesByStatus(ctx, status)
	return fromRows(cs), err
}

func (t *pgTx) ListMine(ctx Ctx, user string) ([]Challenge, error) {
	cs, err := t.q.ListMyChallenges(ctx, user)
	return fromRows(cs), err
}

func (t *pgTx) CountOpen(ctx Ctx, user string) (int, error) {
	n, err := t.q.CountMyOpenChallenges(ctx, user)
	return int(n), err
}

func (t *pgTx) LockUser(ctx Ctx, user string) error { return t.q.LockUserChallenges(ctx, user) }

func (t *pgTx) TryLoopLock(ctx Ctx) (bool, error) { return t.q.TryLoopLock(ctx) }
func (t *pgTx) TryChallengeLock(ctx Ctx, id string) (bool, error) {
	return t.q.TryChallengeLock(ctx, id)
}
func (t *pgTx) TryPurgeLock(ctx Ctx) (bool, error) { return t.q.TryPurgeLock(ctx) }

func (t *pgTx) Members(ctx Ctx, id string) ([]Member, error) {
	rows, err := t.q.ListMembers(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]Member, 0, len(rows))
	for _, m := range rows {
		out = append(out, Member{UserID: m.UserID, Name: m.DisplayName, Avatar: m.AvatarUrl, JoinedAt: m.JoinedAt.Time, LeftAt: tptr(m.LeftAt)})
	}
	return out, nil
}

func (t *pgTx) UpsertMember(ctx Ctx, id, user string, at time.Time) error {
	return t.q.UpsertMember(ctx, sqlcgen.UpsertMemberParams{ChallengeID: id, UserID: user, At: ts(at)})
}

func (t *pgTx) MarkLeft(ctx Ctx, id, user string, at time.Time) (bool, error) {
	n, err := t.q.MarkMemberLeft(ctx, sqlcgen.MarkMemberLeftParams{ChallengeID: id, UserID: user, At: ts(at)})
	return n > 0, err
}

func (t *pgTx) DeleteMember(ctx Ctx, id, user string) error {
	return t.q.DeleteMember(ctx, sqlcgen.DeleteMemberParams{ChallengeID: id, UserID: user})
}

func (t *pgTx) Blocked(ctx Ctx, id, user string) (bool, error) {
	return t.q.BlockedWithAnyMember(ctx, sqlcgen.BlockedWithAnyMemberParams{ChallengeID: id, UserID: user})
}

func (t *pgTx) InsertPrompt(ctx Ctx, p Prompt) error {
	return t.q.InsertPrompt(ctx, sqlcgen.InsertPromptParams{ID: p.ID, ChallengeID: p.ChallengeID, UserID: p.UserID,
		WorkoutID: p.WorkoutID, PromptCode: p.Code, IssuedAt: ts(p.IssuedAt)})
}

func (t *pgTx) PromptForUpdate(ctx Ctx, id string) (Prompt, error) {
	p, err := t.q.GetPromptForUpdate(ctx, id)
	if err != nil {
		return Prompt{}, nf(err)
	}
	return Prompt{ID: p.ID, ChallengeID: p.ChallengeID, UserID: p.UserID, WorkoutID: p.WorkoutID, Code: p.PromptCode,
		IssuedAt: p.IssuedAt.Time, UsedAt: tptr(p.UsedAt)}, nil
}

func (t *pgTx) UsePrompt(ctx Ctx, id string, at time.Time) error {
	return t.q.UsePrompt(ctx, sqlcgen.UsePromptParams{ID: id, At: ts(at)})
}

func (t *pgTx) RecentPrompts(ctx Ctx, user string, since time.Time) (int, error) {
	n, err := t.q.CountRecentPrompts(ctx, sqlcgen.CountRecentPromptsParams{UserID: user, Since: ts(since)})
	return int(n), err
}

func (t *pgTx) InsertProof(ctx Ctx, p ProofRow) error {
	return t.q.InsertProof(ctx, sqlcgen.InsertProofParams{
		ID: p.ID, ChallengeID: p.ChallengeID, UserID: sp(p.UserID), WorkoutID: p.WorkoutID, PromptID: p.PromptID,
		PromptCode: p.PromptCode, IssuedAt: ts(p.IssuedAt), CapturedAt: ts(p.CapturedAt), StorageKey: sp(p.StorageKey),
		Dhash: int64(p.Hash), Source: p.Source, DupOf: sp(p.DupOf), Status: p.Status,
	})
}

func proofFrom(p sqlcgen.ChallengeProof) ProofRow {
	return ProofRow{
		Proof:       Proof{ID: p.ID, WorkoutID: p.WorkoutID, IssuedAt: p.IssuedAt.Time, CapturedAt: p.CapturedAt.Time, Status: p.Status},
		ChallengeID: p.ChallengeID, UserID: sv(p.UserID), PromptID: p.PromptID, PromptCode: p.PromptCode, StorageKey: sv(p.StorageKey),
		Hash: uint64(p.Dhash), Source: p.Source, DupOf: sv(p.DupOf),
	}
}

func (t *pgTx) GetProof(ctx Ctx, id string, forUpdate bool) (ProofRow, error) {
	var p sqlcgen.ChallengeProof
	var err error
	if forUpdate {
		p, err = t.q.GetProofForUpdate(ctx, id)
	} else {
		p, err = t.q.GetProof(ctx, id)
	}
	if err != nil {
		return ProofRow{}, nf(err)
	}
	return proofFrom(p), nil
}

func (t *pgTx) Proofs(ctx Ctx, id, viewer string) ([]ProofRow, error) {
	rows, err := t.q.ListProofsByChallenge(ctx, sqlcgen.ListProofsByChallengeParams{ChallengeID: id, ViewerID: viewer})
	if err != nil {
		return nil, err
	}
	out := make([]ProofRow, 0, len(rows))
	for _, p := range rows {
		r := proofFrom(sqlcgen.ChallengeProof{ID: p.ID, ChallengeID: p.ChallengeID, UserID: p.UserID, WorkoutID: p.WorkoutID,
			PromptID: p.PromptID, PromptCode: p.PromptCode, IssuedAt: p.IssuedAt, CapturedAt: p.CapturedAt,
			StorageKey: p.StorageKey, Dhash: p.Dhash, Source: p.Source, DupOf: p.DupOf, Status: p.Status})
		r.Flags, r.FlaggedByMe = int(p.Flags), p.FlaggedByMe
		out = append(out, r)
	}
	return out, nil
}

func (t *pgTx) NearestOwn(ctx Ctx, user string, hash uint64) (string, int, bool, error) {
	r, err := t.q.NearestOwnProof(ctx, sqlcgen.NearestOwnProofParams{UserID: &user, Dhash: int64(hash)})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", 0, false, nil
	}
	return r.ID, int(r.Dist), err == nil, err
}

func (t *pgTx) NearestGroup(ctx Ctx, id, user string, hash uint64) (string, int, bool, error) {
	r, err := t.q.NearestGroupProof(ctx, sqlcgen.NearestGroupProofParams{ChallengeID: id, UserID: &user, Dhash: int64(hash)})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", 0, false, nil
	}
	return r.ID, int(r.Dist), err == nil, err
}

func (t *pgTx) SetProofInvalid(ctx Ctx, id string, at time.Time) (bool, error) {
	n, err := t.q.SetProofInvalid(ctx, sqlcgen.SetProofInvalidParams{ID: id, At: ts(at)})
	return n > 0, err
}

func (t *pgTx) InsertFlag(ctx Ctx, proof, voter string, at time.Time) error {
	return t.q.InsertFlag(ctx, sqlcgen.InsertFlagParams{ProofID: proof, VoterID: voter, At: ts(at)})
}

func (t *pgTx) DeleteFlag(ctx Ctx, proof, voter string) error {
	return t.q.DeleteFlag(ctx, sqlcgen.DeleteFlagParams{ProofID: proof, VoterID: voter})
}

func (t *pgTx) CountFlags(ctx Ctx, id, proof string) (int, error) {
	n, err := t.q.CountActiveFlags(ctx, sqlcgen.CountActiveFlagsParams{ChallengeID: id, ProofID: proof})
	return int(n), err
}

func (t *pgTx) Days(ctx Ctx, id string) ([]UserDay, error) {
	rows, err := t.q.ListDays(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]UserDay, 0, len(rows))
	for _, r := range rows {
		sets := 0
		if r.Sets != nil {
			sets = int(*r.Sets)
		}
		out = append(out, UserDay{UserID: r.UserID, DayRow: DayRow{Day: dayOf(r.Day), Result: r.Result, Final: r.Final,
			WorkoutID: sv(r.WorkoutID), Sets: sets, ProofID: sv(r.ProofID)}})
	}
	return out, nil
}

func (t *pgTx) UpsertDay(ctx Ctx, id, user string, row DayRow, at time.Time) error {
	var sets *int32
	if row.WorkoutID != "" {
		v := int32(row.Sets)
		sets = &v
	}
	return t.q.UpsertDay(ctx, sqlcgen.UpsertDayParams{ChallengeID: id, UserID: user, Day: date(row.Day), Result: row.Result,
		Final: row.Final, WorkoutID: sp(row.WorkoutID), Sets: sets, ProofID: sp(row.ProofID), JudgedAt: ts(at)})
}

func (t *pgTx) DeleteDay(ctx Ctx, id, user string, day Day) error {
	return t.q.DeleteDay(ctx, sqlcgen.DeleteDayParams{ChallengeID: id, UserID: user, Day: date(day)})
}

func (t *pgTx) JudgeWorkouts(ctx Ctx, users []string, from, to time.Time) ([]UserWorkout, error) {
	if len(users) == 0 {
		return nil, nil
	}
	rows, err := t.q.ListJudgeWorkouts(ctx, sqlcgen.ListJudgeWorkoutsParams{UserIds: users, FromMs: from.UnixMilli(), ToMs: to.UnixMilli()})
	if err != nil {
		return nil, err
	}
	out := make([]UserWorkout, 0, len(rows))
	for _, r := range rows {
		out = append(out, UserWorkout{UserID: r.UserID, Workout: Workout{ID: r.RecordID, StartedAt: time.UnixMilli(r.StartedMs),
			CompletedAt: time.UnixMilli(r.CompletedMs), Sets: int(r.Sets)}})
	}
	return out, nil
}

func (t *pgTx) InsertDebt(ctx Ctx, id, user string, day Day) error {
	return t.q.InsertDebt(ctx, sqlcgen.InsertDebtParams{ChallengeID: id, UserID: user, Day: date(day)})
}

func (t *pgTx) DeleteDebt(ctx Ctx, id, user string, day Day) error {
	return t.q.DeleteDebt(ctx, sqlcgen.DeleteDebtParams{ChallengeID: id, UserID: user, Day: date(day)})
}

func (t *pgTx) Debts(ctx Ctx, id string) ([]DebtRow, error) {
	rows, err := t.q.ListDebts(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]DebtRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, DebtRow{UserID: r.UserID, Day: dayOf(r.Day), PaidAt: tptr(r.PaidAt)})
	}
	return out, nil
}

func (t *pgTx) SetDebtPaid(ctx Ctx, id, user string, day Day, paidAt *time.Time, by string) (bool, error) {
	var b *string
	if paidAt != nil {
		b = sp(by)
	}
	n, err := t.q.SetDebtPaid(ctx, sqlcgen.SetDebtPaidParams{ChallengeID: id, UserID: user, Day: date(day), PaidAt: tsp(paidAt), PaidBy: b})
	return n > 0, err
}

func (t *pgTx) InsertNotice(ctx Ctx, id, user, kind, ref string) (bool, error) {
	rows, err := t.q.InsertNotice(ctx, sqlcgen.InsertNoticeParams{ChallengeID: id, UserID: user, Kind: kind, Ref: ref})
	return len(rows) > 0, err
}

func (t *pgTx) PurgeDue(ctx Ctx, before time.Time) ([]string, error) {
	return t.q.ListPurgeDue(ctx, ts(before))
}

func (t *pgTx) PurgeKeys(ctx Ctx, id string) ([]KeyRow, error) {
	rows, err := t.q.ListPurgeKeys(ctx, id)
	if err != nil {
		return nil, err
	}
	out := make([]KeyRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, KeyRow{ID: r.ID, Key: r.StorageKey})
	}
	return out, nil
}

func (t *pgTx) ClearKey(ctx Ctx, proof string) error { return t.q.ClearProofKey(ctx, proof) }

func (t *pgTx) CountKeys(ctx Ctx, id string) (int, error) {
	n, err := t.q.CountProofKeys(ctx, id)
	return int(n), err
}

func (t *pgTx) MarkPurged(ctx Ctx, id string, at time.Time) error {
	return t.q.MarkPhotosPurged(ctx, sqlcgen.MarkPhotosPurgedParams{ID: id, At: ts(at)})
}

func (t *pgTx) DeletePrompts(ctx Ctx, id string) error { return t.q.DeleteOldPrompts(ctx, id) }

func (t *pgTx) OrphanProofs(ctx Ctx) ([]KeyRow, error) {
	rows, err := t.q.ListOrphanProofs(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]KeyRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, KeyRow{ID: r.ID, Key: r.StorageKey})
	}
	return out, nil
}

func (t *pgTx) DeleteProof(ctx Ctx, id string) error { return t.q.DeleteProof(ctx, id) }
