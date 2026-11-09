// 코치 루틴 저장소 (SPEC-050 P3b) — coaching_routines 와 회원 sync_records 를 한 트랜잭션으로 쓴다.
package coaching

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

func (r *pgRepo) ExerciseCatalogRows(ctx context.Context, ids []string) (map[string]CatalogRow, error) {
	if ids == nil {
		ids = []string{}
	}
	rows, err := r.q.ListExercisesByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[string]CatalogRow, len(rows))
	for _, row := range rows {
		out[row.ID] = CatalogRow{NameKo: row.NameKo, IsCustom: row.IsCustom, IsArchived: row.IsArchived}
	}
	return out, nil
}

func (r *pgRepo) CustomExerciseName(ctx context.Context, userID, exerciseID string) (string, error) {
	name, err := r.q.GetUserCustomExerciseName(ctx, sqlcgen.GetUserCustomExerciseNameParams{UserID: userID, RecordID: exerciseID})
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return name, err
}

func (r *pgRepo) CountRoutineSendsSince(ctx context.Context, trainerID string, since time.Time) (int, error) {
	n, err := r.q.CountRoutineSendsSince(ctx, sqlcgen.CountRoutineSendsSinceParams{ActorID: trainerID, Since: tsAt(since)})
	return int(n), err
}

func (r *pgRepo) HasRecentRoutineUpdate(ctx context.Context, grantID, coachingRoutineID string, since time.Time) (bool, error) {
	return r.q.HasRecentRoutineUpdate(ctx, sqlcgen.HasRecentRoutineUpdateParams{
		GrantID: grantID, CoachingRoutineID: coachingRoutineID, Since: tsAt(since),
	})
}

func sentFrom(row sqlcgen.CoachingRoutine) SentRoutine {
	return SentRoutine{
		ID: row.ID, SourceRoutineID: row.SourceRoutineID, MemberRoutineID: row.MemberRoutineID,
		MemberID: row.MemberID, Name: row.Name, Status: row.Status, SentAt: tsOf(row.SentAt),
	}
}

// lineParentOf — 회원 줄 레코드의 routine_id.
func lineParentOf(payload []byte) string {
	var obj struct {
		RoutineID string `json:"routine_id"`
	}
	_ = json.Unmarshal(payload, &obj)
	return obj.RoutineID
}

// SendRoutineTx — 머리말(routines.go ③)의 한 트랜잭션.
func (r *pgRepo) SendRoutineTx(ctx context.Context, p SendRoutinePlan) (SendRoutineOutcome, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return SendRoutineOutcome{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	// ① 관계를 잠그고 다시 본다 — 그 사이 해지·범위 끔이면 쓰지 않는다.
	gr, err := q.LockGrantByPair(ctx, sqlcgen.LockGrantByPairParams{TrainerID: p.TrainerID, MemberID: p.MemberID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return SendRoutineOutcome{}, errs.New(errs.Forbidden, msgNotActive)
		}
		return SendRoutineOutcome{}, err
	}
	g := grantFrom(gr)
	if g.Status != StatusActive {
		return SendRoutineOutcome{}, errs.New(errs.Forbidden, msgNotActive)
	}
	if !g.Scope[ScopeRoutineEdit] {
		return SendRoutineOutcome{}, errs.New(errs.Forbidden, msgNoRoutineScope)
	}

	// ② 같은 초안의 활성 행(coaching_routines — grant 잠금이 같은 관계의 보내기를 줄 세운다).
	var cur *sqlcgen.CoachingRoutine
	if row, err := q.GetActiveCoachingRoutine(ctx, sqlcgen.GetActiveCoachingRoutineParams{
		TrainerID: p.TrainerID, MemberID: p.MemberID, SourceRoutineID: p.SourceRoutineID,
	}); err == nil {
		cur = &row
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return SendRoutineOutcome{}, err
	}

	// ③ 회원 행을 한 번에 잠근다(리뷰 M-2·M-3) — 지금 루틴(있으면)·새 루틴 후보의 루틴 행 + 자식 줄 + 새로 쓸 줄 id.
	//    Push(LockSyncRecords)와 같은 순서(collection, record_id)로 잡고, 살아 있나·자식 줄은 잠근 뒤의 값으로 본다 —
	//    그 사이 회원이 지웠으면 되살리지 않고 새 crid 로 새로 보낸다(SPEC-050: 「회원 행이 deleted 면 새 crid」).
	crids := []string{p.NewCRID}
	if cur != nil {
		crids = append(crids, cur.ID)
	}
	routineIDs := make([]string, 0, len(crids))
	lockLines := make([]string, 0, len(crids)*len(p.Lines))
	for _, c := range crids {
		routineIDs = append(routineIDs, memberRoutineID(c))
		for _, l := range p.Lines {
			lockLines = append(lockLines, memberLineID(c, l.DraftID))
		}
	}
	locked, err := q.LockMemberRoutineRows(ctx, sqlcgen.LockMemberRoutineRowsParams{
		UserID: p.MemberID, RoutineIds: routineIDs, LineIds: lockLines,
	})
	if err != nil {
		return SendRoutineOutcome{}, err
	}

	var existing *sqlcgen.CoachingRoutine
	if cur != nil {
		rid := memberRoutineID(cur.ID)
		for _, row := range locked {
			if row.Collection == "routines" && row.RecordID == rid {
				if !row.Deleted && coachOriginOf(rid, row.Payload) == originCoach {
					existing = cur
				}
				break
			}
		}
		if existing == nil {
			if err := q.EndCoachingRoutine(ctx, cur.ID); err != nil {
				return SendRoutineOutcome{}, err
			}
		}
	}

	crid := p.NewCRID
	var sortOrder int64
	var have []string
	if existing != nil {
		crid = existing.ID
		// 실제 자식 줄(지우지 않은 것) — 잠근 결과에서 고른다(따로 읽으면 잠그기 전 값이다)
		rid := memberRoutineID(crid)
		for _, row := range locked {
			if row.Collection == "routine_exercises" && !row.Deleted && lineParentOf(row.Payload) == rid {
				have = append(have, row.RecordID)
			}
		}
	} else {
		maxSort, err := q.MaxMemberRoutineSortOrder(ctx, p.MemberID)
		if err != nil {
			return SendRoutineOutcome{}, err
		}
		sortOrder = maxSort + 1
	}

	// ④ 회원 sync 레코드 — 쓰기 → 빠진 줄 지우기.
	writes, lineIDs, removed := buildCoachRoutineRecords(p, crid, existing == nil, sortOrder, have)
	ids := make([]string, len(writes))
	cols := make([]string, len(writes))
	recIDs := make([]string, len(writes))
	payloads := make([][]byte, len(writes))
	for i, w := range writes {
		ids[i], cols[i], recIDs[i], payloads[i] = p.RowID(), w.Collection, w.RecordID, w.Payload
	}
	if err := q.UpsertMemberSyncRecords(ctx, sqlcgen.UpsertMemberSyncRecordsParams{
		Ids: ids, UserID: p.MemberID, Collections: cols, RecordIds: recIDs, Payloads: payloads,
	}); err != nil {
		return SendRoutineOutcome{}, err
	}
	if len(removed) > 0 {
		if err := q.MarkMemberSyncDeleted(ctx, sqlcgen.MarkMemberSyncDeletedParams{
			UserID: p.MemberID, Collection: "routine_exercises", RecordIds: removed,
		}); err != nil {
			return SendRoutineOutcome{}, err
		}
	}

	// ⑤ coaching_routines(보낸 때의 이름도 · 0034).
	var row sqlcgen.CoachingRoutine
	if existing != nil {
		row, err = q.UpdateCoachingRoutineSent(ctx, sqlcgen.UpdateCoachingRoutineSentParams{ID: crid, LineIds: lineIDs, Name: p.Name})
	} else {
		row, err = q.InsertCoachingRoutine(ctx, sqlcgen.InsertCoachingRoutineParams{
			ID: crid, GrantID: g.ID, TrainerID: p.TrainerID, MemberID: p.MemberID,
			SourceRoutineID: p.SourceRoutineID, MemberRoutineID: memberRoutineID(crid), LineIds: lineIDs, Name: p.Name,
		})
	}
	if err != nil {
		if isUnique(err, "coaching_routines_active_source") {
			return SendRoutineOutcome{}, errs.New(errs.Conflict, msgTryLater) // 같은 초안을 동시에 두 번 — 먼저 들어간 쪽이 산다
		}
		return SendRoutineOutcome{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SendRoutineOutcome{}, err
	}
	return SendRoutineOutcome{Routine: sentFrom(row), GrantID: g.ID, Created: existing == nil}, nil
}

func (r *pgRepo) ListSentRoutines(ctx context.Context, trainerID, memberID string) ([]SentRoutine, error) {
	rows, err := r.q.ListSentRoutines(ctx, sqlcgen.ListSentRoutinesParams{TrainerID: trainerID, MemberID: memberID})
	if err != nil {
		return nil, err
	}
	out := make([]SentRoutine, 0, len(rows))
	for _, row := range rows {
		out = append(out, SentRoutine{
			ID: row.ID, SourceRoutineID: row.SourceRoutineID, MemberRoutineID: row.MemberRoutineID,
			MemberID: row.MemberID, Name: row.Name, Status: row.Status, SentAt: tsOf(row.SentAt),
		})
	}
	return out, nil
}
