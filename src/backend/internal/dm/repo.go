// @plm SRS-017  DM 저장소
//
// ── 트랜잭션을 쓰는 곳 ──────────────────────────────────────────────────────
//
//	· 대화 만들기 = 대화 행 + 참여자 행들. 갈라지면 **아무도 못 들어가는 대화**가 남는다.
//	· 메시지 보내기 = 메시지 + 대화의 updated_at. 갈라지면 목록 정렬이 어긋난다.
//	· 나가기 = 참여자 삭제 + (마지막이면) 대화 삭제. 갈라지면 빈 대화가 남거나 두 번 지운다.
package dm

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

type pgRepo struct {
	pool *pgxpool.Pool
	q    *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{pool: pool, q: sqlcgen.New(pool)}
}

func (r *pgRepo) FindOrCreateDirect(ctx context.Context, id, directKey, a, b string) (Conversation, error) {
	if row, err := r.q.FindDirectConversation(ctx, &directKey); err == nil {
		return r.view(ctx, a, row)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Conversation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.CreateConversation(ctx, sqlcgen.CreateConversationParams{
		ID:        id,
		IsGroup:   false,
		DirectKey: &directKey,
	})
	if err != nil {
		// 동시에 눌렀다 — 유일 제약이 하나만 남겼으므로 이미 있는 것을 쓴다.
		if existing, e := r.q.FindDirectConversation(ctx, &directKey); e == nil {
			return r.view(ctx, a, existing)
		}
		return Conversation{}, err
	}
	for _, uid := range []string{a, b} {
		if err := q.AddParticipant(ctx, sqlcgen.AddParticipantParams{ConversationID: row.ID, UserID: uid}); err != nil {
			return Conversation{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Conversation{}, err
	}
	return r.view(ctx, a, row)
}

func (r *pgRepo) CreateGroup(ctx context.Context, id, title string, memberIDs []string) (Conversation, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Conversation{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.CreateConversation(ctx, sqlcgen.CreateConversationParams{
		ID:      id,
		IsGroup: true,
		Title:   ptr(title),
	})
	if err != nil {
		return Conversation{}, err
	}
	for _, uid := range memberIDs {
		if err := q.AddParticipant(ctx, sqlcgen.AddParticipantParams{ConversationID: row.ID, UserID: uid}); err != nil {
			return Conversation{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return Conversation{}, err
	}
	// 만든 사람 기준으로 본다(첫 번째가 만든 사람 — service가 그렇게 넘긴다).
	return r.view(ctx, memberIDs[0], row)
}

func (r *pgRepo) GetConversation(ctx context.Context, viewerID, conversationID string) (Conversation, error) {
	row, err := r.q.GetConversation(ctx, conversationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, errs.New(errs.NotFound, "대화를 찾을 수 없습니다")
	}
	if err != nil {
		return Conversation{}, err
	}
	return r.view(ctx, viewerID, row)
}

func (r *pgRepo) ListConversations(ctx context.Context, viewerID string, limit int32) ([]Conversation, error) {
	rows, err := r.q.ListMyConversations(ctx, sqlcgen.ListMyConversationsParams{ViewerID: viewerID, Lim: limit})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []Conversation{}, nil
	}

	// 참여자는 **한 번에** 읽는다 — 대화마다 따로 읽으면 목록 하나에 쿼리가 수십 번 난다.
	ids := make([]string, 0, len(rows))
	for _, c := range rows {
		ids = append(ids, c.ID)
	}
	parts, err := r.q.ListParticipants(ctx, ids)
	if err != nil {
		return nil, err
	}
	byConv := map[string][]Participant{}
	for _, p := range parts {
		byConv[p.ConversationID] = append(byConv[p.ConversationID], Participant{
			ID: p.ID, DisplayName: deref(p.DisplayName), AvatarURL: deref(p.AvatarUrl),
		})
	}

	out := make([]Conversation, 0, len(rows))
	for _, c := range rows {
		conv, err := r.fill(ctx, viewerID, c, byConv[c.ID])
		if err != nil {
			return nil, err
		}
		// 1:1에서 상대를 차단했으면 목록에서 뺀다(그룹은 남기고 그 사람만 가린다).
		if !conv.IsGroup && len(conv.Participants) < 2 {
			continue
		}
		out = append(out, conv)
	}
	return out, nil
}

func (r *pgRepo) IsParticipant(ctx context.Context, conversationID, userID string) (bool, error) {
	return r.q.IsParticipant(ctx, sqlcgen.IsParticipantParams{ConversationID: conversationID, UserID: userID})
}

func (r *pgRepo) Leave(ctx context.Context, conversationID, userID string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	if err := q.RemoveParticipant(ctx, sqlcgen.RemoveParticipantParams{ConversationID: conversationID, UserID: userID}); err != nil {
		return err
	}
	// 마지막 한 사람이 나가면 대화도 사라진다 — 메시지는 ON DELETE CASCADE로 함께 정리된다.
	left, err := q.CountParticipants(ctx, conversationID)
	if err != nil {
		return err
	}
	if left == 0 {
		if err := q.DeleteConversation(ctx, conversationID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *pgRepo) ListMessages(ctx context.Context, viewerID, conversationID string, before *time.Time, limit int32) ([]Message, error) {
	arg := sqlcgen.ListMessagesParams{
		ConversationID: conversationID,
		ViewerID:       viewerID,
		Lim:            limit,
		Before:         pgtype.Timestamptz{Time: time.Unix(0, 0), Valid: true},
	}
	if before != nil {
		arg.HasBefore = true
		arg.Before = pgtype.Timestamptz{Time: *before, Valid: true}
	}
	rows, err := r.q.ListMessages(ctx, arg)
	if err != nil {
		return nil, err
	}
	// 저장소는 최신부터 읽고, 화면은 위에서 아래로 놓는다 — 여기서 뒤집어 준다.
	out := make([]Message, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		m := rows[i]
		out = append(out, Message{
			ID: m.ID, ConversationID: m.ConversationID, Kind: Kind(m.Kind),
			Body: deref(m.Body), MediaURL: deref(m.MediaUrl), CreatedAt: m.CreatedAt.Time,
			Sender: Participant{ID: m.SenderID, DisplayName: deref(m.SenderName), AvatarURL: deref(m.SenderAvatar)},
		})
	}
	return out, nil
}

func (r *pgRepo) ListMessagesAfter(ctx context.Context, viewerID, conversationID string, after time.Time, limit int32) ([]Message, error) {
	rows, err := r.q.ListMessagesAfter(ctx, sqlcgen.ListMessagesAfterParams{
		ConversationID: conversationID,
		ViewerID:       viewerID,
		After:          pgtype.Timestamptz{Time: after, Valid: true},
		Lim:            limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Message, 0, len(rows))
	for _, m := range rows {
		out = append(out, Message{
			ID: m.ID, ConversationID: m.ConversationID, Kind: Kind(m.Kind),
			Body: deref(m.Body), MediaURL: deref(m.MediaUrl), CreatedAt: m.CreatedAt.Time,
			Sender: Participant{ID: m.SenderID, DisplayName: deref(m.SenderName), AvatarURL: deref(m.SenderAvatar)},
		})
	}
	return out, nil
}

func (r *pgRepo) CreateMessage(ctx context.Context, id, conversationID, senderID string, m NewMessage) (Message, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return Message{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	q := r.q.WithTx(tx)

	row, err := q.CreateMessage(ctx, sqlcgen.CreateMessageParams{
		ID:             id,
		ConversationID: conversationID,
		SenderID:       senderID,
		Kind:           string(m.Kind),
		Body:           ptr(m.Body),
		MediaUrl:       ptr(m.MediaURL),
	})
	if err != nil {
		return Message{}, err
	}
	// 목록 정렬이 최신 대화 순이므로 함께 올린다.
	if err := q.TouchConversation(ctx, conversationID); err != nil {
		return Message{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return Message{}, err
	}

	sender, err := r.q.GetUserByID(ctx, senderID)
	if err != nil {
		return Message{}, err
	}
	return Message{
		ID: row.ID, ConversationID: row.ConversationID, Kind: Kind(row.Kind),
		Body: deref(row.Body), MediaURL: deref(row.MediaUrl), CreatedAt: row.CreatedAt.Time,
		Sender: Participant{ID: senderID, DisplayName: deref(sender.DisplayName), AvatarURL: deref(sender.AvatarUrl)},
	}, nil
}

func (r *pgRepo) MarkRead(ctx context.Context, conversationID, userID string) error {
	return r.q.MarkRead(ctx, sqlcgen.MarkReadParams{ConversationID: conversationID, UserID: userID})
}

func (r *pgRepo) IsBlockedEitherWay(ctx context.Context, a, b string) (bool, error) {
	return r.q.IsBlockedEitherWay(ctx, sqlcgen.IsBlockedEitherWayParams{A: a, B: b})
}

func (r *pgRepo) CheckGroupMembers(ctx context.Context, inviterID string, userIDs []string) (bool, bool, error) {
	users, err := r.q.CountUsersAmong(ctx, userIDs)
	if err != nil {
		return false, false, err
	}
	followed, err := r.q.CountFollowedAmong(ctx, sqlcgen.CountFollowedAmongParams{
		FollowerID: inviterID,
		UserIds:    userIDs,
	})
	if err != nil {
		return false, false, err
	}
	n := int32(len(userIDs))
	return users == n, followed == n, nil
}

// ── 조립 ─────────────────────────────────────────────────────────────────────

func (r *pgRepo) view(ctx context.Context, viewerID string, c sqlcgen.Conversation) (Conversation, error) {
	parts, err := r.q.ListParticipants(ctx, []string{c.ID})
	if err != nil {
		return Conversation{}, err
	}
	list := make([]Participant, 0, len(parts))
	for _, p := range parts {
		list = append(list, Participant{ID: p.ID, DisplayName: deref(p.DisplayName), AvatarURL: deref(p.AvatarUrl)})
	}
	return r.fill(ctx, viewerID, c, list)
}

func (r *pgRepo) fill(ctx context.Context, viewerID string, c sqlcgen.Conversation, parts []Participant) (Conversation, error) {
	conv := Conversation{
		ID:        c.ID,
		IsGroup:   c.IsGroup,
		Title:     deref(c.Title),
		UpdatedAt: c.UpdatedAt.Time,
	}
	// 차단한 사람은 참여자 목록에서 가린다(나는 언제나 남는다).
	for _, p := range parts {
		if p.ID != viewerID {
			blocked, err := r.IsBlockedEitherWay(ctx, viewerID, p.ID)
			if err != nil {
				return Conversation{}, err
			}
			if blocked {
				continue
			}
		}
		conv.Participants = append(conv.Participants, p)
	}

	if last, err := r.q.GetLastMessage(ctx, c.ID); err == nil {
		conv.LastMessage = &Message{
			ID: last.ID, ConversationID: last.ConversationID, Kind: Kind(last.Kind),
			Body: deref(last.Body), MediaURL: deref(last.MediaUrl), CreatedAt: last.CreatedAt.Time,
			Sender: Participant{ID: last.SenderID, DisplayName: deref(last.SenderName), AvatarURL: deref(last.SenderAvatar)},
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return Conversation{}, err
	}

	unread, err := r.q.CountUnread(ctx, sqlcgen.CountUnreadParams{ViewerID: viewerID, ConversationID: c.ID})
	if err != nil {
		return Conversation{}, err
	}
	conv.UnreadCount = unread
	return conv, nil
}

func ptr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
