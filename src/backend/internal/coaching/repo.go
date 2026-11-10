// @plm SRS-048  코칭 저장소
//
// 권한(coaching_grants)·감사(coaching_audits)와, 회원이 동기해 둔 레코드(sync_records)를 읽는다.
// **회원 기록을 복사해 두지 않는다** — 복사하면 해지한 뒤에도 남는다.
package coaching

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type pgRepo struct {
	// 트랜잭션용(요약 하루 상한 잠금 · CS-5). 나머지는 q 로 충분하다.
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo { return &pgRepo{pool: pool, q: sqlcgen.New(pool)} }

// tsOf는 nullable timestamptz를 시각으로 옮긴다. 값이 없으면 제로 시각(=아직 없음).
func tsOf(t pgtype.Timestamptz) time.Time {
	if !t.Valid {
		return time.Time{}
	}
	return t.Time
}

func text(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (r *pgRepo) SearchTrainers(ctx context.Context, viewerID, query string) ([]Peer, error) {
	rows, err := r.q.SearchTrainers(ctx, sqlcgen.SearchTrainersParams{ViewerID: viewerID, Query: query})
	if err != nil {
		return nil, err
	}
	out := make([]Peer, 0, len(rows))
	for _, u := range rows {
		out = append(out, visibleCard(Peer{
			ID: u.ID, DisplayName: text(u.DisplayName), AvatarURL: text(u.AvatarUrl),
			ExperienceLevel: text(u.ExperienceLevel), TrainerIntent: u.TrainerIntent,
			CoachBio: u.CoachBio, CoachTags: tags(u.CoachTags), IsCoach: u.IsCoach,
		}))
	}
	return out, nil
}

// visibleCard — 코치 소개·태그가 보이는 곳 규칙 하나(SPEC-052 · REV-105 U7b): 노출(trainer_intent)을 켠 사람만.
// 노출을 끄면 코드 카드·범위 시트 머리·연결 줄·검색 어디서도 소개·태그를 보내지 않는다(저장된 값은 그대로 — 다시 켜면 보인다).
func visibleCard(p Peer) Peer {
	if !p.TrainerIntent {
		p.CoachBio = ""
		p.CoachTags = []string{}
	}
	return p
}

func (r *pgRepo) TrainerEligible(ctx context.Context, trainerID string) (bool, error) {
	// [원본] u, err := r.q.GetUserByID(ctx, trainerID) … return u.TrainerIntent, nil
	// [개선] SPEC-052 — 코치 역할이 없다. 계정이 있으면 true(없으면 NotFound).
	if _, err := r.q.GetUserByID(ctx, trainerID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, errs.New(errs.NotFound, "trainer not found")
		}
		return false, err
	}
	return true, nil
}

func (r *pgRepo) UserExists(ctx context.Context, userID string) (bool, error) {
	if _, err := r.q.GetUserByID(ctx, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (r *pgRepo) Blocked(ctx context.Context, a, b string) (bool, error) {
	return r.q.IsBlockedEitherWay(ctx, sqlcgen.IsBlockedEitherWayParams{A: a, B: b})
}

// grantFrom은 행을 도메인 값으로 옮긴다. **보는 사람이 없는 형태**(RoleOfMe·Peer 비움)라
// 규칙 검사에만 쓴다 — 화면에 나가는 것은 ListGrants가 만든다.
func grantFrom(row sqlcgen.CoachingGrant) Grant {
	return Grant{
		ID: row.ID, TrainerID: row.TrainerID, MemberID: row.MemberID,
		Status: row.Status, Scope: parseScope(row.Scope), RequestedBy: row.RequestedBy,
		ConsentAt: tsOf(row.ConsentAt), CreatedAt: tsOf(row.CreatedAt), RequestNote: row.RequestNote,
	}
}

func (r *pgRepo) GetGrant(ctx context.Context, grantID string) (Grant, error) {
	row, err := r.q.GetGrantByID(ctx, grantID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Grant{}, errs.New(errs.NotFound, "grant not found")
		}
		return Grant{}, err
	}
	return grantFrom(row), nil
}

func (r *pgRepo) GetGrantByPair(ctx context.Context, trainerID, memberID string) (Grant, error) {
	row, err := r.q.GetGrantByPair(ctx, sqlcgen.GetGrantByPairParams{TrainerID: trainerID, MemberID: memberID})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Grant{}, errs.New(errs.NotFound, "grant not found")
		}
		return Grant{}, err
	}
	return grantFrom(row), nil
}

// ListGrants는 **보는 사람 기준**으로 채운 목록을 돌려준다 —
// 같은 행을 트레이너와 회원이 함께 보므로, 상대가 누구인지는 보는 쪽에 달렸다.
func (r *pgRepo) ListGrants(ctx context.Context, viewerID string) ([]Grant, error) {
	rows, err := r.q.ListGrantsForUser(ctx, viewerID)
	if err != nil {
		return nil, err
	}
	out := make([]Grant, 0, len(rows))
	for _, row := range rows {
		g := Grant{
			ID: row.ID, TrainerID: row.TrainerID, MemberID: row.MemberID,
			Status: row.Status, Scope: parseScope(row.Scope), RequestedBy: row.RequestedBy,
			ConsentAt: tsOf(row.ConsentAt), CreatedAt: tsOf(row.CreatedAt), RequestNote: row.RequestNote,
		}
		if row.TrainerID == viewerID {
			g.RoleOfMe = SideTrainer
			g.Peer = visibleCard(Peer{
				ID: row.MemberID, DisplayName: text(row.MemberName), AvatarURL: text(row.MemberAvatar),
				ExperienceLevel: text(row.MemberLevel), TrainerIntent: row.MemberIntentFlag,
				CoachBio: row.MemberBio, CoachTags: tags(row.MemberTags), IsCoach: row.MemberIsCoach,
			})
		} else {
			g.RoleOfMe = SideMember
			g.Peer = visibleCard(Peer{
				ID: row.TrainerID, DisplayName: text(row.TrainerName), AvatarURL: text(row.TrainerAvatar),
				ExperienceLevel: text(row.TrainerLevel), TrainerIntent: row.TrainerIntentFlag,
				CoachBio: row.TrainerBio, CoachTags: tags(row.TrainerTags), IsCoach: row.TrainerIsCoach,
			})
		}
		out = append(out, g)
	}
	return out, nil
}

// [원본] v1 — 범위·메시지 없이 만들었다(SPEC-050 부터 CreateGrantWithScope).
//
//	func (r *pgRepo) CreateGrant(ctx context.Context, id, trainerID, memberID, requestedBy string) (Grant, error) {
//		row, err := r.q.CreateGrant(ctx, sqlcgen.CreateGrantParams{
//			ID: id, TrainerID: trainerID, MemberID: memberID, RequestedBy: requestedBy,
//		})
//		...
//	}
//
// [개선]
func (r *pgRepo) CreateGrant(ctx context.Context, id, trainerID, memberID, requestedBy string, scope []byte, note string) (Grant, error) {
	row, err := r.q.CreateGrantWithScope(ctx, sqlcgen.CreateGrantWithScopeParams{
		ID: id, TrainerID: trainerID, MemberID: memberID, RequestedBy: requestedBy,
		Scope: jsonOr(scope, DefaultScope().encode()), RequestNote: note,
	})
	if err != nil {
		// 같은 쌍이 동시에 두 번 만들어졌다(UNIQUE(trainer_id, member_id)) — 둘째는 「이미 있다」.
		if isUnique(err, "") {
			return Grant{}, errs.New(errs.Conflict, msgRequestExists)
		}
		return Grant{}, err
	}
	return grantFrom(row), nil
}

// [원본] v1 — 옛 범위가 되살아났다(ReopenGrant 쿼리).
// [개선] revoked 행만, 범위·메시지를 덮어 되살린다. 그 사이 상태가 바뀌었으면 0행 → Conflict.
func (r *pgRepo) ReopenGrant(ctx context.Context, grantID, requestedBy string, scope []byte, note string) (Grant, error) {
	row, err := r.q.ReopenGrantWithScope(ctx, sqlcgen.ReopenGrantWithScopeParams{
		ID: grantID, RequestedBy: requestedBy, Scope: jsonOr(scope, DefaultScope().encode()), RequestNote: note,
	})
	if err != nil {
		return Grant{}, stateErr(err)
	}
	return grantFrom(row), nil
}

// [원본] v1 — 상태 조건 없이 active 로 바꿨다(AcceptGrant 쿼리).
// [개선] pending 일 때만 · 회원 범위 저장 · 둘째 코치는 one_coach 인덱스가 막는다.
func (r *pgRepo) AcceptGrant(ctx context.Context, grantID string, scope []byte) (Grant, error) {
	row, err := r.q.AcceptPendingGrant(ctx, sqlcgen.AcceptPendingGrantParams{
		ID: grantID, SetScope: scope != nil, Scope: jsonOr(scope, []byte("{}")),
	})
	if err != nil {
		return Grant{}, stateErr(err)
	}
	return grantFrom(row), nil
}

func (r *pgRepo) UpdateScope(ctx context.Context, grantID string, scope []byte) (Grant, error) {
	row, err := r.q.UpdateActiveGrantScope(ctx, sqlcgen.UpdateActiveGrantScopeParams{ID: grantID, Scope: scope})
	if err != nil {
		return Grant{}, stateErr(err)
	}
	return grantFrom(row), nil
}

// RevokeGrantAndEndRoutines — grant FOR UPDATE → revoked → 회원 sync 루틴 origin coach_ended → 그 관계의 활성 코치 루틴 ended
// (한 트랜잭션 · SendRoutineTx 와 같은 grant 잠금으로 줄을 선다).
func (r *pgRepo) RevokeGrantAndEndRoutines(ctx context.Context, grantID string) (Grant, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Grant{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	if _, err := q.LockGrant(ctx, grantID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Grant{}, errs.New(errs.NotFound, "grant not found")
		}
		return Grant{}, err
	}
	row, err := q.RevokeLiveGrant(ctx, grantID)
	if err != nil {
		return Grant{}, stateErr(err)
	}
	// [개선] P3b — 회원 기기의 코치 루틴을 「코칭 끝남」으로(한 칸 패치 · 이름·처방·폴더는 그대로 · 회원 것이 된다).
	//   coaching_routines 를 끝내기 **전에** — 패치가 활성 행으로 회원 루틴을 찾는다.
	if _, err := q.MarkCoachRoutinesEnded(ctx, sqlcgen.MarkCoachRoutinesEndedParams{
		GrantID: grantID, NowMs: time.Now().UnixMilli(),
	}); err != nil {
		return Grant{}, err
	}
	if _, err := q.EndActiveCoachingRoutines(ctx, grantID); err != nil {
		return Grant{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Grant{}, err
	}
	return grantFrom(row), nil
}

func (r *pgRepo) HasOtherActiveCoach(ctx context.Context, memberID, exceptTrainerID string) (bool, error) {
	return r.q.HasOtherActiveCoach(ctx, sqlcgen.HasOtherActiveCoachParams{MemberID: memberID, ExceptTrainerID: exceptTrainerID})
}

func (r *pgRepo) ActivateGrantFromInvite(ctx context.Context, id, trainerID, memberID string, scope []byte) (Grant, error) {
	row, err := r.q.ActivateGrantFromInvite(ctx, sqlcgen.ActivateGrantFromInviteParams{
		ID: id, TrainerID: trainerID, MemberID: memberID, Scope: jsonOr(scope, DefaultScope().encode()),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Grant{}, errs.New(errs.Conflict, msgAlreadyConnected) // 같은 쌍이 이미 활성
		}
		return Grant{}, stateErr(err)
	}
	return grantFrom(row), nil
}

func (r *pgRepo) GetPeer(ctx context.Context, userID string) (Peer, error) {
	u, err := r.q.GetCoachPeer(ctx, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Peer{}, errs.New(errs.NotFound, "user not found")
		}
		return Peer{}, err
	}
	return visibleCard(Peer{
		ID: u.ID, DisplayName: text(u.DisplayName), AvatarURL: text(u.AvatarUrl),
		ExperienceLevel: text(u.ExperienceLevel), TrainerIntent: u.TrainerIntent,
		CoachBio: u.CoachBio, CoachTags: tags(u.CoachTags), IsCoach: u.IsCoach,
	}), nil
}

// ── 초대 코드 ──

func inviteFrom(row sqlcgen.CoachingInvite) Invite {
	return Invite{
		ID: row.ID, Code: row.Code, TrainerID: row.TrainerID,
		CreatedAt: tsOf(row.CreatedAt), ExpiresAt: tsOf(row.ExpiresAt),
	}
}

// CreateInvite — 한 트랜잭션: 그 코치의 옛 코드 회수 → 넣기. 다른 코치 코드와 겹치면 ErrInviteCodeTaken.
func (r *pgRepo) CreateInvite(ctx context.Context, id, trainerID, code string, expiresAt time.Time) (Invite, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Invite{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	if err := q.RevokeTrainerInvites(ctx, trainerID); err != nil {
		return Invite{}, err
	}
	row, err := q.InsertInvite(ctx, sqlcgen.InsertInviteParams{
		ID: id, Code: code, TrainerID: trainerID, ExpiresAt: tsAt(expiresAt),
	})
	if err != nil {
		if isUnique(err, "coaching_invites_code_live") {
			return Invite{}, ErrInviteCodeTaken
		}
		if isUnique(err, "coaching_invites_trainer_live") {
			// 같은 코치가 동시에 두 번 만들었다 — 먼저 들어간 쪽이 산다(화면은 다시 읽으면 된다).
			return Invite{}, errs.New(errs.Conflict, msgTryLater)
		}
		return Invite{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Invite{}, err
	}
	return inviteFrom(row), nil
}

func (r *pgRepo) GetLiveInviteByCode(ctx context.Context, code string) (Invite, error) {
	row, err := r.q.GetLiveInviteByCode(ctx, code)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Invite{}, errs.New(errs.NotFound, msgInviteNotFound)
		}
		return Invite{}, err
	}
	return inviteFrom(row), nil
}

func (r *pgRepo) GetLiveInviteByTrainer(ctx context.Context, trainerID string) (Invite, error) {
	row, err := r.q.GetLiveInviteByTrainer(ctx, trainerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Invite{}, errs.New(errs.NotFound, msgInviteNotFound)
		}
		return Invite{}, err
	}
	return inviteFrom(row), nil
}

func (r *pgRepo) RevokeInvite(ctx context.Context, id string) error {
	return r.q.RevokeInvite(ctx, id)
}

func (r *pgRepo) ListMemberBodyweightIn(ctx context.Context, memberID string, fromMs, toMs int64, b *ReadBudget) ([]MemberRecord, error) {
	return pageRecords(bodyRecordCollection, b, func(after string) ([]MemberRecord, error) {
		rows, err := r.q.ListMemberBodyweightIn(ctx, sqlcgen.ListMemberBodyweightInParams{
			MemberID: memberID, AfterID: after, FromMs: fromMs, ToMs: toMs, Lim: memberRecordsPage,
		})
		out := make([]MemberRecord, 0, len(rows))
		for _, row := range rows {
			out = append(out, MemberRecord{RecordID: row.RecordID, Payload: row.Payload})
		}
		return out, err
	})
}

// isUnique — 23505 이고 (constraint 가 비어 있지 않으면) 그 제약 이름일 때.
func isUnique(err error, constraint string) bool {
	var pe *pgconn.PgError
	if !errors.As(err, &pe) || pe.Code != "23505" {
		return false
	}
	return constraint == "" || pe.ConstraintName == constraint
}

// stateErr — 상태 조건 쿼리의 0행·코치 한 명 위반을 Conflict 로 옮긴다(문구는 화면에 그대로 보인다).
func stateErr(err error) error {
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		return errs.New(errs.Conflict, msgStateChanged)
	case isUnique(err, "coaching_grants_one_coach"):
		return errs.New(errs.Conflict, msgOneCoach)
	}
	return err
}

// jsonOr — 비었으면 기본값(jsonb 칸에 NULL 을 넘기지 않는다).
func jsonOr(b, fallback []byte) []byte {
	if len(b) == 0 {
		return fallback
	}
	return b
}

// tags — nil 대신 빈 슬라이스(proto·JSON 이 null 을 보지 않게).
func tags(t []string) []string {
	if t == nil {
		return []string{}
	}
	return t
}

func (r *pgRepo) RevokeGrant(ctx context.Context, grantID string) (Grant, error) {
	row, err := r.q.RevokeGrant(ctx, grantID)
	if err != nil {
		return Grant{}, err
	}
	return grantFrom(row), nil
}

// grantID 가 비면 관계 없는 행동(invite_create · 0033)이라 NULL 로 남긴다.
func (r *pgRepo) Audit(ctx context.Context, id, grantID, actorID, action string, detail []byte) error {
	var gid *string
	if grantID != "" {
		gid = &grantID
	}
	return r.q.CreateAudit(ctx, sqlcgen.CreateAuditParams{
		ID: id, GrantID: gid, ActorID: actorID, Action: action, Detail: detail,
	})
}

func (r *pgRepo) AuditOnce(ctx context.Context, id, grantID, actorID, action string, detail []byte, since time.Time, matchDetail bool) error {
	_, err := r.q.CreateAuditOnce(ctx, sqlcgen.CreateAuditOnceParams{
		ID: id, GrantID: grantID, ActorID: actorID, Action: action, Detail: detail,
		Since: tsAt(since), MatchDetail: matchDetail,
	})
	return err
}

func (r *pgRepo) ListAudit(ctx context.Context, grantID string) ([]AuditEntry, error) {
	rows, err := r.q.ListAudit(ctx, &grantID)
	if err != nil {
		return nil, err
	}
	out := make([]AuditEntry, 0, len(rows))
	for _, a := range rows {
		out = append(out, AuditEntry{
			ID: a.ID, ActorID: a.ActorID, Action: a.Action, CreatedAt: tsOf(a.CreatedAt),
		})
	}
	return out, nil
}

func (r *pgRepo) ListMemberRecords(ctx context.Context, memberID string, collections []string) ([]MemberRecord, error) {
	rows, err := r.q.ListMemberRecords(ctx, sqlcgen.ListMemberRecordsParams{
		MemberID: memberID, Collections: collections,
	})
	if err != nil {
		return nil, err
	}
	out := make([]MemberRecord, 0, len(rows))
	for _, row := range rows {
		out = append(out, MemberRecord{Collection: row.Collection, RecordID: row.RecordID, Payload: row.Payload})
	}
	return out, nil
}

// ── GetMemberRecords 의 기간·부모 id 조회(CS-4) ─────────────────────────────
// 모두 record_id 키셋으로 memberRecordsPage 개씩 읽고, 읽은 payload 바이트를 budget 에서 뺀다 —
// 넘으면 다음 페이지를 읽지 않고 ResourceExhausted 로 멈춘다(전 이력을 메모리에 올리지 않는다).

const memberRecordsPage = 500

func pageRecords(collection string, b *ReadBudget, fetch func(after string) ([]MemberRecord, error)) ([]MemberRecord, error) {
	var out []MemberRecord
	after := ""
	for {
		page, err := fetch(after)
		if err != nil {
			return nil, err
		}
		for i := range page {
			page[i].Collection = collection
			if err := b.Take(len(page[i].Payload)); err != nil {
				return nil, err
			}
		}
		out = append(out, page...)
		if len(page) < memberRecordsPage {
			return out, nil
		}
		after = page[len(page)-1].RecordID
	}
}

func (r *pgRepo) ListMemberWorkoutsStartedIn(ctx context.Context, memberID string, fromMs, toMs int64, b *ReadBudget) ([]MemberRecord, error) {
	return pageRecords("workouts", b, func(after string) ([]MemberRecord, error) {
		rows, err := r.q.ListMemberWorkoutsStartedIn(ctx, sqlcgen.ListMemberWorkoutsStartedInParams{
			MemberID: memberID, AfterID: after, FromMs: fromMs, ToMs: toMs, Lim: memberRecordsPage,
		})
		out := make([]MemberRecord, 0, len(rows))
		for _, row := range rows {
			out = append(out, MemberRecord{RecordID: row.RecordID, Payload: row.Payload})
		}
		return out, err
	})
}

func (r *pgRepo) ListMemberRecordsByParent(ctx context.Context, memberID, collection, parentField string, parentIDs []string, b *ReadBudget) ([]MemberRecord, error) {
	return pageRecords(collection, b, func(after string) ([]MemberRecord, error) {
		rows, err := r.q.ListMemberRecordsByParent(ctx, sqlcgen.ListMemberRecordsByParentParams{
			MemberID: memberID, Collection: collection, AfterID: after,
			ParentField: parentField, ParentIds: parentIDs, Lim: memberRecordsPage,
		})
		out := make([]MemberRecord, 0, len(rows))
		for _, row := range rows {
			out = append(out, MemberRecord{RecordID: row.RecordID, Payload: row.Payload})
		}
		return out, err
	})
}

func (r *pgRepo) ListMemberRecordsByIDs(ctx context.Context, memberID, collection string, ids []string, b *ReadBudget) ([]MemberRecord, error) {
	return pageRecords(collection, b, func(after string) ([]MemberRecord, error) {
		rows, err := r.q.ListMemberRecordsByIDs(ctx, sqlcgen.ListMemberRecordsByIDsParams{
			MemberID: memberID, Collection: collection, AfterID: after, Ids: ids, Lim: memberRecordsPage,
		})
		out := make([]MemberRecord, 0, len(rows))
		for _, row := range rows {
			out = append(out, MemberRecord{RecordID: row.RecordID, Payload: row.Payload})
		}
		return out, err
	})
}

func (r *pgRepo) CatalogMeta(ctx context.Context) (map[string]CatalogExercise, error) {
	rows, err := r.q.ListCatalogExerciseMeta(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]CatalogExercise, len(rows))
	for _, row := range rows {
		m := ""
		if len(row.PrimaryMuscles) > 0 {
			m = row.PrimaryMuscles[0]
		}
		out[row.ID] = CatalogExercise{NameKo: row.NameKo, PrimaryMuscle: m}
	}
	return out, nil
}

func (r *pgRepo) GetMemberRecord(ctx context.Context, memberID, collection, recordID string) (string, []byte, error) {
	row, err := r.q.GetMemberRecord(ctx, sqlcgen.GetMemberRecordParams{
		UserID: memberID, Collection: collection, RecordID: recordID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil, errs.New(errs.NotFound, "routine exercise not found")
		}
		return "", nil, err
	}
	return row.ID, row.Payload, nil
}

func (r *pgRepo) UpdateMemberRecord(ctx context.Context, rowID string, payload []byte) error {
	return r.q.UpdateMemberRecord(ctx, sqlcgen.UpdateMemberRecordParams{ID: rowID, Payload: payload})
}

// parseScope는 열린 범위를 읽는다. **읽을 수 없으면 아무것도 열지 않는다** —
// 깨진 설정을 "전부 허용"으로 읽으면 그 순간 회원 기록이 무방비가 된다.
func parseScope(payload []byte) map[string]bool {
	out := map[string]bool{}
	if len(payload) == 0 {
		return out
	}
	var m map[string]any
	if err := json.Unmarshal(payload, &m); err != nil {
		return out
	}
	for k, v := range m {
		if b, ok := v.(bool); ok {
			out[k] = b
		}
	}
	return out
}

// ── 기간 성과 요약(progress_summaries · 0017) ─────────────────────────────────
// @plm SRS-080

func tsAt(t time.Time) pgtype.Timestamptz { return pgtype.Timestamptz{Time: t, Valid: true} }

func summaryFrom(row sqlcgen.ProgressSummary) ProgressSummary {
	return ProgressSummary{
		ID: row.ID, MemberID: row.MemberID, TrainerID: row.TrainerID,
		GrantConsentAt: tsOf(row.GrantConsentAt), PeriodStart: tsOf(row.PeriodStart), PeriodEnd: tsOf(row.PeriodEnd),
		SchemaVersion: int(row.SchemaVersion), Snapshot: row.Snapshot, ClientID: row.ClientID,
		MessageID: text(row.MessageID), CreatedAt: tsOf(row.CreatedAt),
	}
}

// InsertProgressSummary는 한 트랜잭션에서 회원 잠금 → 하루 개수 세기 → 넣기(CS-5). 동시 요청도 상한을 넘지 못한다.
func (r *pgRepo) InsertProgressSummary(ctx context.Context, s ProgressSummary, since time.Time, maxPerDay int) (ProgressSummary, InsertOutcome, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return ProgressSummary{}, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)
	if err := q.LockMemberSummaries(ctx, s.MemberID); err != nil {
		return ProgressSummary{}, 0, err
	}
	n, err := q.CountProgressSummariesByMemberSince(ctx, sqlcgen.CountProgressSummariesByMemberSinceParams{
		MemberID: s.MemberID, Since: tsAt(since),
	})
	if err != nil {
		return ProgressSummary{}, 0, err
	}
	if int(n) >= maxPerDay {
		return ProgressSummary{}, InsertOverCap, nil
	}
	row, err := q.InsertProgressSummary(ctx, sqlcgen.InsertProgressSummaryParams{
		ID: s.ID, MemberID: s.MemberID, TrainerID: s.TrainerID,
		GrantConsentAt: tsAt(s.GrantConsentAt), PeriodStart: tsAt(s.PeriodStart), PeriodEnd: tsAt(s.PeriodEnd),
		SchemaVersion: int32(s.SchemaVersion), Snapshot: s.Snapshot, ClientID: s.ClientID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProgressSummary{}, InsertExists, nil // ON CONFLICT DO NOTHING — 이미 있다
		}
		return ProgressSummary{}, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return ProgressSummary{}, 0, err
	}
	// 스냅샷은 DB 에서 다시 받지 않는다(CS-1) — 넣은 값 그대로다.
	s.ID, s.CreatedAt = row.ID, tsOf(row.CreatedAt)
	return s, InsertDone, nil
}

func (r *pgRepo) GetProgressSummaryByMemberClient(ctx context.Context, memberID, clientID string, snapshot []byte) (ProgressSummary, bool, error) {
	row, err := r.q.GetProgressSummaryByMemberClient(ctx, sqlcgen.GetProgressSummaryByMemberClientParams{
		MemberID: memberID, ClientID: clientID, Snapshot: snapshot,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProgressSummary{}, false, errs.New(errs.NotFound, "summary not found")
		}
		return ProgressSummary{}, false, err
	}
	// Snapshot 은 비워 둔다 — 비교는 SQL 이 했다(same_snapshot).
	return ProgressSummary{
		ID: row.ID, MemberID: row.MemberID, TrainerID: row.TrainerID,
		GrantConsentAt: tsOf(row.GrantConsentAt), PeriodStart: tsOf(row.PeriodStart), PeriodEnd: tsOf(row.PeriodEnd),
		SchemaVersion: int(row.SchemaVersion), ClientID: row.ClientID,
		MessageID: text(row.MessageID), CreatedAt: tsOf(row.CreatedAt),
	}, row.SameSnapshot, nil
}

func (r *pgRepo) GetProgressSummary(ctx context.Context, id string) (ProgressSummary, error) {
	row, err := r.q.GetProgressSummary(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ProgressSummary{}, errs.New(errs.NotFound, "summary not found")
		}
		return ProgressSummary{}, err
	}
	return summaryFrom(row), nil
}

func (r *pgRepo) SetProgressSummaryMessageID(ctx context.Context, id, messageID string) (bool, error) {
	n, err := r.q.SetProgressSummaryMessageID(ctx, sqlcgen.SetProgressSummaryMessageIDParams{
		ID: id, MessageID: messageID,
	})
	return n == 1, err
}

func (r *pgRepo) ListSentSummaries(ctx context.Context, memberID string, cursor *SummaryCursor, limit int) ([]SentSummary, error) {
	arg := sqlcgen.ListProgressSummariesByMemberParams{
		MemberID: memberID, Lim: int32(limit),
		// 커서가 없어도 타입이 맞는 값을 넣는다(has_cursor=false 면 쓰이지 않는다).
		CursorCreatedAt: tsAt(time.Unix(0, 0)),
	}
	if cursor != nil {
		arg.HasCursor = true
		arg.CursorCreatedAt = tsAt(cursor.CreatedAt)
		arg.CursorID = cursor.ID
	}
	rows, err := r.q.ListProgressSummariesByMember(ctx, arg)
	if err != nil {
		return nil, err
	}
	out := make([]SentSummary, 0, len(rows))
	for _, row := range rows {
		out = append(out, SentSummary{
			ID: row.ID, TrainerID: row.TrainerID,
			PeriodStart: tsOf(row.PeriodStart), PeriodEnd: tsOf(row.PeriodEnd),
			SchemaVersion: int(row.SchemaVersion), Delivered: text(row.MessageID) != "",
			CreatedAt: tsOf(row.CreatedAt),
		})
	}
	return out, nil
}
