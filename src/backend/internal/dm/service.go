// @plm SRS-017  DM 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것: **누가 이 대화에 들어올 수 있고, 누구에게 말을 걸 수 있는가.**
//
// ── 지키는 규칙 ─────────────────────────────────────────────────────────────
//
//	· 모든 접근의 첫 관문은 **참여자인가**다. 아니면 아무것도 못 본다.
//	· 1:1은 만들지 않고 **찾거나 만든다** — 같은 두 사람 사이 대화는 언제나 하나다.
//	· 차단한 상대와는 1:1을 열 수도, 보낼 수도 없다. 그룹은 유지하되 그 사람의 말이 안 보인다.
//	· 그룹에는 **내가 팔로우하는 사람만** 넣는다. 1:1은 게이트하지 않는다 —
//	  처음 말을 거는 통로(PT 문의 등)가 막히면 안 되기 때문이다.
//	· 사진 메시지의 주소는 **내가 올린 우리 사진**이어야 한다(글·스토리와 같은 판정).
//
// ─────────────────────────────────────────────────────────────────────────────
package dm

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	maxLimit      = 100
	defaultLimit  = 30
	maxGroupSize  = 50
	maxConvsShown = 50
)

type Kind string

const (
	KindText  Kind = "text"
	KindImage Kind = "image"
)

type Participant struct {
	ID          string
	DisplayName string
	AvatarURL   string
}

type Message struct {
	ID             string
	ConversationID string
	Sender         Participant
	Kind           Kind
	Body           string
	MediaURL       string
	CreatedAt      time.Time
}

type Conversation struct {
	ID           string
	IsGroup      bool
	Title        string
	Participants []Participant
	LastMessage  *Message
	UnreadCount  int32
	UpdatedAt    time.Time
}

type NewMessage struct {
	Kind     Kind
	Body     string
	MediaURL string
}

type Repo interface {
	// 1:1 대화는 정규화 키로 찾는다. 없으면 만들되, 그사이 남이 만들었으면 그것을 쓴다.
	FindOrCreateDirect(ctx context.Context, id, directKey, a, b string) (Conversation, error)
	CreateGroup(ctx context.Context, id, title string, memberIDs []string) (Conversation, error)
	GetConversation(ctx context.Context, viewerID, conversationID string) (Conversation, error)
	ListConversations(ctx context.Context, viewerID string, limit int32) ([]Conversation, error)
	IsParticipant(ctx context.Context, conversationID, userID string) (bool, error)
	// 마지막 한 사람이 나가면 대화 자체를 지운다(같은 트랜잭션에서).
	Leave(ctx context.Context, conversationID, userID string) error

	ListMessages(ctx context.Context, viewerID, conversationID string, before *time.Time, limit int32) ([]Message, error)
	ListMessagesAfter(ctx context.Context, viewerID, conversationID string, after time.Time, limit int32) ([]Message, error)
	// 메시지를 넣고 대화의 시각을 올린다 — 한 트랜잭션(목록 정렬이 어긋나지 않게).
	CreateMessage(ctx context.Context, id, conversationID, senderID string, m NewMessage) (Message, error)
	MarkRead(ctx context.Context, conversationID, userID string) error

	IsBlockedEitherWay(ctx context.Context, a, b string) (bool, error)
	// 그룹에 넣을 수 있는지: 다 존재하는 사람인가 · 내가 다 팔로우하는가.
	CheckGroupMembers(ctx context.Context, inviterID string, userIDs []string) (allExist, allFollowed bool, err error)
}

// MediaChecker는 media 패키지가 채워 준다(글·스토리와 같은 포트).
type MediaChecker interface {
	CheckOwned(ctx context.Context, url, ownerID string) (flagged bool, err error)
}

// Notifier는 "새 메시지가 있다"를 전파한다. 이름만 나가고, 받은 쪽이 다시 읽는다.
type Notifier interface {
	Publish(ctx context.Context, topic string) error
}

type Service struct {
	repo  Repo
	media MediaChecker
	bus   Notifier
	newID func() string
}

func NewService(repo Repo, media MediaChecker, bus Notifier, newID func() string) *Service {
	return &Service{repo: repo, media: media, bus: bus, newID: newID}
}

// ── 대화 ─────────────────────────────────────────────────────────────────────

func (s *Service) ListConversations(ctx context.Context, viewerID string) ([]Conversation, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return s.repo.ListConversations(ctx, viewerID, maxConvsShown)
}

// GetOrCreateDirect — 같은 상대를 몇 번 눌러도 같은 대화로 들어간다.
func (s *Service) GetOrCreateDirect(ctx context.Context, viewerID, otherID string) (Conversation, error) {
	if viewerID == "" {
		return Conversation{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if otherID == "" {
		return Conversation{}, errs.New(errs.Validation, "상대를 지정해 주세요")
	}
	if viewerID == otherID {
		return Conversation{}, errs.New(errs.Validation, "자기 자신에게는 보낼 수 없습니다")
	}
	blocked, err := s.repo.IsBlockedEitherWay(ctx, viewerID, otherID)
	if err != nil {
		return Conversation{}, err
	}
	if blocked {
		return Conversation{}, errs.New(errs.Forbidden, "이 사용자에게는 보낼 수 없습니다")
	}
	return s.repo.FindOrCreateDirect(ctx, s.newID(), DirectKey(viewerID, otherID), viewerID, otherID)
}

// DirectKey는 두 사람의 순서에 상관없이 **같은 값**을 준다 — 그래야 대화가 하나로 모인다.
func DirectKey(a, b string) string {
	pair := []string{a, b}
	sort.Strings(pair)
	return pair[0] + ":" + pair[1]
}

func (s *Service) CreateGroup(ctx context.Context, viewerID string, userIDs []string, title string) (Conversation, error) {
	if viewerID == "" {
		return Conversation{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	// 나를 빼고 중복도 없앤다 — 같은 사람을 두 번 넣어도 한 번이다.
	seen := map[string]bool{viewerID: true}
	others := make([]string, 0, len(userIDs))
	for _, id := range userIDs {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		others = append(others, id)
	}
	if len(others) == 0 {
		return Conversation{}, errs.New(errs.Validation, "적어도 한 명은 있어야 합니다")
	}
	if len(others) > maxGroupSize {
		return Conversation{}, errs.New(errs.Validation, "인원이 너무 많습니다(최대 %d명)", maxGroupSize)
	}

	allExist, allFollowed, err := s.repo.CheckGroupMembers(ctx, viewerID, others)
	if err != nil {
		return Conversation{}, err
	}
	if !allExist {
		return Conversation{}, errs.New(errs.NotFound, "찾을 수 없는 사용자가 있습니다")
	}
	// 낯선 사람을 대량으로 끌어넣는 방을 막는다.
	if !allFollowed {
		return Conversation{}, errs.New(errs.Forbidden, "팔로우한 사람만 그룹에 넣을 수 있습니다")
	}
	return s.repo.CreateGroup(ctx, s.newID(), strings.TrimSpace(title), append([]string{viewerID}, others...))
}

// 그룹만 나갈 수 있다 — 1:1에서 나가면 상대의 대화가 반쪽이 된다.
func (s *Service) Leave(ctx context.Context, viewerID, conversationID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	conv, err := s.requireParticipant(ctx, viewerID, conversationID)
	if err != nil {
		return err
	}
	if !conv.IsGroup {
		return errs.New(errs.Validation, "1:1 대화는 나갈 수 없습니다")
	}
	return s.repo.Leave(ctx, conversationID, viewerID)
}

// ── 메시지 ───────────────────────────────────────────────────────────────────

func (s *Service) ListMessages(ctx context.Context, viewerID, conversationID string, before *time.Time, limit int32) ([]Message, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if _, err := s.requireParticipant(ctx, viewerID, conversationID); err != nil {
		return nil, err
	}
	return s.repo.ListMessages(ctx, viewerID, conversationID, before, clampLimit(limit))
}

func (s *Service) Send(ctx context.Context, viewerID, conversationID string, m NewMessage) (Message, error) {
	if viewerID == "" {
		return Message{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	conv, err := s.requireParticipant(ctx, viewerID, conversationID)
	if err != nil {
		return Message{}, err
	}

	// 1:1에서 차단이 생겼으면 더는 보낼 수 없다(대화는 남아 있어도).
	if !conv.IsGroup {
		for _, p := range conv.Participants {
			if p.ID == viewerID {
				continue
			}
			blocked, err := s.repo.IsBlockedEitherWay(ctx, viewerID, p.ID)
			if err != nil {
				return Message{}, err
			}
			if blocked {
				return Message{}, errs.New(errs.Forbidden, "이 사용자에게는 보낼 수 없습니다")
			}
		}
	}

	if m.Kind == "" {
		m.Kind = KindText
	}
	m.Body = strings.TrimSpace(m.Body)
	switch m.Kind {
	case KindText:
		if m.Body == "" {
			return Message{}, errs.New(errs.Validation, "메시지를 입력해 주세요")
		}
		m.MediaURL = ""
	case KindImage:
		if m.MediaURL == "" {
			return Message{}, errs.New(errs.Validation, "사진을 올려 주세요")
		}
		if _, err := s.media.CheckOwned(ctx, m.MediaURL, viewerID); err != nil {
			return Message{}, err
		}
	default:
		return Message{}, errs.New(errs.Validation, "알 수 없는 메시지 종류입니다")
	}

	msg, err := s.repo.CreateMessage(ctx, s.newID(), conversationID, viewerID, m)
	if err != nil {
		return Message{}, err
	}
	// **커밋 뒤에** 이름만 알린다 — 받는 쪽이 DB에서 다시 읽으므로 순서가 어긋날 수 없다.
	// 전파 실패가 저장을 되돌리지는 않는다(메시지는 이미 남았고, 상대는 폴링으로도 본다).
	if s.bus != nil {
		_ = s.bus.Publish(ctx, MessageTopic(conversationID))
	}
	return msg, nil
}

func (s *Service) MarkRead(ctx context.Context, viewerID, conversationID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if _, err := s.requireParticipant(ctx, viewerID, conversationID); err != nil {
		return err
	}
	return s.repo.MarkRead(ctx, conversationID, viewerID)
}

// Typing은 아무것도 저장하지 않는다 — 지금 열어 둔 상대에게만 지나가는 신호다.
func (s *Service) Typing(ctx context.Context, viewerID, conversationID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if _, err := s.requireParticipant(ctx, viewerID, conversationID); err != nil {
		return err
	}
	if s.bus != nil {
		_ = s.bus.Publish(ctx, TypingTopic(conversationID, viewerID))
	}
	return nil
}

// 스트림이 쓴다: 열 수 있는 대화인지 확인하고, 이후의 새 메시지를 읽는다.
func (s *Service) NewMessagesSince(ctx context.Context, viewerID, conversationID string, after time.Time) ([]Message, error) {
	if _, err := s.requireParticipant(ctx, viewerID, conversationID); err != nil {
		return nil, err
	}
	return s.repo.ListMessagesAfter(ctx, viewerID, conversationID, after, maxLimit)
}

func (s *Service) RequireParticipant(ctx context.Context, viewerID, conversationID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	_, err := s.requireParticipant(ctx, viewerID, conversationID)
	return err
}

// ── 내부 ─────────────────────────────────────────────────────────────────────

// 참여자가 아니면 **없는 대화**로 답한다 — "권한 없음"은 그 대화가 있다는 사실을 알려 준다.
func (s *Service) requireParticipant(ctx context.Context, viewerID, conversationID string) (Conversation, error) {
	ok, err := s.repo.IsParticipant(ctx, conversationID, viewerID)
	if err != nil {
		return Conversation{}, err
	}
	if !ok {
		return Conversation{}, errs.New(errs.NotFound, "대화를 찾을 수 없습니다")
	}
	return s.repo.GetConversation(ctx, viewerID, conversationID)
}

func clampLimit(n int32) int32 {
	if n <= 0 {
		return defaultLimit
	}
	if n > maxLimit {
		return maxLimit
	}
	return n
}

// 전파 주제. 버스는 **이름만** 나른다.
func MessageTopic(conversationID string) string { return "dm:" + conversationID }

// 입력 중은 저장할 상태가 없다 — 그래서 예외적으로 누가 치는지를 **이름에** 싣는다.
// (받는 쪽이 다시 읽을 것이 없기 때문이다. 메시지는 그렇지 않다 — 이름만 받고 DB를 읽는다.)
func TypingTopic(conversationID, actorID string) string {
	return "dm-typing:" + conversationID + ":" + actorID
}

// ParseTypingTopic은 TypingTopic의 역이다. 아니면 ok=false.
func ParseTypingTopic(topic string) (conversationID, actorID string, ok bool) {
	rest, found := strings.CutPrefix(topic, "dm-typing:")
	if !found {
		return "", "", false
	}
	conversationID, actorID, found = strings.Cut(rest, ":")
	if !found || conversationID == "" || actorID == "" {
		return "", "", false
	}
	return conversationID, actorID, true
}
