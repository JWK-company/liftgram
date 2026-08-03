// @plm SRS-017  DM 규칙 테스트 — DB도 서버도 없이
//
// 여기서 보는 것은 **누가 들어올 수 있고 누구에게 말을 걸 수 있는가**다.
// 이게 틀리면 남의 대화가 새거나, 차단한 사람의 메시지가 계속 온다.
package dm

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜 저장소 ──────────────────────────────────────────────────────────────

type fakeRepo struct {
	convs    map[string]*Conversation
	byKey    map[string]string // direct_key → 대화 id
	messages map[string][]Message
	blocks   map[string]bool // "a→b"
	follows  map[string]bool // "follower→followee"
	users    map[string]bool
	seq      int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		convs:    map[string]*Conversation{},
		byKey:    map[string]string{},
		messages: map[string][]Message{},
		blocks:   map[string]bool{},
		follows:  map[string]bool{},
		users:    map[string]bool{},
	}
}

func (f *fakeRepo) FindOrCreateDirect(_ context.Context, id, directKey, a, b string) (Conversation, error) {
	if existing, ok := f.byKey[directKey]; ok {
		return *f.convs[existing], nil
	}
	c := &Conversation{
		ID:           id,
		Participants: []Participant{{ID: a}, {ID: b}},
		UpdatedAt:    time.Now(),
	}
	f.convs[id] = c
	f.byKey[directKey] = id
	return *c, nil
}

func (f *fakeRepo) CreateGroup(_ context.Context, id, title string, memberIDs []string) (Conversation, error) {
	parts := make([]Participant, 0, len(memberIDs))
	for _, m := range memberIDs {
		parts = append(parts, Participant{ID: m})
	}
	c := &Conversation{ID: id, IsGroup: true, Title: title, Participants: parts, UpdatedAt: time.Now()}
	f.convs[id] = c
	return *c, nil
}

func (f *fakeRepo) GetConversation(_ context.Context, _, conversationID string) (Conversation, error) {
	c, ok := f.convs[conversationID]
	if !ok {
		return Conversation{}, errs.New(errs.NotFound, "대화를 찾을 수 없습니다")
	}
	return *c, nil
}

func (f *fakeRepo) ListConversations(_ context.Context, viewerID string, _ int32) ([]Conversation, error) {
	var out []Conversation
	for _, c := range f.convs {
		for _, p := range c.Participants {
			if p.ID == viewerID {
				out = append(out, *c)
				break
			}
		}
	}
	return out, nil
}

func (f *fakeRepo) IsParticipant(_ context.Context, conversationID, userID string) (bool, error) {
	c, ok := f.convs[conversationID]
	if !ok {
		return false, nil
	}
	for _, p := range c.Participants {
		if p.ID == userID {
			return true, nil
		}
	}
	return false, nil
}

func (f *fakeRepo) Leave(_ context.Context, conversationID, userID string) error {
	c, ok := f.convs[conversationID]
	if !ok {
		return nil
	}
	kept := c.Participants[:0]
	for _, p := range c.Participants {
		if p.ID != userID {
			kept = append(kept, p)
		}
	}
	c.Participants = kept
	// 마지막 한 사람이 나가면 대화도 사라진다.
	if len(c.Participants) == 0 {
		delete(f.convs, conversationID)
	}
	return nil
}

func (f *fakeRepo) ListMessages(_ context.Context, viewerID, conversationID string, _ *time.Time, limit int32) ([]Message, error) {
	var out []Message
	for _, m := range f.messages[conversationID] {
		if f.blocks[viewerID+"→"+m.Sender.ID] || f.blocks[m.Sender.ID+"→"+viewerID] {
			continue // 차단 관계인 사람의 말은 안 보인다
		}
		out = append(out, m)
		if int32(len(out)) >= limit {
			break
		}
	}
	return out, nil
}

func (f *fakeRepo) ListMessagesAfter(_ context.Context, viewerID, conversationID string, after time.Time, _ int32) ([]Message, error) {
	var out []Message
	for _, m := range f.messages[conversationID] {
		if m.CreatedAt.After(after) && !f.blocks[viewerID+"→"+m.Sender.ID] && !f.blocks[m.Sender.ID+"→"+viewerID] {
			out = append(out, m)
		}
	}
	return out, nil
}

func (f *fakeRepo) CreateMessage(_ context.Context, id, conversationID, senderID string, m NewMessage) (Message, error) {
	f.seq++
	msg := Message{
		ID:             id,
		ConversationID: conversationID,
		Sender:         Participant{ID: senderID},
		Kind:           m.Kind,
		Body:           m.Body,
		MediaURL:       m.MediaURL,
		CreatedAt:      time.Now().Add(time.Duration(f.seq) * time.Millisecond),
	}
	f.messages[conversationID] = append(f.messages[conversationID], msg)
	return msg, nil
}

func (f *fakeRepo) MarkRead(context.Context, string, string) error { return nil }

func (f *fakeRepo) IsBlockedEitherWay(_ context.Context, a, b string) (bool, error) {
	return f.blocks[a+"→"+b] || f.blocks[b+"→"+a], nil
}

func (f *fakeRepo) CheckGroupMembers(_ context.Context, inviterID string, userIDs []string) (bool, bool, error) {
	allExist, allFollowed := true, true
	for _, id := range userIDs {
		if !f.users[id] {
			allExist = false
		}
		if !f.follows[inviterID+"→"+id] {
			allFollowed = false
		}
	}
	return allExist, allFollowed, nil
}

type fakeMedia struct{ owner map[string]string }

func (m *fakeMedia) CheckOwned(_ context.Context, url, ownerID string) (bool, error) {
	if m.owner[url] != ownerID {
		return false, errs.New(errs.Validation, "사진을 찾을 수 없습니다")
	}
	return false, nil
}

type fakeBus struct{ topics []string }

func (b *fakeBus) Publish(_ context.Context, topic string) error {
	b.topics = append(b.topics, topic)
	return nil
}

func newTestService() (*Service, *fakeRepo, *fakeMedia, *fakeBus) {
	repo := newFakeRepo()
	m := &fakeMedia{owner: map[string]string{}}
	b := &fakeBus{}
	n := 0
	return NewService(repo, m, b, func() string {
		n++
		return "conv-" + string(rune('a'+n-1))
	}), repo, m, b
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// ── 1:1 ──────────────────────────────────────────────────────────────────────

// 같은 두 사람 사이의 대화는 **언제나 하나**다 — 누가 먼저 열었든.
func TestDirectConversationIsSingular(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()

	first, err := svc.GetOrCreateDirect(ctx, "a", "b")
	if err != nil {
		t.Fatal(err)
	}
	again, err := svc.GetOrCreateDirect(ctx, "a", "b")
	if err != nil {
		t.Fatal(err)
	}
	// 반대쪽에서 열어도 같아야 한다.
	reverse, err := svc.GetOrCreateDirect(ctx, "b", "a")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != again.ID || first.ID != reverse.ID {
		t.Fatalf("대화가 갈라졌다: %s %s %s", first.ID, again.ID, reverse.ID)
	}
}

func TestDirectKeyIsOrderIndependent(t *testing.T) {
	if DirectKey("z", "a") != DirectKey("a", "z") {
		t.Fatal("순서에 따라 키가 달라진다 — 대화가 둘이 된다")
	}
}

func TestCannotMessageYourself(t *testing.T) {
	svc, _, _, _ := newTestService()
	if _, err := svc.GetOrCreateDirect(context.Background(), "me", "me"); domainCode(t, err) != errs.Validation {
		t.Fatal("자기 자신과 대화를 열었다")
	}
}

// 차단 관계면 1:1을 열 수 없다.
func TestBlockedCannotOpenDirect(t *testing.T) {
	svc, repo, _, _ := newTestService()
	repo.blocks["them→me"] = true
	if _, err := svc.GetOrCreateDirect(context.Background(), "me", "them"); domainCode(t, err) != errs.Forbidden {
		t.Fatal("차단한 사람과 대화가 열렸다")
	}
}

// 대화를 연 **뒤에** 차단이 생기면 더는 보낼 수 없다.
func TestBlockAfterOpenStopsSending(t *testing.T) {
	svc, repo, _, _ := newTestService()
	ctx := context.Background()

	conv, err := svc.GetOrCreateDirect(ctx, "me", "them")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Send(ctx, "me", conv.ID, NewMessage{Body: "안녕"}); err != nil {
		t.Fatal(err)
	}
	repo.blocks["them→me"] = true
	if _, err := svc.Send(ctx, "me", conv.ID, NewMessage{Body: "또 보냄"}); domainCode(t, err) != errs.Forbidden {
		t.Fatal("차단당한 뒤에도 보낼 수 있다")
	}
}

// ── 참여자 관문 ──────────────────────────────────────────────────────────────

// 남의 대화는 **없는 것처럼** 답한다 — "권한 없음"은 그 대화가 있다는 사실을 알려 준다.
func TestOutsiderSeesNothing(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()
	conv, _ := svc.GetOrCreateDirect(ctx, "a", "b")

	if _, err := svc.ListMessages(ctx, "outsider", conv.ID, nil, 0); domainCode(t, err) != errs.NotFound {
		t.Fatal("남이 대화를 읽었다")
	}
	if _, err := svc.Send(ctx, "outsider", conv.ID, NewMessage{Body: "끼어들기"}); domainCode(t, err) != errs.NotFound {
		t.Fatal("남이 대화에 썼다")
	}
	if err := svc.MarkRead(ctx, "outsider", conv.ID); domainCode(t, err) != errs.NotFound {
		t.Fatal("남이 읽음 처리를 했다")
	}
}

// ── 그룹 ─────────────────────────────────────────────────────────────────────

// 그룹에는 **내가 팔로우하는 사람만** 넣는다 — 낯선 사람을 끌어넣는 방을 막는다.
func TestGroupRequiresFollow(t *testing.T) {
	svc, repo, _, _ := newTestService()
	ctx := context.Background()
	repo.users["friend"], repo.users["stranger"] = true, true
	repo.follows["me→friend"] = true

	if _, err := svc.CreateGroup(ctx, "me", []string{"friend", "stranger"}, "우리 방"); domainCode(t, err) != errs.Forbidden {
		t.Fatal("팔로우하지 않은 사람이 그룹에 들어갔다")
	}
	if _, err := svc.CreateGroup(ctx, "me", []string{"friend"}, "우리 방"); err != nil {
		t.Fatalf("팔로우한 사람만인데 거절됐다: %v", err)
	}
}

// 나를 넣거나 같은 사람을 두 번 넣어도 조용히 정리된다.
func TestGroupDedupesAndDropsSelf(t *testing.T) {
	svc, repo, _, _ := newTestService()
	ctx := context.Background()
	repo.users["friend"] = true
	repo.follows["me→friend"] = true

	conv, err := svc.CreateGroup(ctx, "me", []string{"friend", "friend", "me"}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(conv.Participants) != 2 {
		t.Fatalf("참여자가 %d명이다: %+v", len(conv.Participants), conv.Participants)
	}
}

func TestGroupNeedsSomeone(t *testing.T) {
	svc, _, _, _ := newTestService()
	if _, err := svc.CreateGroup(context.Background(), "me", []string{"me"}, ""); domainCode(t, err) != errs.Validation {
		t.Fatal("혼자만의 그룹이 만들어졌다")
	}
}

// 1:1은 나갈 수 없다 — 나가면 상대의 대화가 반쪽이 된다.
func TestCannotLeaveDirect(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()
	conv, _ := svc.GetOrCreateDirect(ctx, "a", "b")
	if err := svc.Leave(ctx, "a", conv.ID); domainCode(t, err) != errs.Validation {
		t.Fatal("1:1 대화를 나갔다")
	}
}

// ── 메시지 ───────────────────────────────────────────────────────────────────

func TestEmptyTextIsRejected(t *testing.T) {
	svc, _, _, _ := newTestService()
	ctx := context.Background()
	conv, _ := svc.GetOrCreateDirect(ctx, "a", "b")
	if _, err := svc.Send(ctx, "a", conv.ID, NewMessage{Body: "   "}); domainCode(t, err) != errs.Validation {
		t.Fatal("빈 메시지가 갔다")
	}
}

// 사진 메시지는 **내가 올린 사진**이어야 한다(글·스토리와 같은 규칙).
func TestImageMessageRequiresOwnedMedia(t *testing.T) {
	svc, _, media, _ := newTestService()
	ctx := context.Background()
	conv, _ := svc.GetOrCreateDirect(ctx, "a", "b")
	media.owner["/media/file/mine.png"] = "a"

	if _, err := svc.Send(ctx, "a", conv.ID, NewMessage{Kind: KindImage, MediaURL: "/media/file/theirs.png"}); domainCode(t, err) != errs.Validation {
		t.Fatal("남의 사진을 보냈다")
	}
	if _, err := svc.Send(ctx, "a", conv.ID, NewMessage{Kind: KindImage, MediaURL: "/media/file/mine.png"}); err != nil {
		t.Fatalf("내 사진인데 거절됐다: %v", err)
	}
}

// 보내면 **커밋 뒤에** 이름만 전파된다 — 받는 쪽이 DB를 다시 읽는다.
func TestSendPublishesTopic(t *testing.T) {
	svc, _, _, bus := newTestService()
	ctx := context.Background()
	conv, _ := svc.GetOrCreateDirect(ctx, "a", "b")

	if _, err := svc.Send(ctx, "a", conv.ID, NewMessage{Body: "안녕"}); err != nil {
		t.Fatal(err)
	}
	if len(bus.topics) != 1 || bus.topics[0] != MessageTopic(conv.ID) {
		t.Fatalf("전파가 틀리다: %v", bus.topics)
	}
}

// 입력 중은 저장하지 않는다 — 이름으로만 지나간다.
func TestTypingOnlyPublishes(t *testing.T) {
	svc, repo, _, bus := newTestService()
	ctx := context.Background()
	conv, _ := svc.GetOrCreateDirect(ctx, "a", "b")

	if err := svc.Typing(ctx, "a", conv.ID); err != nil {
		t.Fatal(err)
	}
	if len(repo.messages[conv.ID]) != 0 {
		t.Fatal("입력 중 신호가 메시지로 저장됐다")
	}
	convID, actor, ok := ParseTypingTopic(bus.topics[0])
	if !ok || convID != conv.ID || actor != "a" {
		t.Fatalf("입력 중 주제가 틀리다: %q", bus.topics[0])
	}
	// 남의 대화에서는 신호도 못 보낸다.
	if err := svc.Typing(ctx, "outsider", conv.ID); domainCode(t, err) != errs.NotFound {
		t.Fatal("남이 입력 중 신호를 보냈다")
	}
}

func TestParseTypingTopicRejectsOthers(t *testing.T) {
	for _, topic := range []string{"dm:abc", "dm-typing:", "dm-typing:only", "무관한 주제"} {
		if _, _, ok := ParseTypingTopic(topic); ok {
			t.Fatalf("엉뚱한 주제를 입력 중으로 읽었다: %q", topic)
		}
	}
}

// 차단한 사람의 메시지는 대화에 남아 있어도 **안 보인다**(그룹에서 특히).
func TestBlockedSenderMessagesHidden(t *testing.T) {
	svc, repo, _, _ := newTestService()
	ctx := context.Background()
	repo.users["friend"], repo.users["troll"] = true, true
	repo.follows["me→friend"], repo.follows["me→troll"] = true, true
	conv, err := svc.CreateGroup(ctx, "me", []string{"friend", "troll"}, "방")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Send(ctx, "friend", conv.ID, NewMessage{Body: "안녕"}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Send(ctx, "troll", conv.ID, NewMessage{Body: "시끄러움"}); err != nil {
		t.Fatal(err)
	}

	repo.blocks["me→troll"] = true
	msgs, err := svc.ListMessages(ctx, "me", conv.ID, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(msgs) != 1 || msgs[0].Body != "안녕" {
		t.Fatalf("차단한 사람의 말이 보인다: %+v", msgs)
	}
}
