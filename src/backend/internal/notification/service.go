// @plm SRS-020  알림 규칙 — 부수적이고, 실패해도 본 동작을 깨지 않는다
//
// ─────────────────────────────────────────────────────────────────────────────
// 알림은 팔로우·좋아요·댓글이 일어날 때 곁들여 쌓인다. 그 쌓기가 실패해도 **원래 동작은 성공한다** —
// 알림 저장이 안 됐다고 좋아요가 취소되면 안 된다. 그래서 Notify는 오류를 돌려주지 않는다.
//
// 자기 자신에게는 보내지 않는다(내 글에 내가 누른 좋아요). 문구도 만들지 않는다 —
// 종류와 누가·어느 글만 남기고 **문장은 화면이 만든다**(서버는 보는 사람의 언어를 모른다).
// ─────────────────────────────────────────────────────────────────────────────
package notification

import (
	"context"
	"log/slog"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type Kind string

const (
	KindFollow  Kind = "follow"
	KindLike    Kind = "like"
	KindComment Kind = "comment"
	// 회원이 트레이너에게 성과 요약을 보냈다(SRS-080). post_id 는 비운다 — 옛 앱이 글 화면으로 가지 않게(S-16).
	// 요약의 **첫 실제 전달**에서만 부른다(재전송마다 쌓이지 않게). @plm SRS-080
	KindCoachingSummary Kind = "coaching_summary"

	// 코칭 v2(SPEC-050) — 받는 쪽 = 반대편. post_id 는 비우고 대상은 RefID 에 싣는다.
	// 요청·수락·해지 = 관계(grant) id · 루틴 = 회원 쪽 루틴 id · 코멘트 = 운동 id.
	KindCoachingRequest       Kind = "coaching_request"
	KindCoachingAccept        Kind = "coaching_accept"
	KindCoachingRevoke        Kind = "coaching_revoke"
	KindCoachingRoutine       Kind = "coaching_routine"
	KindCoachingRoutineUpdate Kind = "coaching_routine_update" // 10분 묶음(P3b)
	KindCoachingComment       Kind = "coaching_comment"
)

type Actor struct {
	ID          string
	DisplayName string
	AvatarURL   string
}

type Notification struct {
	ID     string
	Kind   Kind
	Actor  Actor
	PostID string
	// 코칭 알림의 대상(SPEC-050). 다른 종류는 빈 문자열.
	RefID     string
	Read      bool
	CreatedAt time.Time
}

type Repo interface {
	// [원본] Create(ctx context.Context, id, userID string, kind Kind, actorID, postID string) error
	// [개선] SPEC-050 — 코칭 알림의 대상(refID)을 함께 저장한다(빈 문자열이면 NULL).
	Create(ctx context.Context, id, userID string, kind Kind, actorID, postID, refID string) error
	List(ctx context.Context, viewerID string, limit int32) ([]Notification, error)
	CountUnread(ctx context.Context, viewerID string) (int32, error)
	MarkAllRead(ctx context.Context, viewerID string) error
}

type Service struct {
	repo  Repo
	newID func() string
}

func NewService(repo Repo, newID func() string) *Service {
	return &Service{repo: repo, newID: newID}
}

// Notify는 **오류를 돌려주지 않는다.** 부르는 쪽(좋아요·팔로우)의 성공을 알림이 좌우하면 안 된다.
func (s *Service) Notify(ctx context.Context, userID, actorID string, kind Kind, postID string) {
	if userID == "" || actorID == "" || userID == actorID {
		return // 자기 자신에게는 알리지 않는다
	}
	// [원본] if err := s.repo.Create(ctx, s.newID(), userID, kind, actorID, postID); err != nil {
	if err := s.repo.Create(ctx, s.newID(), userID, kind, actorID, postID, ""); err != nil {
		// 조용히 삼키지 않는다 — 사라진 알림이 있었다는 것은 로그에 남는다.
		slog.Warn("알림 저장 실패", "err", err, "kind", string(kind))
	}
}

// NotifyRef는 코칭 알림이다(SPEC-050) — post_id 는 비우고 대상 id 를 ref_id 에 싣는다.
// Notify 와 같이 **오류를 돌려주지 않는다**(연결·해지의 성공을 알림이 좌우하지 않는다).
func (s *Service) NotifyRef(ctx context.Context, userID, actorID string, kind Kind, refID string) {
	if userID == "" || actorID == "" || userID == actorID {
		return
	}
	if err := s.repo.Create(ctx, s.newID(), userID, kind, actorID, "", refID); err != nil {
		slog.Warn("알림 저장 실패", "err", err, "kind", string(kind))
	}
}

func (s *Service) List(ctx context.Context, viewerID string, limit int32) ([]Notification, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}
	return s.repo.List(ctx, viewerID, limit)
}

func (s *Service) UnreadCount(ctx context.Context, viewerID string) (int32, error) {
	if viewerID == "" {
		return 0, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.repo.CountUnread(ctx, viewerID)
}

// 화면을 열면 한 번에 읽음 처리한다 — 개별 읽음은 app에도 없다.
func (s *Service) MarkAllRead(ctx context.Context, viewerID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.repo.MarkAllRead(ctx, viewerID)
}
