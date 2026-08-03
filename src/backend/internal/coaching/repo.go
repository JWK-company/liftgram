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
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo { return &pgRepo{q: sqlcgen.New(pool)} }

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
		out = append(out, Peer{
			ID: u.ID, DisplayName: text(u.DisplayName), AvatarURL: text(u.AvatarUrl),
			ExperienceLevel: text(u.ExperienceLevel), TrainerIntent: u.TrainerIntent,
		})
	}
	return out, nil
}

func (r *pgRepo) TrainerEligible(ctx context.Context, trainerID string) (bool, error) {
	u, err := r.q.GetUserByID(ctx, trainerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, errs.New(errs.NotFound, "trainer not found")
		}
		return false, err
	}
	return u.TrainerIntent, nil
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
		ConsentAt: tsOf(row.ConsentAt), CreatedAt: tsOf(row.CreatedAt),
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
			ConsentAt: tsOf(row.ConsentAt), CreatedAt: tsOf(row.CreatedAt),
		}
		if row.TrainerID == viewerID {
			g.RoleOfMe = SideTrainer
			g.Peer = Peer{
				ID: row.MemberID, DisplayName: text(row.MemberName), AvatarURL: text(row.MemberAvatar),
				ExperienceLevel: text(row.MemberLevel), TrainerIntent: row.MemberIntentFlag,
			}
		} else {
			g.RoleOfMe = SideMember
			g.Peer = Peer{
				ID: row.TrainerID, DisplayName: text(row.TrainerName), AvatarURL: text(row.TrainerAvatar),
				ExperienceLevel: text(row.TrainerLevel), TrainerIntent: row.TrainerIntentFlag,
			}
		}
		out = append(out, g)
	}
	return out, nil
}

func (r *pgRepo) CreateGrant(ctx context.Context, id, trainerID, memberID, requestedBy string) (Grant, error) {
	row, err := r.q.CreateGrant(ctx, sqlcgen.CreateGrantParams{
		ID: id, TrainerID: trainerID, MemberID: memberID, RequestedBy: requestedBy,
	})
	if err != nil {
		return Grant{}, err
	}
	return grantFrom(row), nil
}

func (r *pgRepo) ReopenGrant(ctx context.Context, grantID, requestedBy string) (Grant, error) {
	row, err := r.q.ReopenGrant(ctx, sqlcgen.ReopenGrantParams{ID: grantID, RequestedBy: requestedBy})
	if err != nil {
		return Grant{}, err
	}
	return grantFrom(row), nil
}

func (r *pgRepo) AcceptGrant(ctx context.Context, grantID string) (Grant, error) {
	row, err := r.q.AcceptGrant(ctx, grantID)
	if err != nil {
		return Grant{}, err
	}
	return grantFrom(row), nil
}

func (r *pgRepo) RevokeGrant(ctx context.Context, grantID string) (Grant, error) {
	row, err := r.q.RevokeGrant(ctx, grantID)
	if err != nil {
		return Grant{}, err
	}
	return grantFrom(row), nil
}

func (r *pgRepo) Audit(ctx context.Context, id, grantID, actorID, action string, detail []byte) error {
	return r.q.CreateAudit(ctx, sqlcgen.CreateAuditParams{
		ID: id, GrantID: grantID, ActorID: actorID, Action: action, Detail: detail,
	})
}

func (r *pgRepo) ListAudit(ctx context.Context, grantID string) ([]AuditEntry, error) {
	rows, err := r.q.ListAudit(ctx, grantID)
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
