// @plm SRS-080  SUMMARY 메시지 테스트 — 서버만 만들고, 한 번만 가고, 숫자가 없다 (ADR-041 · S-5·S-7·S-8·S-14)
package dm

import (
	"context"
	"strings"
	"testing"
	"time"
	"unicode"

	dmv1 "github.com/JWK-company/liftgram/src/backend/gen/dm/v1"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 가짜 저장소의 결정적 id 메시지 — 이미 있으면 아무것도 하지 않는다(messages 기본 키와 같은 동작).
func (f *fakeRepo) CreateRefMessage(_ context.Context, id, conversationID, senderID string, m NewMessage) (bool, error) {
	for _, list := range f.messages {
		for _, x := range list {
			if x.ID == id {
				return false, nil
			}
		}
	}
	f.seq++
	f.messages[conversationID] = append(f.messages[conversationID], Message{
		ID: id, ConversationID: conversationID, Sender: Participant{ID: senderID},
		Kind: m.Kind, Body: m.Body, RefID: m.RefID,
		CreatedAt: time.Now().Add(time.Duration(f.seq) * time.Millisecond),
	})
	return true, nil
}

const testSummaryID = "0b6f4a52-8a1e-4a3c-9a55-2f7f0d0c1e01"

func allMessages(f *fakeRepo) []Message {
	var out []Message
	for _, list := range f.messages {
		out = append(out, list...)
	}
	return out
}

func TestKindMapping_표(t *testing.T) {
	cases := []struct {
		kind  Kind
		proto dmv1.MessageKind
	}{
		{KindText, dmv1.MessageKind_MESSAGE_KIND_TEXT},
		{KindImage, dmv1.MessageKind_MESSAGE_KIND_IMAGE},
		{KindSummary, dmv1.MessageKind_MESSAGE_KIND_SUMMARY},
	}
	for _, c := range cases {
		if got := toProtoKind(c.kind); got != c.proto {
			t.Errorf("toProtoKind(%q) = %v, want %v", c.kind, got, c.proto)
		}
		if got := fromProtoKind(c.proto); got != c.kind {
			t.Errorf("fromProtoKind(%v) = %q, want %q", c.proto, got, c.kind)
		}
	}
	// 미지정은 빈 값(service 가 text 로 채운다) · 모르는 종류는 text 로 내보낸다(옛 동작).
	if fromProtoKind(dmv1.MessageKind_MESSAGE_KIND_UNSPECIFIED) != "" {
		t.Error("UNSPECIFIED 는 빈 값이어야 한다")
	}
	if toProtoKind(Kind("unknown")) != dmv1.MessageKind_MESSAGE_KIND_TEXT {
		t.Error("모르는 종류는 TEXT 로 내보낸다")
	}
}

// 클라이언트가 SUMMARY 를 보내면 거부한다 — ""로 떨어져 TEXT 로 저장되지도 않는다(S-14).
func TestSend_SUMMARY_직접_전송은_거부(t *testing.T) {
	svc, repo, _, _ := newTestService()
	ctx := context.Background()
	conv, err := svc.GetOrCreateDirect(ctx, "a", "b")
	if err != nil {
		t.Fatal(err)
	}
	_, err = svc.Send(ctx, "a", conv.ID, NewMessage{
		Kind: fromProtoKind(dmv1.MessageKind_MESSAGE_KIND_SUMMARY), Body: "위조", RefID: testSummaryID,
	})
	if domainCode(t, err) != errs.Validation {
		t.Fatalf("Validation 이어야 한다: %v", err)
	}
	if n := len(allMessages(repo)); n != 0 {
		t.Fatalf("아무것도 저장되면 안 된다: %d건", n)
	}
}

func TestSendSummaryNotice_한_번만_간다(t *testing.T) {
	svc, repo, _, bus := newTestService()
	ctx := context.Background()

	id1, created1, err := svc.SendSummaryNotice(ctx, "member", "trainer", testSummaryID)
	if err != nil || !created1 {
		t.Fatalf("첫 전달: created=%v err=%v", created1, err)
	}
	// 재시도·동시 요청 — 같은 요약이면 같은 메시지 id, 새로 만들지 않는다.
	id2, created2, err := svc.SendSummaryNotice(ctx, "member", "trainer", testSummaryID)
	if err != nil || created2 {
		t.Fatalf("두 번째는 만들지 않아야 한다: created=%v err=%v", created2, err)
	}
	if id1 != id2 || id1 != SummaryMessageID(testSummaryID) {
		t.Fatalf("메시지 id 가 결정적이어야 한다: %s %s", id1, id2)
	}
	msgs := allMessages(repo)
	if len(msgs) != 1 {
		t.Fatalf("메시지는 1건이어야 한다: %d", len(msgs))
	}
	m := msgs[0]
	if m.Kind != KindSummary || m.RefID != testSummaryID || m.Sender.ID != "member" {
		t.Fatalf("SUMMARY·ref_id·보낸 사람이 맞아야 한다: %+v", m)
	}
	if len(bus.topics) != 1 {
		t.Fatalf("실시간 알림은 새로 만들었을 때만: %v", bus.topics)
	}
	// 1:1 대화로 갔다 — 트레이너 쪽에서 연 대화와 같다.
	conv, _ := svc.GetOrCreateDirect(ctx, "trainer", "member")
	if m.ConversationID != conv.ID {
		t.Fatalf("1:1 대화로 가야 한다: %s vs %s", m.ConversationID, conv.ID)
	}
}

func TestSendSummaryNotice_차단_관계는_Forbidden(t *testing.T) {
	svc, repo, _, _ := newTestService()
	repo.blocks["trainer→member"] = true
	_, _, err := svc.SendSummaryNotice(context.Background(), "member", "trainer", testSummaryID)
	if domainCode(t, err) != errs.Forbidden {
		t.Fatalf("Forbidden 이어야 한다: %v", err)
	}
	if len(allMessages(repo)) != 0 {
		t.Fatal("차단이면 아무것도 남지 않는다")
	}
}

func TestSendSummaryNotice_요약_id_는_uuid만(t *testing.T) {
	svc, _, _, _ := newTestService()
	for _, bad := range []string{"", "not-a-uuid", "12345", testSummaryID + "x"} {
		_, _, err := svc.SendSummaryNotice(context.Background(), "member", "trainer", bad)
		if domainCode(t, err) != errs.Validation {
			t.Fatalf("%q: Validation 이어야 한다: %v", bad, err)
		}
	}
}

// body 에는 숫자가 없다 — 해지 뒤에도 대화에 남는 글이기 때문이다(S-7). 옛 앱용 ko·en 대체 문구(S-8).
func TestSummaryFallbackBody_숫자가_없다(t *testing.T) {
	for _, r := range SummaryFallbackBody {
		if unicode.IsDigit(r) {
			t.Fatalf("숫자가 들어 있다: %q", SummaryFallbackBody)
		}
	}
	if !strings.Contains(SummaryFallbackBody, "성과 요약") || !strings.Contains(SummaryFallbackBody, "summary") {
		t.Fatalf("ko·en 문구가 함께 있어야 한다: %q", SummaryFallbackBody)
	}
	if len([]rune(SummaryFallbackBody)) > 200 {
		t.Fatal("짧아야 한다(목록 미리보기·푸시)")
	}
}

// 서버가 만든 메시지의 body 는 언제나 상수 — 요약 id 도 body 에 실리지 않는다(옛 앱에 uuid 가 보이지 않게).
func TestSendSummaryNotice_body_는_상수(t *testing.T) {
	svc, repo, _, _ := newTestService()
	if _, _, err := svc.SendSummaryNotice(context.Background(), "member", "trainer", testSummaryID); err != nil {
		t.Fatal(err)
	}
	m := allMessages(repo)[0]
	if m.Body != SummaryFallbackBody || strings.Contains(m.Body, testSummaryID) {
		t.Fatalf("body 는 대체 문구 상수여야 한다: %q", m.Body)
	}
	if pm := toProtoMessage(m); pm.GetRefId() != testSummaryID || pm.GetKind() != dmv1.MessageKind_MESSAGE_KIND_SUMMARY {
		t.Fatalf("계약에 ref_id·SUMMARY 가 실려야 한다: %+v", pm)
	}
}
