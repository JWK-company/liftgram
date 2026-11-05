// 피드백 규칙 시험(SPEC-032) — DB 없이. 권한표·섞이지 않음·하루 상한·상태 전이·승인 기록을 본다.
package feedback

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type itemsRepo struct {
	roles     map[string]string
	confirmed map[string]bool
	entries   []Entry
	events    []string
	lastChg   Change
	purgedAt  time.Time
}

func (r *itemsRepo) UserRole(_ context.Context, id string) (string, bool, error) {
	role, ok := r.roles[id]
	return role, ok, nil
}
func (r *itemsRepo) EmailConfirmed(_ context.Context, id string) (bool, error) {
	return r.confirmed[id], nil
}
func (r *itemsRepo) add(e NewEntry) int64 {
	id := int64(len(r.entries) + 1)
	r.entries = append(r.entries, Entry{
		ID: id, Kind: e.Kind, AuthorID: e.AuthorID, AuthorName: "작성자", Category: e.Category,
		Title: e.Title, Body: e.Body, AppVersion: e.AppVersion, Platform: e.Platform, Status: StatusNew,
	})
	return id
}
func (r *itemsRepo) Create(_ context.Context, e NewEntry) (int64, error) { return r.add(e), nil }
func (r *itemsRepo) CreateUserLimited(_ context.Context, e NewEntry, _ time.Time, limit int) (int64, bool, error) {
	n := 0
	for _, x := range r.entries {
		if x.Kind == KindUser && x.AuthorID == e.AuthorID {
			n++
		}
	}
	if n >= limit {
		return 0, true, nil
	}
	return r.add(e), false, nil
}
func (r *itemsRepo) List(_ context.Context, kind string, _ int32) ([]Entry, error) {
	var out []Entry
	for _, e := range r.entries {
		if e.Kind == kind {
			out = append(out, e)
		}
	}
	return out, nil
}
func (r *itemsRepo) ApplyStatus(_ context.Context, id int64, actor string, decide func(Entry) (Change, error)) (Entry, error) {
	for i := range r.entries {
		if r.entries[i].ID != id {
			continue
		}
		c, err := decide(r.entries[i])
		if err != nil {
			return Entry{}, err
		}
		r.lastChg = c
		r.events = append(r.events, actor+":"+r.entries[i].Status+">"+c.To)
		r.entries[i].Status, r.entries[i].Resolution = c.To, c.Note
		return r.entries[i], nil
	}
	return Entry{}, errs.New(errs.NotFound, "찾을 수 없습니다")
}
func (r *itemsRepo) PurgeClosedUser(_ context.Context, before time.Time) (int64, error) {
	r.purgedAt = before
	return 0, nil
}

func newItems() (*Service, *itemsRepo) {
	r := &itemsRepo{
		roles: map[string]string{
			"a": "admin", "c": "coworker", "m": "moderator", "u": "user", "gone": "user",
		},
		confirmed: map[string]bool{"a": true, "c": true, "u": true},
	}
	return NewService(r, func() time.Time { return time.Unix(1_800_000_000, 0) }), r
}

func code(err error) errs.Code {
	var de *errs.DomainError
	if errors.As(err, &de) {
		return de.Code
	}
	return ""
}

func TestUserFeedback_권한과_검증(t *testing.T) {
	s, r := newItems()
	ctx := context.Background()
	if _, err := s.SubmitUser(ctx, "", "좋아요", "", ""); code(err) != errs.Unauthorized {
		t.Fatalf("비로그인 401: %v", err)
	}
	if _, err := s.SubmitUser(ctx, "m", "메일 미확인 계정", "", ""); code(err) != errs.Forbidden {
		t.Fatalf("메일 미확인 403: %v", err)
	}
	if _, err := s.SubmitUser(ctx, "u", "   \n ", "", ""); code(err) != errs.Validation {
		t.Fatalf("공백만 거절: %v", err)
	}
	long := make([]rune, userMaxBody+1)
	for i := range long {
		long[i] = '가'
	}
	if _, err := s.SubmitUser(ctx, "u", string(long), "", ""); code(err) != errs.Validation {
		t.Fatalf("2001자 거절: %v", err)
	}
	if _, err := s.SubmitUser(ctx, "u", string(long[:userMaxBody]), "1.2.3", "ios"); err != nil {
		t.Fatalf("2000자는 된다: %v", err)
	}
	got := r.entries[0]
	if got.Kind != KindUser || got.Category != "" || got.AppVersion != "1.2.3" || got.Platform != "ios" {
		t.Fatalf("저장값: %+v", got)
	}
}

func TestUserFeedback_형식이_틀린_버전과_플랫폼은_버린다(t *testing.T) {
	s, r := newItems()
	if _, err := s.SubmitUser(context.Background(), "u", "좋아요", "<script>", "../../etc"); err != nil {
		t.Fatal(err)
	}
	if r.entries[0].AppVersion != "" || r.entries[0].Platform != "" {
		t.Fatalf("버려야 한다: %+v", r.entries[0])
	}
}

func TestUserFeedback_NUL_은_지우고_저장한다(t *testing.T) {
	s, r := newItems()
	if _, err := s.SubmitUser(context.Background(), "u", "좋\x00아요", "", ""); err != nil {
		t.Fatal(err)
	}
	if r.entries[0].Body != "좋아요" {
		t.Fatalf("본문: %q", r.entries[0].Body)
	}
	if _, err := s.SubmitUser(context.Background(), "u", "\x00\x00", "", ""); code(err) != errs.Validation {
		t.Fatalf("NUL 만 있으면 빈 글이다: %v", err)
	}
}

func TestUserFeedback_하루_상한(t *testing.T) {
	s, _ := newItems()
	ctx := context.Background()
	for i := 0; i < userDailyLimit; i++ {
		if _, err := s.SubmitUser(ctx, "u", "의견입니다", "", ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.SubmitUser(ctx, "u", "여섯 번째", "", ""); code(err) != errs.ResourceExhausted {
		t.Fatalf("상한 초과: %v", err)
	}
	if _, err := s.SubmitUser(ctx, "a", "다른 사람은 된다", "", ""); err != nil {
		t.Fatal(err)
	}
}

func TestOps_권한표(t *testing.T) {
	s, _ := newItems()
	ctx := context.Background()
	cases := []struct {
		id, claim string
		want      errs.Code
	}{
		{"", "", errs.Unauthorized},
		{"u", "user", errs.Forbidden},
		{"m", "moderator", errs.Forbidden},
		{"c", "coworker", ""},
		{"a", "admin", ""},
		{"gone", "admin", errs.Forbidden}, // 토큰은 관리자, DB 는 회수됨
		{"nobody", "admin", errs.Forbidden},
	}
	for _, c := range cases {
		if _, err := s.SubmitOps(ctx, c.id, c.claim, "bug", "제목입니다", "내용 다섯자 이상"); code(err) != c.want {
			t.Errorf("SubmitOps(%s): %v", c.id, err)
		}
		if _, err := s.ListEntries(ctx, c.id, c.claim, KindUser); code(err) != c.want {
			t.Errorf("ListEntries(%s): %v", c.id, err)
		}
	}
}

func TestOps_입력_검증(t *testing.T) {
	s, _ := newItems()
	ctx := context.Background()
	if _, err := s.SubmitOps(ctx, "c", "coworker", "bug", "  a  ", "내용 다섯자 이상"); code(err) != errs.Validation {
		t.Fatalf("짧은 제목: %v", err)
	}
	if _, err := s.SubmitOps(ctx, "c", "coworker", "", "제목입니다", "내용 다섯자 이상"); code(err) != errs.Validation {
		t.Fatalf("분류 없음: %v", err)
	}
}

func TestList_종류가_섞이지_않고_작성자는_관리자에게만(t *testing.T) {
	s, _ := newItems()
	ctx := context.Background()
	if _, err := s.SubmitOps(ctx, "c", "coworker", "bug", "운영 제목", "운영 내용입니다"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SubmitUser(ctx, "u", "사용자 의견", "", ""); err != nil {
		t.Fatal(err)
	}
	ops, _ := s.ListEntries(ctx, "c", "coworker", KindOps)
	users, _ := s.ListEntries(ctx, "c", "coworker", KindUser)
	if len(ops) != 1 || ops[0].Title != "운영 제목" || len(users) != 1 || users[0].Body != "사용자 의견" {
		t.Fatalf("섞임: %+v / %+v", ops, users)
	}
	if users[0].AuthorName != "" {
		t.Fatalf("협업자에게 작성자 이름이 나갔다: %+v", users[0])
	}
	asAdmin, _ := s.ListEntries(ctx, "a", "admin", KindUser)
	if asAdmin[0].AuthorName == "" {
		t.Fatal("관리자는 작성자 이름을 본다")
	}
	// 토큰만 관리자인 협업자에게는 나가지 않는다.
	stale, _ := s.ListEntries(ctx, "c", "admin", KindUser)
	if stale[0].AuthorName != "" {
		t.Fatal("옛 관리자 토큰에 이름이 나갔다")
	}
	if _, err := s.ListEntries(ctx, "a", "admin", ""); code(err) != errs.Validation {
		t.Fatalf("종류 없음: %v", err)
	}
}

func TestSetStatus_관리자만(t *testing.T) {
	s, _ := newItems()
	ctx := context.Background()
	id, _ := s.SubmitUser(ctx, "u", "의견입니다", "", "")
	for _, who := range [][2]string{{"c", "coworker"}, {"m", "moderator"}, {"u", "user"}, {"c", "admin"}} {
		if _, err := s.SetStatus(ctx, who[0], who[1], id, StatusDone, ""); code(err) != errs.Forbidden {
			t.Errorf("%v 막혀야 한다: %v", who, err)
		}
	}
	if _, err := s.SetStatus(ctx, "a", "admin", 999, StatusDone, ""); code(err) != errs.NotFound {
		t.Fatalf("없는 건: %v", err)
	}
}

func TestSetStatus_전이표(t *testing.T) {
	all := []string{StatusNew, StatusApproved, StatusRejected, StatusInProgress, StatusDone, ""}
	allowed := map[[2]string]bool{}
	for from, tos := range transitions {
		for _, to := range tos {
			allowed[[2]string{from, to}] = true
		}
	}
	ctx := context.Background()
	for _, from := range all[:5] {
		for _, to := range all {
			s, r := newItems()
			id, _ := s.SubmitUser(ctx, "u", "의견입니다", "", "")
			r.entries[0].Status = from
			_, err := s.SetStatus(ctx, "a", "admin", id, to, "메모")
			if want := allowed[[2]string{from, to}]; (err == nil) != want {
				t.Errorf("%s→%s: 허용=%v, %v", from, to, want, err)
			}
		}
	}
	if len(transitions[StatusDone]) != 0 {
		t.Fatal("완료는 끝이다")
	}
}

func TestSetStatus_승인은_본문_해시와_지시를_남긴다(t *testing.T) {
	s, r := newItems()
	ctx := context.Background()
	id, _ := s.SubmitUser(ctx, "u", "의견입니다", "", "")
	e, err := s.SetStatus(ctx, "a", "admin", id, StatusApproved, "  이렇게 고친다 ")
	if err != nil {
		t.Fatal(err)
	}
	if e.Status != StatusApproved || e.Resolution != "이렇게 고친다" {
		t.Fatalf("결과: %+v", e)
	}
	if len(r.lastChg.ApprovedBodySHA256) != 64 {
		t.Fatalf("해시: %q", r.lastChg.ApprovedBodySHA256)
	}
	if len(r.events) != 1 || r.events[0] != "a:new>approved" {
		t.Fatalf("기록: %v", r.events)
	}
	if _, err := s.SetStatus(ctx, "a", "admin", id, StatusDone, ""); err != nil {
		t.Fatal(err)
	}
	if r.lastChg.ApprovedBodySHA256 != "" {
		t.Fatal("승인이 아니면 해시를 새로 만들지 않는다")
	}
}

func TestPurge_보존기간(t *testing.T) {
	s, r := newItems()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	s.PurgeLoop(ctx, time.Hour)
	if want := s.now().Add(-closedRetention); !r.purgedAt.Equal(want) {
		t.Fatalf("시작할 때 한 번 돈다: %v", r.purgedAt)
	}
}
