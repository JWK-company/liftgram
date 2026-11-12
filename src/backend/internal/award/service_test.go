package award

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// fakeRepo — 규칙만 시험한다(SQL 집계는 e2e 시험 DB 에서).
type fakeRepo struct {
	mu      sync.Mutex
	roles   map[string]string
	users   map[string]User
	days    []DayCount
	likes   []LikeCount
	months  map[string]Month
	awards  []Award
	blocked map[[2]string]bool
	ensures int
	// 확정을 쓴 직후 요청을 끊는다(창 닫기 흉내)
	cancelOnAnnounce func()
}

func newFake() *fakeRepo {
	return &fakeRepo{roles: map[string]string{}, users: map[string]User{}, months: map[string]Month{}, blocked: map[[2]string]bool{}}
}

func (f *fakeRepo) UserRole(_ context.Context, id string) (string, bool, error) {
	r, ok := f.roles[id]
	return r, ok, nil
}
func (f *fakeRepo) WorkoutDays(_ context.Context, _, _ time.Time, only string) ([]DayCount, error) {
	var out []DayCount
	for _, d := range f.days {
		if only == "" || d.UserID == only {
			out = append(out, d)
		}
	}
	return out, nil
}
func (f *fakeRepo) Likes(_ context.Context, _, _ time.Time, only string, limit int) ([]LikeCount, error) {
	var out []LikeCount
	for _, l := range f.likes {
		if only == "" || l.UserID == only {
			out = append(out, l)
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
func (f *fakeRepo) Users(_ context.Context, ids []string) ([]User, error) {
	var out []User
	for _, id := range ids {
		if u, ok := f.users[id]; ok {
			out = append(out, u)
		}
	}
	return out, nil
}
func (f *fakeRepo) SearchUsers(context.Context, string) ([]User, error) { return nil, nil }
func (f *fakeRepo) EnsureMonth(_ context.Context, m, seed, hash string) (Month, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.ensures++
	if x, ok := f.months[m]; ok {
		return x, nil
	}
	x := Month{Month: m, Seed: seed, SeedHash: hash, Status: StatusOpen}
	f.months[m] = x
	return x, nil
}
func (f *fakeRepo) GetMonth(_ context.Context, m string) (Month, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	x, ok := f.months[m]
	return x, ok, nil
}
func (f *fakeRepo) Announce(_ context.Context, m, _, _ string, aw []NewAward) (bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	x := f.months[m]
	if x.Status != StatusOpen {
		return false, nil
	}
	x.Status = StatusAnnounced
	f.months[m] = x
	if f.cancelOnAnnounce != nil {
		f.cancelOnAnnounce()
	}
	for _, a := range aw {
		f.awards = append(f.awards, Award{ID: a.ID, Month: a.Month, Category: a.Category, UserID: a.UserID, Rank: a.Rank,
			Reason: a.Reason, Days: a.Days, Likes: a.Likes, Public: true, Name: f.users[a.UserID].Name})
	}
	return true, nil
}
func (f *fakeRepo) ListAnnounced(context.Context, int) ([]Month, error) {
	var out []Month
	for _, m := range f.months {
		if m.Status == StatusAnnounced {
			out = append(out, m)
		}
	}
	return out, nil
}
func (f *fakeRepo) AwardsForMonths(_ context.Context, ms []string) ([]Award, error) {
	var out []Award
	for _, a := range f.awards {
		if slices.Contains(ms, a.Month) {
			out = append(out, a)
		}
	}
	return out, nil
}
func (f *fakeRepo) AwardsByUser(_ context.Context, id string) ([]Award, error) {
	var out []Award
	for _, a := range f.awards {
		if a.UserID == id {
			out = append(out, a)
		}
	}
	return out, nil
}
func (f *fakeRepo) GetAward(_ context.Context, id string) (Award, bool, error) {
	for _, a := range f.awards {
		if a.ID == id {
			return a, true, nil
		}
	}
	return Award{}, false, nil
}
func (f *fakeRepo) idx(id string) int {
	for i, a := range f.awards {
		if a.ID == id {
			return i
		}
	}
	return -1
}
func (f *fakeRepo) MarkClaimed(_ context.Context, id, uid string, c bool) (bool, error) {
	i := f.idx(id)
	if i < 0 || f.awards[i].UserID != uid {
		return false, nil
	}
	if c {
		t := time.Now()
		f.awards[i].ClaimedAt = &t
	} else {
		f.awards[i].ClaimedAt = nil
	}
	return true, nil
}
func (f *fakeRepo) SetPublic(_ context.Context, id, uid string, p bool) (bool, error) {
	i := f.idx(id)
	if i < 0 || f.awards[i].UserID != uid {
		return false, nil
	}
	f.awards[i].Public = p
	return true, nil
}
func (f *fakeRepo) SetCoupon(_ context.Context, id, code, item string, _ *time.Time, _ string) (bool, error) {
	i := f.idx(id)
	if i < 0 {
		return false, nil
	}
	f.awards[i].CouponCode, f.awards[i].CouponItem = code, item
	return true, nil
}
func (f *fakeRepo) BlockedEither(_ context.Context, a, b string) (bool, error) {
	return f.blocked[[2]string{a, b}] || f.blocked[[2]string{b, a}], nil
}

type fakeNotify struct {
	mu   sync.Mutex
	sent []string
}

func (n *fakeNotify) NotifySelf(_ context.Context, uid, kind, ref string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.sent = append(n.sent, uid+"|"+kind+"|"+ref)
}

func at(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", s, KST)
	if err != nil {
		panic(err)
	}
	return t
}

func okUser(id string) User {
	v := at("2026-01-01 00:00")
	return User{ID: id, Name: "이름" + id, Role: "user", EmailVerifiedAt: &v, AgeConfirmedAt: &v, CreatedAt: at("2026-01-01 00:00")}
}

var idSeq atomic.Int32

func setup(now string) (*Service, *fakeRepo, *fakeNotify) {
	f := newFake()
	n := &fakeNotify{}
	idSeq.Store(0)
	s := NewService(f, n, func() string { return fmt.Sprintf("aw%d", idSeq.Add(1)) })
	s.now = func() time.Time { return at(now) }
	s.seed = func() string { return "seed-fixed" }
	f.roles["admin1"] = "admin"
	f.roles["mod1"] = "moderator"
	for _, id := range []string{"u1", "u2", "u3", "u4", "u5", "u6"} {
		f.users[id] = okUser(id)
		f.roles[id] = "user"
	}
	return s, f, n
}

func codeOf(t *testing.T, err error) errs.Code {
	t.Helper()
	var d *errs.DomainError
	if !errors.As(err, &d) {
		t.Fatalf("도메인 오류가 아니다: %v", err)
	}
	return d.Code
}

func TestMonthBounds_KST(t *testing.T) {
	from, to, err := MonthBounds("2026-10")
	if err != nil {
		t.Fatal(err)
	}
	if !from.Equal(at("2026-10-01 00:00")) || !to.Equal(at("2026-11-01 00:00")) {
		t.Fatalf("경계: %v ~ %v", from, to)
	}
	// 10월 31일 23:59 KST 는 10월, UTC 로는 같은 날 14:59
	if MonthOf(at("2026-10-31 23:59")) != "2026-10" || MonthOf(at("2026-11-01 00:00")) != "2026-11" {
		t.Fatal("달 판정")
	}
	if MonthOf(time.Date(2026, 10, 31, 15, 0, 0, 0, time.UTC)) != "2026-11" {
		t.Fatal("UTC 15시 = KST 다음 날 0시")
	}
	for _, bad := range []string{"2026-13", "2026-1", "26-10", "", "2026-10-01"} {
		if _, _, err := MonthBounds(bad); err == nil {
			t.Fatalf("잘못된 달 %q 를 받았다", bad)
		}
	}
}

func TestEligible_이유(t *testing.T) {
	end := at("2026-11-01 00:00")
	u := okUser("x")
	if ok, why := Eligible(u, end); !ok || len(why) != 0 {
		t.Fatalf("자격 있어야: %v", why)
	}
	u.Role, u.StatsExcluded, u.EmailVerifiedAt, u.AgeConfirmedAt = "admin", true, nil, nil
	u.CreatedAt = at("2026-10-26 00:00")
	_, why := Eligible(u, end)
	for _, w := range []string{"role", "excluded", "email", "age", "new"} {
		if !slices.Contains(why, w) {
			t.Fatalf("이유 %s 가 빠졌다: %v", w, why)
		}
	}
	// 정확히 7일 전 가입은 자격 있음
	v := okUser("y")
	v.CreatedAt = at("2026-10-25 00:00")
	if ok, _ := Eligible(v, end); !ok {
		t.Fatal("7일 경계")
	}
}

func TestDraw_결정적이고_제외를_뺀다(t *testing.T) {
	pool := []string{"a", "b", "c", "d", "e"}
	x := Draw("s1", pool, nil, 3)
	y := Draw("s1", []string{"e", "d", "c", "b", "a"}, nil, 3)
	if !slices.Equal(x, y) || len(x) != 3 {
		t.Fatalf("같은 씨앗·같은 후보면 같은 결과: %v %v", x, y)
	}
	z := Draw("s1", pool, []string{x[0]}, 3)
	if slices.Contains(z, x[0]) || len(z) != 3 {
		t.Fatalf("제외한 사람이 뽑혔다: %v", z)
	}
	if got := Draw("s1", []string{"a"}, nil, 3); len(got) != 1 {
		t.Fatalf("후보가 적으면 있는 만큼: %v", got)
	}
	if Draw("s2", pool, nil, 5)[0] == "" {
		t.Fatal("빈 id")
	}
}

func TestGetMonth_씨앗은_해시만_보이고_한번만_만든다(t *testing.T) {
	s, f, _ := setup("2026-11-12 10:00")
	v, err := s.GetMonth(context.Background(), "u1", "")
	if err != nil {
		t.Fatal(err)
	}
	if v.Month.Month != "2026-11" || v.Month.Seed != "" || v.Month.SeedHash != sha("seed-fixed") {
		t.Fatalf("이번 달·해시만: %+v", v.Month)
	}
	if _, err := s.GetMonth(context.Background(), "", ""); err != nil {
		t.Fatal(err)
	}
	if f.ensures != 1 {
		t.Fatalf("씨앗은 한 번만 만든다: %d", f.ensures)
	}
	if _, err := s.GetMonth(context.Background(), "u1", "2026-12"); codeOf(t, err) != errs.Validation {
		t.Fatal("미래 달 거부")
	}
}

func TestGetMonth_내_현황(t *testing.T) {
	s, f, _ := setup("2026-11-12 10:00")
	f.days = []DayCount{{UserID: "u1", Days: 5, Late: 1}, {UserID: "u2", Days: 20}}
	f.likes = []LikeCount{{UserID: "u1", Likes: 7, Likers: 3}}
	nu := okUser("u1")
	nu.CreatedAt = at("2026-11-28 00:00") // 그 달 끝 기준 7일 안
	f.users["u1"] = nu
	v, err := s.GetMonth(context.Background(), "u1", "")
	if err != nil {
		t.Fatal(err)
	}
	if v.MyDays != 5 || v.MyLikes != 7 || v.Eligible || !slices.Contains(v.Reasons, "new") {
		t.Fatalf("내 현황: %+v", v)
	}
}

func confirmMonth(t *testing.T) (*Service, *fakeRepo, *fakeNotify) {
	t.Helper()
	s, f, n := setup("2026-12-03 00:00")
	f.days = []DayCount{{UserID: "u1", Days: 12}, {UserID: "u2", Days: 15}, {UserID: "u3", Days: 30}, {UserID: "u4", Days: 13}, {UserID: "u5", Days: 3}}
	f.likes = []LikeCount{{UserID: "u5", Likes: 40, Likers: 9}, {UserID: "u2", Likes: 10, Likers: 4}}
	return s, f, n
}

func TestConfirm_멱등_알림_한번(t *testing.T) {
	s, f, n := confirmMonth(t)
	ctx := context.Background()
	aw, already, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u5", PickID: "u6", PickReason: "첫 달 열심히"})
	if err != nil || already {
		t.Fatalf("첫 확정: %v %v", err, already)
	}
	if len(aw) != 5 {
		t.Fatalf("상 5개(꾸준 3 · 인기 · 픽): %d", len(aw))
	}
	var steady []string
	for _, a := range aw {
		if a.Category == CategorySteady {
			steady = append(steady, a.UserID)
		}
	}
	want := Draw("seed-fixed", []string{"u1", "u2", "u3", "u4"}, []string{"u5", "u6"}, 3)
	slices.Sort(steady)
	slices.Sort(want)
	if !slices.Equal(steady, want) {
		t.Fatalf("꾸준상은 저장된 씨앗으로 뽑는다: %v %v", steady, want)
	}
	if len(n.sent) != 5 {
		t.Fatalf("알림 5번: %v", n.sent)
	}
	aw2, already2, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u2"})
	if err != nil || !already2 || len(aw2) != 5 || len(f.awards) != 5 || len(n.sent) != 5 {
		t.Fatalf("두 번째는 기존 결과·쓰기·알림 없음: %v %v %d %d", err, already2, len(f.awards), len(n.sent))
	}
	v, _ := s.GetMonth(ctx, "", "2026-11")
	if v.Month.Seed != "seed-fixed" || sha(v.Month.Seed) != v.Month.SeedHash {
		t.Fatal("확정 뒤 씨앗 공개 · sha256(seed) = 해시")
	}
}

func TestConfirm_동시에_두번(t *testing.T) {
	s, f, n := confirmMonth(t)
	ctx := context.Background()
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, _ = s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11"})
		}()
	}
	wg.Wait()
	if len(f.awards) != 3 || len(n.sent) != 3 {
		t.Fatalf("한 번만 쓰고 알린다: %d %d", len(f.awards), len(n.sent))
	}
}

func TestConfirm_거부(t *testing.T) {
	s, f, _ := confirmMonth(t)
	ctx := context.Background()
	if _, _, err := s.Confirm(ctx, "mod1", "moderator", ConfirmInput{Month: "2026-11"}); codeOf(t, err) != errs.Forbidden {
		t.Fatal("모더레이터는 막힌다")
	}
	if _, _, err := s.Confirm(ctx, "u1", "admin", ConfirmInput{Month: "2026-11"}); codeOf(t, err) != errs.Forbidden {
		t.Fatal("토큰만 admin 이면 막힌다(DB 역할)")
	}
	if _, _, err := s.Confirm(ctx, "", "", ConfirmInput{Month: "2026-11"}); codeOf(t, err) != errs.Unauthorized {
		t.Fatal("비로그인")
	}
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-12"}); codeOf(t, err) != errs.Validation {
		t.Fatal("끝나지 않은 달")
	}
	s.now = func() time.Time { return at("2026-12-02 23:59") }
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11"}); codeOf(t, err) != errs.Validation {
		t.Fatal("다음 달 3일 0시 전")
	}
	s.now = func() time.Time { return at("2026-12-03 00:00") }
	// 픽 이유 한 글자는 받지 않는다(화면과 같은 규칙 · REV-156 화면 4)
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PickID: "u6", PickReason: "x"}); codeOf(t, err) != errs.Validation {
		t.Fatalf("한 글자 이유를 받았다: %v", err)
	}
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u5", PickID: "u5", PickReason: "x"}); codeOf(t, err) != errs.Validation {
		t.Fatal("인기 = 픽")
	}
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PickID: "u6"}); codeOf(t, err) != errs.Validation {
		t.Fatal("픽 이유 필수")
	}
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u6"}); codeOf(t, err) != errs.Validation {
		t.Fatal("좋아요 0 은 인기상 불가")
	}
	bad := okUser("u4")
	bad.EmailVerifiedAt = nil
	f.users["u4"] = bad
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PickID: "u4", PickReason: "열심히"}); codeOf(t, err) != errs.Validation {
		t.Fatal("자격 없는 픽")
	}
	if len(f.awards) != 0 {
		t.Fatal("거부는 쓰지 않는다")
	}
	// 자격 없는 꾸준 후보는 추첨에 들지 않는다
	aw, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11"})
	if err != nil {
		t.Fatal(err)
	}
	for _, a := range aw {
		if a.UserID == "u4" || a.UserID == "u5" {
			t.Fatalf("자격 없음·12일 미만이 뽑혔다: %v", a.UserID)
		}
	}
}

func TestDrawPreview_저장된_씨앗과_확정이_같다(t *testing.T) {
	s, _, _ := confirmMonth(t)
	ctx := context.Background()
	picked, pool, err := s.DrawPreview(ctx, "admin1", "admin", "2026-11", []string{"u2"})
	if err != nil || pool != 3 {
		t.Fatalf("미리보기: %v %d", err, pool)
	}
	aw, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u2"})
	if err != nil {
		t.Fatal(err)
	}
	var a, b []string
	for _, c := range picked {
		a = append(a, c.User.ID)
	}
	for _, x := range aw {
		if x.Category == CategorySteady {
			b = append(b, x.UserID)
		}
	}
	slices.Sort(a)
	slices.Sort(b)
	if !slices.Equal(a, b) {
		t.Fatalf("미리보기 = 확정: %v %v", a, b)
	}
}

func TestBoard_후보와_자격(t *testing.T) {
	s, f, _ := confirmMonth(t)
	x := okUser("u3")
	x.StatsExcluded = true
	f.users["u3"] = x
	b, err := s.Candidates(context.Background(), "admin1", "admin", "2026-11")
	if err != nil {
		t.Fatal(err)
	}
	if len(b.Steady) != 4 || !b.Confirmable || b.Month.Seed != "" {
		t.Fatalf("꾸준 후보 4 · 확정 가능 · 씨앗 숨김: %+v", b)
	}
	for _, c := range b.Steady {
		if c.User.ID == "u3" && (c.Eligible || !slices.Contains(c.Reasons, "excluded")) {
			t.Fatal("자격 이유 표시")
		}
	}
	if len(b.Popular) != 2 || b.Popular[0].User.ID != "u5" || b.Popular[0].Likers != 9 {
		t.Fatalf("인기 순위: %+v", b.Popular)
	}
	if _, err := s.Candidates(context.Background(), "mod1", "moderator", "2026-11"); codeOf(t, err) != errs.Forbidden {
		t.Fatal("admin 만")
	}
}

func TestMine_본인만_쿠폰_번호는_한건에서만(t *testing.T) {
	s, f, _ := confirmMonth(t)
	ctx := context.Background()
	aw, _, _ := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11"})
	id, owner := aw[0].ID, aw[0].UserID
	other := "u6"
	if err := s.MarkClaimed(ctx, owner, id, true); codeOf(t, err) != errs.Validation {
		t.Fatal("번호 없으면 받음 불가")
	}
	if err := s.SetCoupon(ctx, "mod1", "moderator", id, "ABCD-1234-5678", "닭가슴살 1만원", "2027-01-31"); codeOf(t, err) != errs.Forbidden {
		t.Fatal("쿠폰은 admin 만")
	}
	if err := s.SetCoupon(ctx, "admin1", "admin", id, "ABCD-1234-5678", "닭가슴살 1만원", "2027/01/31"); codeOf(t, err) != errs.Validation {
		t.Fatal("기한 형식")
	}
	// 지난 기한은 받지 않는다(REV-156 화면 7)
	if err := s.SetCoupon(ctx, "admin1", "admin", id, "ABCD-1234-5678", "닭가슴살 1만원", "2020-01-01"); codeOf(t, err) != errs.Validation {
		t.Fatalf("지난 기한을 받았다: %v", err)
	}
	if err := s.SetCoupon(ctx, "admin1", "admin", id, "ABCD-1234-5678", "닭가슴살 1만원", "2027-01-31"); err != nil {
		t.Fatal(err)
	}
	if err := s.SetCoupon(ctx, "admin1", "admin", "nope", "X", "Y", ""); codeOf(t, err) != errs.NotFound {
		t.Fatal("없는 수상")
	}
	list, _ := s.ListMyAwards(ctx, owner)
	if len(list) != 1 || list[0].CouponCode != "" || !list[0].HasCoupon {
		t.Fatalf("목록은 번호 없이 있음만: %+v", list)
	}
	one, err := s.GetMyAward(ctx, owner, id)
	if err != nil || one.CouponCode != "ABCD-1234-5678" {
		t.Fatalf("한 건에서 번호: %v %+v", err, one)
	}
	if _, err := s.GetMyAward(ctx, other, id); codeOf(t, err) != errs.NotFound {
		t.Fatal("남의 수상은 not found")
	}
	if err := s.MarkClaimed(ctx, other, id, true); codeOf(t, err) != errs.NotFound {
		t.Fatal("남의 받음 표시")
	}
	if err := s.SetPublic(ctx, other, id, false); codeOf(t, err) != errs.NotFound {
		t.Fatal("남의 공개 설정")
	}
	if err := s.MarkClaimed(ctx, owner, id, true); err != nil || f.awards[0].ClaimedAt == nil {
		t.Fatal("받음")
	}
	if err := s.MarkClaimed(ctx, owner, id, false); err != nil || f.awards[0].ClaimedAt != nil {
		t.Fatal("받음 되돌리기")
	}
	if Last4("ABCD-1234-5678") != "…5678" || Last4("") != "" || Last4("1234") != "…••••" || Last4("1234567") != "…••••" {
		t.Fatal("뒤 4자리")
	}
}

func TestPublic_숨김과_배지(t *testing.T) {
	s, f, _ := confirmMonth(t)
	ctx := context.Background()
	aw, _, _ := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u5"})
	var pop Award
	for _, a := range aw {
		if a.Category == CategoryPopular {
			pop = a
		}
	}
	if err := s.SetPublic(ctx, "u5", pop.ID, false); err != nil {
		t.Fatal(err)
	}
	ms, _ := s.ListMonths(ctx, 12)
	for _, w := range ms[0].Winners {
		if w.ID == pop.ID && (w.UserID != "" || w.Name != "" || w.Likes != 0 || w.Public) {
			t.Fatalf("비공개 수상자는 비운다: %+v", w)
		}
		if w.CouponCode != "" {
			t.Fatal("공개 모양에 쿠폰 없음")
		}
	}
	if b, _ := s.GetUserBadges(ctx, "u1", "u5"); len(b) != 0 {
		t.Fatal("비공개면 배지 숨김")
	}
	_ = s.SetPublic(ctx, "u5", pop.ID, true)
	if b, _ := s.GetUserBadges(ctx, "u1", "u5"); len(b) != 1 {
		t.Fatal("공개 배지")
	}
	f.blocked[[2]string{"u5", "u1"}] = true
	if b, _ := s.GetUserBadges(ctx, "u1", "u5"); len(b) != 0 {
		t.Fatal("차단이면 빈 목록")
	}
}

func TestListMonths_없으면_빈_목록(t *testing.T) {
	s, _, _ := setup("2026-11-12 10:00")
	ms, err := s.ListMonths(context.Background(), 0)
	if err != nil || ms == nil || len(ms) != 0 {
		t.Fatalf("발표 없음: %v %v", err, ms)
	}
}

func TestGetMonth_지난_달은_씨앗을_만들지_않고_첫_달_전은_거부(t *testing.T) {
	s, f, _ := setup("2027-02-10 10:00")
	v, err := s.GetMonth(context.Background(), "", "2026-12")
	if err != nil || v.Month.SeedHash != "" || f.ensures != 0 {
		t.Fatalf("지난 달은 읽기만: %v %+v %d", err, v.Month, f.ensures)
	}
	if _, err := s.GetMonth(context.Background(), "", "2026-10"); codeOf(t, err) != errs.Validation {
		t.Fatal("첫 달 전 거부")
	}
}

func TestConfirm_상이_없으면_거부_순위_밖_인기상은_다시_센다(t *testing.T) {
	s, f, _ := setup("2026-12-03 00:00")
	if _, _, err := s.Confirm(context.Background(), "admin1", "admin", ConfirmInput{Month: "2026-11"}); codeOf(t, err) != errs.Validation {
		t.Fatal("상 0건 확정 거부")
	}
	// 자격 없는 계정 둘이 순위를 채워도 자격 있는 사람이 표에 남는다
	for _, id := range []string{"z1", "z2"} {
		z := okUser(id)
		z.EmailVerifiedAt = nil
		f.users[id] = z
	}
	f.likes = []LikeCount{{UserID: "z1", Likes: 90}, {UserID: "z2", Likes: 80}, {UserID: "u3", Likes: 4, Likers: 2}}
	b, err := s.Candidates(context.Background(), "admin1", "admin", "2026-11")
	if err != nil || len(b.Popular) != 1 || b.Popular[0].User.ID != "u3" {
		t.Fatalf("자격 있는 사람만: %v %+v", err, b.Popular)
	}
	aw, _, err := s.Confirm(context.Background(), "admin1", "admin", ConfirmInput{Month: "2026-11", PopularID: "u3"})
	if err != nil || len(aw) != 1 || aw[0].Likes != 4 {
		t.Fatalf("인기상: %v %+v", err, aw)
	}
}

type cancelNotify struct{ got []error }

func (c *cancelNotify) NotifySelf(ctx context.Context, _, _, _ string) { c.got = append(c.got, ctx.Err()) }

func TestConfirm_요청이_끊겨도_알림은_보낸다(t *testing.T) {
	s, f, _ := confirmMonth(t)
	cn := &cancelNotify{}
	s.notify = cn
	ctx, cancel := context.WithCancel(context.Background())
	f.cancelOnAnnounce = cancel
	if _, _, err := s.Confirm(ctx, "admin1", "admin", ConfirmInput{Month: "2026-11"}); err != nil {
		t.Fatal(err)
	}
	if len(cn.got) != 3 || cn.got[0] != nil {
		t.Fatalf("끊긴 요청에서도 알림 ctx 는 살아 있다: %v", cn.got)
	}
}
