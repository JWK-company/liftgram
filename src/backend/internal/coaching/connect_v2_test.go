// 코칭 v2 규칙 테스트(SPEC-050) — 범위·다시 연결·코치 한 명·초대 코드·지난 기록 컷·체중 칸·차단·알림
package coaching

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/notification"
)

type refNote struct{ to, actor, kind, ref string }

type fakeRefNotifier struct{ got []refNote }

func (n *fakeRefNotifier) NotifyRef(_ context.Context, to, actor, kind, ref string) {
	n.got = append(n.got, refNote{to, actor, kind, ref})
}

type fakeDirect struct {
	opened [][2]string
	fail   bool
}

func (d *fakeDirect) OpenDirect(_ context.Context, a, b string) error {
	d.opened = append(d.opened, [2]string{a, b})
	if d.fail {
		return errors.New("대화방 실패")
	}
	return nil
}

func v2Svc(repo *fakeRepo) (*Service, *fakeRefNotifier, *fakeDirect) {
	n, d := &fakeRefNotifier{}, &fakeDirect{}
	codes := []string{"ABCD2345", "WXYZ6789", "MNPQ0123"}
	i := 0
	svc := newSvc(repo).WithConnectPorts(n, d).WithInviteCode(func() string {
		c := codes[i%len(codes)]
		i++
		return c
	})
	return svc, n, d
}

func domainMsg(t *testing.T, err error) string {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아니다: %v", err)
	}
	return de.Message
}

func scopeJSONKeys(t *testing.T, s Scope) []string {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(s.encode(), &m); err != nil {
		t.Fatal(err)
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// ── 범위 ─────────────────────────────────────────────────────────────────────

func TestScope_저장_키는_넷뿐이고_camelCase(t *testing.T) {
	got := scopeJSONKeys(t, Scope{LogView: true, BodyView: true})
	if !slices.Equal(got, []string{"bodyView", "logView", "pastRecords", "routineEdit"}) {
		t.Fatalf("허용 키 4개만(태그 이름): %v", got)
	}
	// 옛 행(scheduleEdit 있음·bodyView 없음)은 없는 키를 false 로 읽는다.
	old := parseScope([]byte(`{"routineEdit":true,"scheduleEdit":true,"logView":true}`))
	if sc := ScopeOf(old); sc != (Scope{LogView: true, RoutineEdit: true}) {
		t.Fatalf("옛 행 읽기: %+v", sc)
	}
}

func TestRequest_회원이_고른_범위와_메시지를_저장한다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	svc, notes, _ := v2Svc(repo)
	sc := Scope{LogView: true, BodyView: true}
	g, err := svc.RequestCoaching(context.Background(), "m1", RequestInput{TrainerID: "t1", Scope: &sc, Note: "  잘 부탁해요  "})
	if err != nil {
		t.Fatal(err)
	}
	stored := repo.grants[g.ID]
	if ScopeOf(stored.Scope) != sc || stored.RequestNote != "잘 부탁해요" {
		t.Fatalf("범위·메시지(앞뒤 공백 정리): %+v", stored)
	}
	if len(notes.got) != 1 || notes.got[0] != (refNote{"t1", "m1", notifyKindCoachingRequest, g.ID}) {
		t.Fatalf("반대편에 coaching_request(ref=관계 id): %+v", notes.got)
	}
}

func TestRequest_코치가_보낸_범위는_무시하고_기본값(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	svc, _, _ := v2Svc(repo)
	sc := Scope{LogView: true, BodyView: true, PastRecords: true}
	g, err := svc.RequestCoaching(context.Background(), "t1", RequestInput{MemberID: "m1", Scope: &sc})
	if err != nil {
		t.Fatal(err)
	}
	if ScopeOf(repo.grants[g.ID].Scope) != DefaultScope() {
		t.Fatalf("코치 요청은 기본값: %+v", repo.grants[g.ID].Scope)
	}
}

func TestRequest_메시지_100자_넘으면_거절(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	svc, _, _ := v2Svc(repo)
	_, err := svc.RequestCoaching(context.Background(), "m1", RequestInput{TrainerID: "t1", Note: strings.Repeat("가", 101)})
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("101자는 Validation: %v", err)
	}
	if _, err := svc.RequestCoaching(context.Background(), "m1", RequestInput{TrainerID: "t1", Note: strings.Repeat("가", 100)}); err != nil {
		t.Fatalf("100자(룬)는 된다: %v", err)
	}
}

func TestReopen_범위는_요청값_없으면_기본값으로_초기화(t *testing.T) {
	for name, tc := range map[string]struct {
		scope *Scope
		want  Scope
	}{
		"범위 없이 다시 요청": {nil, DefaultScope()},
		"새 범위로 다시 요청": {&Scope{LogView: true}, Scope{LogView: true}},
	} {
		t.Run(name, func(t *testing.T) {
			repo := newRepo()
			repo.eligible["t1"] = true
			repo.users["m1"] = true
			// 지난 관계에서 체중·지난 기록까지 열었었다.
			repo.grants["g1"] = Grant{
				ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusRevoked, RequestedBy: SideMember,
				Scope: Scope{LogView: true, RoutineEdit: true, BodyView: true, PastRecords: true}.asMap(),
			}
			svc, _, _ := v2Svc(repo)
			if _, err := svc.RequestCoaching(context.Background(), "m1", RequestInput{TrainerID: "t1", Scope: tc.scope}); err != nil {
				t.Fatal(err)
			}
			if got := ScopeOf(repo.grants["g1"].Scope); got != tc.want {
				t.Fatalf("옛 범위가 되살아나면 안 된다: %+v", got)
			}
		})
	}
}

func TestAccept_회원이_수락하면_범위를_저장하고_코치_수락은_무시(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending, RequestedBy: SideTrainer, Scope: DefaultScope().asMap()}
	repo.grants["g2"] = Grant{ID: "g2", TrainerID: "t2", MemberID: "m2", Status: StatusPending, RequestedBy: SideMember, Scope: Scope{LogView: true}.asMap()}
	repo.eligible["t2"] = true
	svc, notes, direct := v2Svc(repo)

	sc := Scope{LogView: true, RoutineEdit: false, BodyView: true}
	if _, err := svc.AcceptWith(context.Background(), "m1", "g1", &sc); err != nil {
		t.Fatal(err)
	}
	if ScopeOf(repo.grants["g1"].Scope) != sc {
		t.Fatalf("회원 수락 범위 저장: %+v", repo.grants["g1"].Scope)
	}
	wide := Scope{LogView: true, RoutineEdit: true, BodyView: true, PastRecords: true}
	if _, err := svc.AcceptWith(context.Background(), "t2", "g2", &wide); err != nil {
		t.Fatal(err)
	}
	if ScopeOf(repo.grants["g2"].Scope) != (Scope{LogView: true}) {
		t.Fatalf("코치가 보낸 범위는 무시(회원이 요청한 값 그대로): %+v", repo.grants["g2"].Scope)
	}
	if len(notes.got) != 2 || notes.got[0] != (refNote{"t1", "m1", notifyKindCoachingAccept, "g1"}) ||
		notes.got[1] != (refNote{"m2", "t2", notifyKindCoachingAccept, "g2"}) {
		t.Fatalf("수락 알림은 요청한 쪽에: %+v", notes.got)
	}
	if len(direct.opened) != 2 {
		t.Fatalf("수락 뒤 1:1 대화방: %+v", direct.opened)
	}
}

func TestAccept_대화방_실패해도_연결은_성공(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending, RequestedBy: SideTrainer}
	svc, _, direct := v2Svc(repo)
	direct.fail = true
	if _, err := svc.Accept(context.Background(), "m1", "g1"); err != nil {
		t.Fatalf("대화방 실패는 무시: %v", err)
	}
	if repo.grants["g1"].Status != StatusActive {
		t.Fatal("연결은 됐어야 한다")
	}
}

func TestAccept_차단이면_거절하고_상태를_바꾸지_않는다(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending, RequestedBy: SideTrainer}
	repo.blocked = true
	svc, notes, _ := v2Svc(repo)
	if _, err := svc.Accept(context.Background(), "m1", "g1"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("차단 재확인: %v", err)
	}
	if repo.grants["g1"].Status != StatusPending || len(notes.got) != 0 {
		t.Fatalf("상태·알림 그대로: %+v %+v", repo.grants["g1"], notes.got)
	}
}

func TestUpdateScope_회원만_활성만_감사는_전후(t *testing.T) {
	repo := newRepo()
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive, Scope: DefaultScope().asMap()}
	svc, _, _ := v2Svc(repo)
	ctx := context.Background()
	next := Scope{LogView: true, BodyView: true}

	if _, err := svc.UpdateScope(ctx, "t1", "g1", next); codeOf(t, err) != errs.Forbidden || domainMsg(t, err) != msgScopeMemberOnly {
		t.Fatalf("코치는 못 바꾼다: %v", err)
	}
	if _, err := svc.UpdateScope(ctx, "남", "g1", next); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("남은 못 바꾼다: %v", err)
	}
	g, err := svc.UpdateScope(ctx, "m1", "g1", next)
	if err != nil {
		t.Fatal(err)
	}
	if ScopeOf(g.Scope) != next {
		t.Fatalf("바뀐 범위: %+v", g.Scope)
	}
	i := slices.IndexFunc(repo.audits, func(a AuditEntry) bool { return a.Action == ActionScopeChange })
	if i < 0 {
		t.Fatal("scope_change 감사")
	}
	var detail struct{ Before, After Scope }
	if err := json.Unmarshal(repo.auditDetails[i], &detail); err != nil {
		t.Fatal(err)
	}
	if detail.Before != DefaultScope() || detail.After != next {
		t.Fatalf("전·후: %s", repo.auditDetails[i])
	}

	repo.grants["g2"] = Grant{ID: "g2", TrainerID: "t2", MemberID: "m1", Status: StatusPending}
	if _, err := svc.UpdateScope(ctx, "m1", "g2", next); codeOf(t, err) != errs.Conflict {
		t.Fatalf("활성이 아니면 Conflict: %v", err)
	}
	repo.blocked = true
	if _, err := svc.UpdateScope(ctx, "m1", "g1", DefaultScope()); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("차단이면 Forbidden: %v", err)
	}
}

// ── 코치 한 명 ───────────────────────────────────────────────────────────────

func TestOneCoach_둘째_코치는_수락도_요청도_거절(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"], repo.eligible["t2"] = true, true
	repo.users["m1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive, Scope: DefaultScope().asMap()}
	repo.grants["g2"] = Grant{ID: "g2", TrainerID: "t2", MemberID: "m1", Status: StatusPending, RequestedBy: SideTrainer}
	svc, _, _ := v2Svc(repo)

	_, err := svc.Accept(context.Background(), "m1", "g2")
	if codeOf(t, err) != errs.Conflict || domainMsg(t, err) != msgOneCoach {
		t.Fatalf("둘째 코치 수락은 Conflict(한국어 문구): %v", err)
	}
	if repo.grants["g2"].Status != StatusPending {
		t.Fatal("g2 는 pending 그대로")
	}
	repo.grants["g2"] = Grant{ID: "g2", TrainerID: "t2", MemberID: "m1", Status: StatusRevoked}
	_, err = svc.RequestCoaching(context.Background(), "m1", RequestInput{TrainerID: "t2"})
	if codeOf(t, err) != errs.Conflict || domainMsg(t, err) != msgOneCoach {
		t.Fatalf("코치가 있는 회원의 요청도 Conflict: %v", err)
	}
}

func TestAccept_이미_처리된_요청은_Conflict(t *testing.T) {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusPending, RequestedBy: SideTrainer}
	// 서비스가 pending 을 본 뒤 다른 요청이 먼저 처리했다(쿼리 0행) — 저장소가 Conflict 를 낸다.
	if _, err := repo.AcceptGrant(context.Background(), "g1", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := repo.AcceptGrant(context.Background(), "g1", nil); codeOf(t, err) != errs.Conflict {
		t.Fatalf("0행 → Conflict: %v", err)
	}
}

func TestRevoke_해지는_루틴을_끝내고_두번째는_거절(t *testing.T) {
	repo := newRepo()
	repo.grants["g1"] = Grant{ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive}
	svc, notes, _ := v2Svc(repo)
	if _, err := svc.Revoke(context.Background(), "m1", "g1"); err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(repo.endedRoutines, []string{"g1"}) {
		t.Fatalf("RevokeGrantAndEndRoutines 를 탄다: %v", repo.endedRoutines)
	}
	if len(notes.got) != 1 || notes.got[0] != (refNote{"t1", "m1", notifyKindCoachingRevoke, "g1"}) {
		t.Fatalf("해지 알림은 반대편: %+v", notes.got)
	}
	if _, err := svc.Revoke(context.Background(), "m1", "g1"); err == nil {
		t.Fatal("두 번째 해지는 거절")
	}
}

func TestNotify_차단_사이면_보내지_않는다(t *testing.T) {
	repo := newRepo()
	svc, notes, _ := v2Svc(repo)
	repo.blocked = true
	svc.notifyAfter(context.Background(), "t1", "m1", notifyKindCoachingRequest, "g1")
	if len(notes.got) != 0 {
		t.Fatalf("차단이면 알림 없음: %+v", notes.got)
	}
}

func TestNotifyKinds_알림_패키지와_같은_이름(t *testing.T) {
	for mine, theirs := range map[string]notification.Kind{
		notifyKindCoachingRequest:       notification.KindCoachingRequest,
		notifyKindCoachingAccept:        notification.KindCoachingAccept,
		notifyKindCoachingRevoke:        notification.KindCoachingRevoke,
		notifyKindCoachingRoutine:       notification.KindCoachingRoutine,
		notifyKindCoachingRoutineUpdate: notification.KindCoachingRoutineUpdate,
		notifyKindCoachingComment:       notification.KindCoachingComment,
	} {
		if mine != string(theirs) {
			t.Errorf("%q vs %q", mine, theirs)
		}
	}
}

// ── 초대 코드 ────────────────────────────────────────────────────────────────

func inviteRepo() *fakeRepo {
	repo := newRepo()
	repo.eligible["t1"] = true
	repo.users["m1"] = true
	repo.peers["t1"] = Peer{ID: "t1", DisplayName: "코치", TrainerIntent: true, CoachBio: "근비대", CoachTags: []string{"hypertrophy"}}
	return repo
}

func TestInvite_만들기_옛코드_회수_충돌이면_다시_뽑기(t *testing.T) {
	repo := inviteRepo()
	svc, _, _ := v2Svc(repo)
	ctx := context.Background()
	first, err := svc.CreateInvite(ctx, "t1")
	if err != nil || first.Code != "ABCD2345" || !first.ExpiresAt.Equal(testNow.Add(inviteTTL)) {
		t.Fatalf("첫 코드·14일: %+v %v", first, err)
	}
	repo.codeTaken["WXYZ6789"] = true // 다음 코드는 남의 코드와 겹친다 → 그다음 코드
	second, err := svc.CreateInvite(ctx, "t1")
	if err != nil || second.Code != "MNPQ0123" {
		t.Fatalf("겹치면 다시 뽑는다: %+v %v", second, err)
	}
	if _, _, err := svc.GetInvite(ctx, "m1", "ABCD2345"); codeOf(t, err) != errs.NotFound {
		t.Fatalf("옛 코드는 회수됐다: %v", err)
	}
	mine, ok, err := svc.GetMyInvite(ctx, "t1")
	if err != nil || !ok || mine.Code != "MNPQ0123" {
		t.Fatalf("내 코드: %+v %v %v", mine, ok, err)
	}
	// 감사 invite_create — 관계 없음(grant "") · 코드 끝 2자만.
	i := slices.IndexFunc(repo.audits, func(a AuditEntry) bool { return a.Action == ActionInviteCreate })
	if i < 0 || repo.auditGrants[i] != "" || !strings.Contains(string(repo.auditDetails[i]), `"codeTail":"45"`) ||
		strings.Contains(string(repo.auditDetails[i]), "ABCD2345") {
		t.Fatalf("invite_create 감사: %v %s", repo.auditGrants, repo.auditDetails)
	}
	// 의향 없는 사람은 못 만든다.
	repo.eligible["x"] = false
	if _, err := svc.CreateInvite(ctx, "x"); err == nil {
		t.Fatal("코칭 의향이 없으면 거절")
	}
}

func TestInvite_조회는_정리한_코드로_코치_카드(t *testing.T) {
	repo := inviteRepo()
	svc, _, _ := v2Svc(repo)
	ctx := context.Background()
	if _, err := svc.CreateInvite(ctx, "t1"); err != nil {
		t.Fatal(err)
	}
	peer, inv, err := svc.GetInvite(ctx, "m1", " abcd-2345 ")
	if err != nil || peer.DisplayName != "코치" || peer.CoachBio != "근비대" || inv.Code != "ABCD2345" {
		t.Fatalf("하이픈·공백·소문자 정리: %+v %+v %v", peer, inv, err)
	}
	// 모두 같은 NotFound 문구 — 없음 · 형식 틀림.
	for _, code := range []string{"ZZZZ9999", "ABC", "ABCD-234U"} {
		_, _, err := svc.GetInvite(ctx, "m1", code)
		if codeOf(t, err) != errs.NotFound || domainMsg(t, err) != msgInviteNotFound {
			t.Fatalf("%s: 같은 NotFound: %v", code, err)
		}
	}
	// 내 코드.
	_, _, err = svc.GetInvite(ctx, "t1", "ABCD2345")
	if codeOf(t, err) != errs.Validation || domainMsg(t, err) != msgOwnInvite {
		t.Fatalf("내 코드: %v", err)
	}
	// 코치가 의향을 내리면 코드는 죽은 것과 같다.
	repo.eligible["t1"] = false
	if _, _, err := svc.GetInvite(ctx, "m1", "ABCD2345"); domainMsg(t, err) != msgInviteNotFound {
		t.Fatalf("의향 끔 → NotFound: %v", err)
	}
	repo.eligible["t1"] = true
	repo.blocked = true
	if _, _, err := svc.GetInvite(ctx, "m1", "ABCD2345"); domainMsg(t, err) != msgInviteNotFound {
		t.Fatalf("차단 → NotFound(있는 줄도 모르게): %v", err)
	}
}

func TestInvite_만료는_조회할_때_회수하고_NotFound(t *testing.T) {
	repo := inviteRepo()
	repo.invites["i1"] = Invite{ID: "i1", Code: "ABCD2345", TrainerID: "t1", ExpiresAt: testNow.Add(-time.Second)}
	svc, _, _ := v2Svc(repo)
	_, _, err := svc.GetInvite(context.Background(), "m1", "ABCD2345")
	if codeOf(t, err) != errs.NotFound || domainMsg(t, err) != msgInviteNotFound {
		t.Fatalf("만료: %v", err)
	}
	if !repo.revokedInvite["i1"] {
		t.Fatal("만료 코드는 회수된다")
	}
	if _, ok, _ := svc.GetMyInvite(context.Background(), "t1"); ok {
		t.Fatal("내 코드도 없다")
	}
}

func TestInvite_수락하면_바로_연결_알림_대화방_감사(t *testing.T) {
	repo := inviteRepo()
	repo.invites["i1"] = Invite{ID: "i1", Code: "ABCD2345", TrainerID: "t1", ExpiresAt: testNow.Add(time.Hour)}
	svc, notes, direct := v2Svc(repo)
	sc := Scope{LogView: true, PastRecords: true}
	g, err := svc.AcceptInvite(context.Background(), "m1", "abcd2345", &sc)
	if err != nil {
		t.Fatal(err)
	}
	stored := repo.grants[g.ID]
	if stored.Status != StatusActive || ScopeOf(stored.Scope) != sc || stored.ConsentAt.IsZero() || g.RoleOfMe != SideMember {
		t.Fatalf("활성·범위·동의 시각: %+v", stored)
	}
	if len(notes.got) != 1 || notes.got[0] != (refNote{"t1", "m1", notifyKindCoachingAccept, g.ID}) {
		t.Fatalf("코치에게 수락 알림: %+v", notes.got)
	}
	if len(direct.opened) != 1 {
		t.Fatalf("대화방: %+v", direct.opened)
	}
	i := slices.IndexFunc(repo.audits, func(a AuditEntry) bool { return a.Action == ActionInviteAccept })
	if i < 0 || repo.auditGrants[i] != g.ID || !strings.Contains(string(repo.auditDetails[i]), `"codeTail":"45"`) {
		t.Fatalf("invite_accept 감사: %+v", repo.audits)
	}
	// 같은 코치와 이미 활성 — Conflict.
	_, err = svc.AcceptInvite(context.Background(), "m1", "ABCD2345", nil)
	if codeOf(t, err) != errs.Conflict || domainMsg(t, err) != msgAlreadyConnected {
		t.Fatalf("이미 연결: %v", err)
	}
}

func TestInvite_같은_쌍의_옛_관계는_되살리고_범위는_새로(t *testing.T) {
	repo := inviteRepo()
	repo.invites["i1"] = Invite{ID: "i1", Code: "ABCD2345", TrainerID: "t1", ExpiresAt: testNow.Add(time.Hour)}
	repo.grants["g-old"] = Grant{ID: "g-old", TrainerID: "t1", MemberID: "m1", Status: StatusRevoked,
		Scope: Scope{LogView: true, BodyView: true, PastRecords: true}.asMap()}
	svc, _, _ := v2Svc(repo)
	g, err := svc.AcceptInvite(context.Background(), "m1", "ABCD2345", nil)
	if err != nil {
		t.Fatal(err)
	}
	if g.ID != "g-old" || len(repo.grants) != 1 || ScopeOf(repo.grants["g-old"].Scope) != DefaultScope() {
		t.Fatalf("같은 행 · 범위 없으면 기본값: %+v %d", repo.grants["g-old"], len(repo.grants))
	}
}

func TestInvite_다른_코치가_있으면_Conflict_본인_코드는_거절(t *testing.T) {
	repo := inviteRepo()
	repo.invites["i1"] = Invite{ID: "i1", Code: "ABCD2345", TrainerID: "t1", ExpiresAt: testNow.Add(time.Hour)}
	repo.grants["g9"] = Grant{ID: "g9", TrainerID: "t9", MemberID: "m1", Status: StatusActive}
	svc, notes, _ := v2Svc(repo)
	_, err := svc.AcceptInvite(context.Background(), "m1", "ABCD2345", nil)
	if codeOf(t, err) != errs.Conflict || domainMsg(t, err) != msgOneCoach {
		t.Fatalf("코치 한 명: %v", err)
	}
	if _, _, err := svc.GetInvite(context.Background(), "m1", "ABCD2345"); domainMsg(t, err) != msgOneCoach {
		t.Fatalf("조회 때도 범위 시트 전에 알린다: %v", err)
	}
	if _, err := svc.AcceptInvite(context.Background(), "t1", "ABCD2345", nil); domainMsg(t, err) != msgOwnInvite {
		t.Fatalf("본인 코드: %v", err)
	}
	if _, err := svc.AcceptInvite(context.Background(), "", "ABCD2345", nil); codeOf(t, err) != errs.Unauthorized {
		t.Fatalf("로그인 필수: %v", err)
	}
	if len(notes.got) != 0 {
		t.Fatal("실패면 알림 없음")
	}
}

func TestInviteCode_모양(t *testing.T) {
	for i := 0; i < 200; i++ {
		c := randomInviteCode()
		if len(c) != 8 {
			t.Fatalf("8자: %q", c)
		}
		if got, ok := normalizeInviteCode(c); !ok || got != c {
			t.Fatalf("만든 코드는 그대로 읽힌다: %q", c)
		}
	}
	for in, want := range map[string]string{"abcd-efgh": "ABCDEFGH", "OIL0-1234": "01101234", "ab cd 23 45": "ABCD2345"} {
		if got, ok := normalizeInviteCode(in); !ok || got != want {
			t.Errorf("%q → %q(%v), want %q", in, got, ok, want)
		}
	}
	for _, bad := range []string{"", "ABCDEFG", "ABCDEFGHJ", "ABCDEFGU", "가나다라마바사아"} {
		if _, ok := normalizeInviteCode(bad); ok {
			t.Errorf("%q 는 형식 밖", bad)
		}
	}
}

func TestInviteGuard_분당_상한과_하루_실패_상한(t *testing.T) {
	hd := http.Header{}
	hd.Set("X-Forwarded-For", "203.0.113.7, 10.0.0.1")
	g := newInviteGuard(InviteLimits{PerMinute: 2, FailsPerDay: 2})
	if g.allow("u1", hd) != nil || g.allow("u1", hd) != nil {
		t.Fatal("두 번까지 된다")
	}
	err := g.allow("u1", hd)
	if codeOf(t, err) != errs.ResourceExhausted || domainMsg(t, err) != msgTryLater {
		t.Fatalf("셋째는 「잠시 뒤 다시 해 주세요」: %v", err)
	}
	// 같은 IP 의 다른 사람도 IP 키에 걸린다.
	if g.allow("u2", hd) == nil {
		t.Fatal("IP 분당 상한")
	}

	f := newInviteGuard(InviteLimits{PerMinute: 0, FailsPerDay: 2})
	notFound := errs.New(errs.NotFound, msgInviteNotFound)
	f.recordFailure("u3", nil, errs.New(errs.Conflict, msgOneCoach)) // 코드를 틀린 게 아니면 세지 않는다
	f.recordFailure("u3", nil, notFound)
	if f.allow("u3", nil) != nil {
		t.Fatal("실패 1번은 아직 된다")
	}
	f.recordFailure("u3", nil, notFound)
	if codeOf(t, f.allow("u3", nil)) != errs.ResourceExhausted {
		t.Fatal("하루 실패 상한")
	}
	if newInviteGuard(InviteLimits{}).allow("u3", nil) != nil {
		t.Fatal("0 이면 끈다")
	}
}

// ── 지난 기록 컷(visibleFrom) · 체중 칸 ───────────────────────────────────

func consentGrant(repo *fakeRepo, consent time.Time, sc Scope) {
	repo.grants["g1"] = Grant{
		ID: "g1", TrainerID: "t1", MemberID: "m1", Status: StatusActive,
		RequestedBy: SideMember, Scope: sc.asMap(), ConsentAt: consent,
	}
}

func cutRecords(consent time.Time) []MemberRecord {
	before := consent.Add(-time.Second).UnixMilli()
	after := consent.Add(time.Second).UnixMilli()
	return []MemberRecord{
		rec("workouts", "w-before", map[string]any{"id": "w-before", "state": "completed", "started_at": before, "total_volume_kg": 100, "name": "전"}),
		rec("workouts", "w-after", map[string]any{"id": "w-after", "state": "completed", "started_at": after, "total_volume_kg": 200, "name": "후"}),
		rec("workout_exercises", "we-b", map[string]any{"id": "we-b", "workout_id": "w-before", "exercise_id": "seed"}),
		rec("workout_exercises", "we-a", map[string]any{"id": "we-a", "workout_id": "w-after", "exercise_id": "seed"}),
		rec("set_logs", "s-b", map[string]any{"id": "s-b", "workout_exercise_id": "we-b", "weight_kg": 50, "reps": 5}),
		rec("set_logs", "s-a", map[string]any{"id": "s-a", "workout_exercise_id": "we-a", "weight_kg": 60, "reps": 5}),
		rec("bodyweight_logs", "bw-b", map[string]any{"id": "bw-b", "measured_at": before, "weight_kg": 80}),
		rec("bodyweight_logs", "bw-a", map[string]any{
			"id": "bw-a", "measured_at": after, "weight_kg": 79.5, "skeletal_muscle_kg": 35, "body_fat_pct": 18,
			"note": "아침 공복", "source": "manual", "created_at": after, "updated_at": after,
		}),
	}
}

func TestVisibleFrom_동의_1초_전_운동은_0건(t *testing.T) {
	consent := testNow.Add(-3 * day)
	repo := newRepo()
	consentGrant(repo, consent, DefaultScope())
	repo.records = cutRecords(consent)
	svc, _, _ := summarySvc(repo)
	start, end := testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli()

	r, err := svc.GetMemberRecords(context.Background(), "t1", "m1", start, end)
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(decodeAll(t, r.Workouts)); !slices.Equal(got, []string{"w-after"}) {
		t.Fatalf("동의 1초 전 운동은 0건(뒤만): %v", got)
	}
	if got := ids(decodeAll(t, r.SetLogs)); !slices.Equal(got, []string{"s-a"}) {
		t.Fatalf("그 세트도: %v", got)
	}
	if !r.ServedStart.Equal(consent) {
		t.Fatalf("servedStart = 동의 시각: %v vs %v", r.ServedStart, consent)
	}

	rep, err := svc.GetMemberReport(context.Background(), "t1", "m1")
	if err != nil {
		t.Fatal(err)
	}
	if rep.SessionsCount != 1 || rep.TotalVolumeKg != 200 {
		t.Fatalf("옛 리포트도 같은 컷: %+v", rep)
	}

	// 지난 기록을 켜면 둘 다.
	consentGrant(repo, consent, Scope{LogView: true, PastRecords: true})
	r, err = svc.GetMemberRecords(context.Background(), "t1", "m1", start, end)
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(decodeAll(t, r.Workouts)); !slices.Equal(got, []string{"w-after", "w-before"}) {
		t.Fatalf("pastRecords 면 앞 기록도: %v", got)
	}
	if !r.ServedStart.Equal(testNow.Add(-56 * day)) {
		t.Fatalf("pastRecords 면 직전 기간까지: %v", r.ServedStart)
	}
}

func TestVisibleFrom_동의가_기간_뒤면_빈_기간(t *testing.T) {
	repo := newRepo()
	consentGrant(repo, testNow.Add(-time.Hour), DefaultScope())
	repo.records = cutRecords(testNow.Add(-5 * day))
	svc, _, _ := summarySvc(repo)
	r, err := svc.GetMemberRecords(context.Background(), "t1", "m1", testNow.Add(-28*day).UnixMilli(), testNow.Add(-2*day).UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	if len(r.Workouts) != 0 || r.ServedStart.After(r.ServedEnd) {
		t.Fatalf("빈 기간·start ≤ end: %+v", r)
	}
}

func TestBodyView_끄면_읽지도_싣지도_않고_켜면_다섯_칸만(t *testing.T) {
	consent := testNow.Add(-3 * day)
	start, end := testNow.Add(-28*day).UnixMilli(), testNow.UnixMilli()

	repo := newRepo()
	consentGrant(repo, consent, DefaultScope())
	repo.records = cutRecords(consent)
	svc, _, _ := summarySvc(repo)
	r, err := svc.GetMemberRecords(context.Background(), "t1", "m1", start, end)
	if err != nil {
		t.Fatal(err)
	}
	if len(r.BodyweightLogs) != 0 || slices.Contains(repo.periodReads, bodyRecordCollection) {
		t.Fatalf("bodyView 없이는 0건·조회도 없음: %v %v", r.BodyweightLogs, repo.periodReads)
	}

	repo = newRepo()
	consentGrant(repo, consent, Scope{LogView: true, BodyView: true})
	repo.records = cutRecords(consent)
	svc, _, _ = summarySvc(repo)
	r, err = svc.GetMemberRecords(context.Background(), "t1", "m1", start, end)
	if err != nil {
		t.Fatal(err)
	}
	rows := decodeAll(t, r.BodyweightLogs)
	if got := ids(rows); !slices.Equal(got, []string{"bw-a"}) {
		t.Fatalf("동의 뒤 체중만: %v", got)
	}
	keys := make([]string, 0)
	for k := range rows[0] {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	want := slices.Clone(bodyRecordFields)
	sort.Strings(want)
	if !slices.Equal(keys, want) {
		t.Fatalf("칸은 id·measured_at·weight_kg·skeletal_muscle_kg·body_fat_pct 만: %v", keys)
	}
	if strings.Contains(strings.Join(r.BodyweightLogs, ""), "아침 공복") {
		t.Fatal("note 는 나가지 않는다")
	}
}

func TestBodyRecordFields_고정(t *testing.T) {
	if !slices.Equal(bodyRecordFields, []string{"id", "measured_at", "weight_kg", "skeletal_muscle_kg", "body_fat_pct"}) {
		t.Fatalf("체중 허용 칸이 바뀌었다: %v", bodyRecordFields)
	}
	if bodyRecordCollection != "bodyweight_logs" {
		t.Fatal(bodyRecordCollection)
	}
}
