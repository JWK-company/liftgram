// 이달의 리프터(SPEC-063 · SRS-117) — 월간 시상 규칙.
//
// 이 파일은 DB·전송을 모른다(가짜 저장소로 시험한다). 핵심 규칙:
//   - 달 경계는 한국 시간(KST). 확정은 끝난 달만, 다음 달 3일 0시 이후(동기 유예 · REV-153).
//   - 씨앗은 그 달 행을 처음 만들 때 서버가 난수로 정하고 해시만 공개한다. 확정 뒤 원문을 공개한다(커밋-공개).
//   - 꾸준상 = 자격 있고 운동한 날 12일 이상 중 sha256(씨앗:id) 작은 3명. 인기상·픽을 먼저 고르고 그 둘은 뺀다.
//   - 확정은 한 번만 이긴다(저장소의 조건부 UPDATE). 알림은 처음 쓴 요청만, 쓰기가 끝난 뒤.
//   - 쿠폰 번호는 본인 한 건 조회에서만 내보내고 로그에 남기지 않는다.
package award

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/access"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	CategorySteady  = "steady"
	CategoryPopular = "popular"
	CategoryPick    = "pick"

	StatusOpen      = "open"
	StatusAnnounced = "announced"

	SteadyThreshold = 12
	SteadyWinners   = 3
	popularTop      = 20
	newAccountDays  = 7
	// 끝난 달은 다음 달 1일 0시 + 이만큼 뒤부터 확정한다(늦게 동기되는 기록을 기다린다).
	confirmGrace = 48 * time.Hour
	// 시작 뒤 이만큼 안에 서버가 받은 운동만 센다(지난 날짜 몰아 올리기 · SQL 의 +3일과 같다).
	lateWindow = 72 * time.Hour
	// 인기 순위는 넉넉히 읽고 자격 있는 사람으로 상위 popularTop 을 채운다(REV-154 M2).
	popularScan = 200
	// 행사 첫 달 — 그 전 달은 받지 않는다(씨앗 행을 아무 달에나 만들지 않게 · REV-154 M3).
	FirstMonth = "2026-11"

	maxCouponCode = 200
	maxCouponItem = 100
	maxReason     = 200
)

// KST — 달·날 경계. 서머타임이 없어 고정 오프셋이면 된다(src/backend/internal/admin/service.go 와 같다).
var KST = time.FixedZone("KST", 9*60*60)

var monthRe = regexp.MustCompile(`^\d{4}-(0[1-9]|1[0-2])$`)

var adminRoles = []string{"admin"}

// User 는 자격 판정에 필요한 계정 값이다.
type User struct {
	ID              string
	Name            string
	Avatar          string
	Role            string
	StatsExcluded   bool
	EmailVerifiedAt *time.Time
	AgeConfirmedAt  *time.Time
	CreatedAt       time.Time
}

type DayCount struct {
	UserID string
	Days   int
	Late   int
}

type LikeCount struct {
	UserID string
	Likes  int
	Likers int
}

type Month struct {
	Month       string
	Seed        string
	SeedHash    string
	Status      string
	AnnouncedAt *time.Time
}

// Award 는 저장된 수상 한 건이다. UserID 가 비면 탈퇴한 수상자다.
type Award struct {
	ID            string
	Month         string
	Category      string
	UserID        string
	Rank          int
	Reason        string
	Days          int
	Likes         int
	Public        bool
	CouponCode    string
	CouponItem    string
	CouponExpires string
	ClaimedAt     *time.Time
	Name          string
	Avatar        string
	// HasCoupon — 목록에서는 번호를 비우고 있음만 알린다.
	HasCoupon bool
}

type NewAward struct {
	ID       string
	Month    string
	Category string
	UserID   string
	Rank     int
	Reason   string
	Days     int
	Likes    int
}

type Repo interface {
	access.RoleReader
	WorkoutDays(ctx context.Context, from, to time.Time, onlyUser string) ([]DayCount, error)
	Likes(ctx context.Context, from, to time.Time, onlyAuthor string, limit int) ([]LikeCount, error)
	Users(ctx context.Context, ids []string) ([]User, error)
	SearchUsers(ctx context.Context, q string) ([]User, error)
	EnsureMonth(ctx context.Context, month, seed, seedHash string) (Month, error)
	GetMonth(ctx context.Context, month string) (Month, bool, error)
	// Announce 는 open 인 달만 announced 로 바꾸고 수상을 쓴다(한 트랜잭션). 이미 확정이면 false.
	Announce(ctx context.Context, month, by, candidatesHash string, awards []NewAward) (bool, error)
	ListAnnounced(ctx context.Context, limit int) ([]Month, error)
	AwardsForMonths(ctx context.Context, months []string) ([]Award, error)
	AwardsByUser(ctx context.Context, userID string) ([]Award, error)
	GetAward(ctx context.Context, id string) (Award, bool, error)
	MarkClaimed(ctx context.Context, id, userID string, claimed bool) (bool, error)
	SetPublic(ctx context.Context, id, userID string, public bool) (bool, error)
	SetCoupon(ctx context.Context, id, code, item string, expires *time.Time, by string) (bool, error)
	BlockedEither(ctx context.Context, a, b string) (bool, error)
}

// Notifier — 수상 알림. actor 는 받는 사람 자신이다(운영자 이름을 보이지 않게 · REV-153).
type Notifier interface {
	NotifySelf(ctx context.Context, userID, kind, refID string)
}

type Service struct {
	repo   Repo
	notify Notifier
	newID  func() string
	now    func() time.Time
	seed   func() string
}

func NewService(repo Repo, notify Notifier, newID func() string) *Service {
	return &Service{repo: repo, notify: notify, newID: newID, now: time.Now, seed: randomSeed}
}

func randomSeed() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand 가 실패하면 계속할 수 없다
	}
	return hex.EncodeToString(b)
}

func sha(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// ── 순수 규칙 ──────────────────────────────────────────────────────────────

// MonthBounds 는 그 달의 KST 1일 0시와 다음 달 1일 0시다.
func MonthBounds(month string) (time.Time, time.Time, error) {
	if !monthRe.MatchString(month) {
		return time.Time{}, time.Time{}, errs.New(errs.Validation, "달은 YYYY-MM 이어야 합니다")
	}
	from, err := time.ParseInLocation("2006-01", month, KST)
	if err != nil {
		return time.Time{}, time.Time{}, errs.New(errs.Validation, "달은 YYYY-MM 이어야 합니다")
	}
	return from, from.AddDate(0, 1, 0), nil
}

// MonthOf 는 그 시각의 KST 달이다.
func MonthOf(t time.Time) string { return t.In(KST).Format("2006-01") }

// Confirmable — 끝난 달이고 다음 달 3일 0시(KST)가 지났다.
func Confirmable(month string, now time.Time) bool {
	_, to, err := MonthBounds(month)
	return err == nil && !now.Before(to.Add(confirmGrace))
}

// Eligible — 일반 계정 · 통계 제외 아님 · 메일 확인 · 만 14세 확인 · 그 달이 끝날 때 가입 7일.
func Eligible(u User, monthEnd time.Time) (bool, []string) {
	var why []string
	if u.Role != "user" {
		why = append(why, "role")
	}
	if u.StatsExcluded {
		why = append(why, "excluded")
	}
	if u.EmailVerifiedAt == nil {
		why = append(why, "email")
	}
	if u.AgeConfirmedAt == nil {
		why = append(why, "age")
	}
	if u.CreatedAt.After(monthEnd.Add(-newAccountDays * 24 * time.Hour)) {
		why = append(why, "new")
	}
	return len(why) == 0, why
}

// Draw 는 후보 중 sha256(씨앗:id) 가 작은 n명이다. 같은 씨앗·같은 후보면 같은 결과다.
func Draw(seed string, pool []string, exclude []string, n int) []string {
	type kv struct{ id, h string }
	var xs []kv
	for _, id := range pool {
		if id == "" || slices.Contains(exclude, id) {
			continue
		}
		xs = append(xs, kv{id, sha(seed + ":" + id)})
	}
	sort.Slice(xs, func(i, j int) bool {
		if xs[i].h != xs[j].h {
			return xs[i].h < xs[j].h
		}
		return xs[i].id < xs[j].id
	})
	out := []string{}
	for i := 0; i < len(xs) && i < n; i++ {
		out = append(out, xs[i].id)
	}
	return out
}

// CandidatesHash 는 꾸준 후보 집합의 지문이다(확정 때 감사용으로 남긴다).
func CandidatesHash(pool []string) string {
	ids := slices.Clone(pool)
	sort.Strings(ids)
	return sha(strings.Join(ids, ","))
}

// Public 은 남에게 보일 모양이다. 공개를 끈 수상자는 이름·id·숫자·이유를 비운다.
func Public(a Award) Award {
	out := a
	out.CouponCode, out.CouponItem, out.CouponExpires, out.ClaimedAt = "", "", "", nil
	if !a.Public {
		out.UserID, out.Name, out.Avatar, out.Days, out.Likes, out.Reason = "", "", "", 0, 0, ""
	}
	return out
}

// Last4 — 운영 웹은 쿠폰 번호 뒤 4자리만 본다.
func Last4(code string) string {
	r := []rune(code)
	if len(r) == 0 {
		return ""
	}
	// [원본] 4자 이하면 번호 전체를 돌려줬다 — 짧은 번호는 운영 화면에 다 보였다(REV-156 경계 1)
	// [개선] 8자 미만은 등록 여부만(가린 표시)
	if len(r) < 8 {
		return "…••••"
	}
	return "…" + string(r[len(r)-4:])
}

// ── 앱 ───────────────────────────────────────────────────────────────────

// MonthView 는 앱 화면 한 장의 값이다.
type MonthView struct {
	Month       Month
	MyDays      int
	MyLikes     int
	Eligible    bool
	Reasons     []string
	HasViewer   bool
	Winners     []Award
	SeedVisible bool
}

func (s *Service) resolveMonth(month string) (string, time.Time, time.Time, error) {
	if month == "" {
		month = MonthOf(s.now())
	}
	from, to, err := MonthBounds(month)
	if err != nil {
		return "", time.Time{}, time.Time{}, err
	}
	if from.After(s.now()) {
		return "", time.Time{}, time.Time{}, errs.New(errs.Validation, "아직 오지 않은 달입니다")
	}
	if month < FirstMonth {
		return "", time.Time{}, time.Time{}, errs.New(errs.Validation, "행사는 %s 부터예요", FirstMonth)
	}
	return month, from, to, nil
}

func (s *Service) ensure(ctx context.Context, month string) (Month, error) {
	if m, ok, err := s.repo.GetMonth(ctx, month); err != nil || ok {
		return m, err
	}
	seed := s.seed()
	return s.repo.EnsureMonth(ctx, month, seed, sha(seed))
}

func (s *Service) GetMonth(ctx context.Context, viewerID, month string) (MonthView, error) {
	month, from, to, err := s.resolveMonth(month)
	if err != nil {
		return MonthView{}, err
	}
	// 씨앗은 이번 달에만 만든다 — 지난 달은 읽기만(없으면 빈 달 · REV-154 M3).
	var m Month
	if month == MonthOf(s.now()) {
		if m, err = s.ensure(ctx, month); err != nil {
			return MonthView{}, err
		}
	} else {
		var ok bool
		if m, ok, err = s.repo.GetMonth(ctx, month); err != nil {
			return MonthView{}, err
		} else if !ok {
			m = Month{Month: month, Status: StatusOpen}
		}
	}
	v := MonthView{Month: m}
	if viewerID != "" {
		v.HasViewer = true
		days, err := s.repo.WorkoutDays(ctx, from, to, viewerID)
		if err != nil {
			return MonthView{}, err
		}
		for _, d := range days {
			if d.UserID == viewerID {
				v.MyDays = d.Days
			}
		}
		likes, err := s.repo.Likes(ctx, from, to, viewerID, 1)
		if err != nil {
			return MonthView{}, err
		}
		for _, l := range likes {
			if l.UserID == viewerID {
				v.MyLikes = l.Likes
			}
		}
		us, err := s.repo.Users(ctx, []string{viewerID})
		if err != nil {
			return MonthView{}, err
		}
		if len(us) == 1 {
			v.Eligible, v.Reasons = Eligible(us[0], to)
		}
	}
	if m.Status == StatusAnnounced {
		v.SeedVisible = true
		aw, err := s.repo.AwardsForMonths(ctx, []string{month})
		if err != nil {
			return MonthView{}, err
		}
		for _, a := range aw {
			v.Winners = append(v.Winners, Public(a))
		}
	}
	if !v.SeedVisible {
		v.Month.Seed = ""
	}
	return v, nil
}

// MonthAwards 는 발표된 달 하나와 수상자(공개 모양)다.
type MonthAwards struct {
	Month   Month
	Winners []Award
}

func (s *Service) ListMonths(ctx context.Context, limit int) ([]MonthAwards, error) {
	if limit <= 0 || limit > 24 {
		limit = 12
	}
	ms, err := s.repo.ListAnnounced(ctx, limit)
	if err != nil {
		return nil, err
	}
	if len(ms) == 0 {
		return []MonthAwards{}, nil
	}
	names := make([]string, 0, len(ms))
	for _, m := range ms {
		names = append(names, m.Month)
	}
	aw, err := s.repo.AwardsForMonths(ctx, names)
	if err != nil {
		return nil, err
	}
	by := map[string][]Award{}
	for _, a := range aw {
		by[a.Month] = append(by[a.Month], Public(a))
	}
	out := make([]MonthAwards, 0, len(ms))
	for _, m := range ms {
		out = append(out, MonthAwards{Month: m, Winners: by[m.Month]})
	}
	return out, nil
}

func needViewer(viewerID string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return nil
}

// ListMyAwards — 번호는 비우고 있음만 알린다(번호는 GetMyAward 에서만).
func (s *Service) ListMyAwards(ctx context.Context, viewerID string) ([]Award, error) {
	if err := needViewer(viewerID); err != nil {
		return nil, err
	}
	aw, err := s.repo.AwardsByUser(ctx, viewerID)
	if err != nil {
		return nil, err
	}
	for i := range aw {
		aw[i].HasCoupon = aw[i].CouponCode != ""
		aw[i].CouponCode = ""
	}
	return aw, nil
}

func (s *Service) mine(ctx context.Context, viewerID, id string) (Award, error) {
	if err := needViewer(viewerID); err != nil {
		return Award{}, err
	}
	a, ok, err := s.repo.GetAward(ctx, id)
	if err != nil {
		return Award{}, err
	}
	if !ok || a.UserID != viewerID {
		return Award{}, errs.New(errs.NotFound, "수상 기록을 찾을 수 없어요")
	}
	return a, nil
}

func (s *Service) GetMyAward(ctx context.Context, viewerID, id string) (Award, error) {
	a, err := s.mine(ctx, viewerID, id)
	a.HasCoupon = a.CouponCode != ""
	return a, err
}

func (s *Service) MarkClaimed(ctx context.Context, viewerID, id string, claimed bool) error {
	a, err := s.mine(ctx, viewerID, id)
	if err != nil {
		return err
	}
	if a.CouponCode == "" {
		return errs.New(errs.Validation, "아직 쿠폰 번호가 없어요")
	}
	_, err = s.repo.MarkClaimed(ctx, id, viewerID, claimed)
	return err
}

func (s *Service) SetPublic(ctx context.Context, viewerID, id string, public bool) error {
	if _, err := s.mine(ctx, viewerID, id); err != nil {
		return err
	}
	_, err := s.repo.SetPublic(ctx, id, viewerID, public)
	return err
}

// GetUserBadges — 공개 수상만. 서로 차단한 사이면 빈 목록이다.
func (s *Service) GetUserBadges(ctx context.Context, viewerID, userID string) ([]Award, error) {
	if userID == "" {
		return []Award{}, nil
	}
	if viewerID != "" && viewerID != userID {
		blocked, err := s.repo.BlockedEither(ctx, viewerID, userID)
		if err != nil {
			return nil, err
		}
		if blocked {
			return []Award{}, nil
		}
	}
	aw, err := s.repo.AwardsByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := []Award{}
	for _, a := range aw {
		if a.Public {
			out = append(out, Public(a))
		}
	}
	return out, nil
}

// ── 운영 ─────────────────────────────────────────────────────────────────

func (s *Service) requireAdmin(ctx context.Context, viewerID, claim string) error {
	return access.Require(ctx, s.repo, viewerID, claim, adminRoles...)
}

// Candidate 는 운영 웹 후보 한 줄이다.
type Candidate struct {
	User     User
	Days     int
	Late     int
	Likes    int
	Likers   int
	Eligible bool
	Reasons  []string
}

type Board struct {
	Month       Month
	Confirmable bool
	Steady      []Candidate
	Popular     []Candidate
}

// board 는 그 달 집계 전부다. steadyPool = 자격 있고 12일 이상(추첨 대상 · 제외 전).
func (s *Service) board(ctx context.Context, month string) (Board, []string, map[string]Candidate, error) {
	month, from, to, err := s.resolveMonth(month)
	if err != nil {
		return Board{}, nil, nil, err
	}
	m, err := s.ensure(ctx, month)
	if err != nil {
		return Board{}, nil, nil, err
	}
	days, err := s.repo.WorkoutDays(ctx, from, to, "")
	if err != nil {
		return Board{}, nil, nil, err
	}
	likes, err := s.repo.Likes(ctx, from, to, "", popularScan)
	if err != nil {
		return Board{}, nil, nil, err
	}
	all := map[string]*Candidate{}
	get := func(id string) *Candidate {
		if c, ok := all[id]; ok {
			return c
		}
		c := &Candidate{User: User{ID: id}}
		all[id] = c
		return c
	}
	var steadyIDs []string
	for _, d := range days {
		if d.Days >= SteadyThreshold {
			c := get(d.UserID)
			c.Days, c.Late = d.Days, d.Late
			steadyIDs = append(steadyIDs, d.UserID)
		} else if c, ok := all[d.UserID]; ok {
			c.Days, c.Late = d.Days, d.Late
		}
	}
	dayOf := map[string]DayCount{}
	for _, d := range days {
		dayOf[d.UserID] = d
	}
	var popIDs []string
	for _, l := range likes {
		c := get(l.UserID)
		c.Likes, c.Likers = l.Likes, l.Likers
		if d, ok := dayOf[l.UserID]; ok {
			c.Days, c.Late = d.Days, d.Late
		}
		popIDs = append(popIDs, l.UserID)
	}
	ids := make([]string, 0, len(all))
	for id := range all {
		ids = append(ids, id)
	}
	us, err := s.repo.Users(ctx, ids)
	if err != nil {
		return Board{}, nil, nil, err
	}
	for _, u := range us {
		c := all[u.ID]
		c.User = u
		c.Eligible, c.Reasons = Eligible(u, to)
	}
	// 사용자 행이 없는 id(그새 탈퇴)는 자격 없음
	for _, c := range all {
		if c.User.CreatedAt.IsZero() && c.Reasons == nil {
			c.Reasons = []string{"withdrawn"}
		}
	}
	out := Board{Month: m, Confirmable: Confirmable(month, s.now()) && m.Status == StatusOpen}
	var pool []string
	for _, id := range steadyIDs {
		c := *all[id]
		out.Steady = append(out.Steady, c)
		if c.Eligible {
			pool = append(pool, id)
		}
	}
	sort.SliceStable(out.Steady, func(i, j int) bool { return out.Steady[i].Days > out.Steady[j].Days })
	// 자격 있는 사람으로 상위 popularTop 을 채운다 — 자격 없는 계정이 칸을 차지하지 않게(REV-154 M2)
	for _, id := range popIDs {
		if c := all[id]; c.Eligible && len(out.Popular) < popularTop {
			out.Popular = append(out.Popular, *c)
		}
	}
	if out.Month.Status != StatusAnnounced {
		out.Month.Seed = ""
	}
	flat := map[string]Candidate{}
	for id, c := range all {
		flat[id] = *c
	}
	return out, pool, flat, nil
}

func (s *Service) Candidates(ctx context.Context, viewerID, claim, month string) (Board, error) {
	if err := s.requireAdmin(ctx, viewerID, claim); err != nil {
		return Board{}, err
	}
	b, _, _, err := s.board(ctx, month)
	return b, err
}

func (s *Service) DrawPreview(ctx context.Context, viewerID, claim, month string, exclude []string) ([]Candidate, int, error) {
	if err := s.requireAdmin(ctx, viewerID, claim); err != nil {
		return nil, 0, err
	}
	b, pool, all, err := s.board(ctx, month)
	if err != nil {
		return nil, 0, err
	}
	seed, err := s.seedOf(ctx, b.Month.Month)
	if err != nil {
		return nil, 0, err
	}
	picked := Draw(seed, pool, exclude, SteadyWinners)
	out := make([]Candidate, 0, len(picked))
	for _, id := range picked {
		out = append(out, all[id])
	}
	n := 0
	for _, id := range pool {
		if !slices.Contains(exclude, id) {
			n++
		}
	}
	return out, n, nil
}

// seedOf 는 저장된 씨앗 원문이다(미리보기·확정만 쓴다 — 밖으로 내보내지 않는다).
func (s *Service) seedOf(ctx context.Context, month string) (string, error) {
	m, ok, err := s.repo.GetMonth(ctx, month)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", errs.New(errs.NotFound, "그 달 기록이 없습니다")
	}
	return m.Seed, nil
}

type ConfirmInput struct {
	Month      string
	PopularID  string
	PickID     string
	PickReason string
}

// Confirm 은 그 달의 상을 확정한다. 이미 확정이면 기존 결과와 already=true(쓰기·알림 없음).
func (s *Service) Confirm(ctx context.Context, viewerID, claim string, in ConfirmInput) ([]Award, bool, error) {
	if err := s.requireAdmin(ctx, viewerID, claim); err != nil {
		return nil, false, err
	}
	if _, _, err := MonthBounds(in.Month); err != nil {
		return nil, false, err
	}
	if m, ok, err := s.repo.GetMonth(ctx, in.Month); err != nil {
		return nil, false, err
	} else if ok && m.Status == StatusAnnounced {
		aw, err := s.repo.AwardsForMonths(ctx, []string{in.Month})
		return aw, true, err
	}
	if !Confirmable(in.Month, s.now()) {
		return nil, false, errs.New(errs.Validation, "끝난 달만, 다음 달 3일 0시(한국 시간)부터 확정할 수 있어요")
	}
	in.PickReason = strings.TrimSpace(in.PickReason)
	if in.PopularID != "" && in.PopularID == in.PickID {
		return nil, false, errs.New(errs.Validation, "인기상과 운영진 픽은 다른 사람이어야 해요")
	}
	// [원본] in.PickReason == "" — 화면(2자 이상)과 규칙이 달랐다 → [개선] 2자 이상(REV-156 화면 4)
	if in.PickID != "" && len([]rune(in.PickReason)) < 2 {
		return nil, false, errs.New(errs.Validation, "운영진 픽은 이유를 두 글자 이상 적어야 해요")
	}
	if len([]rune(in.PickReason)) > maxReason {
		return nil, false, errs.New(errs.Validation, "이유가 너무 길어요")
	}
	b, pool, all, err := s.board(ctx, in.Month)
	if err != nil {
		return nil, false, err
	}
	_, to, _ := MonthBounds(in.Month)
	chosen := func(id string) (Candidate, error) {
		c, ok := all[id]
		if !ok {
			us, err := s.repo.Users(ctx, []string{id})
			if err != nil {
				return Candidate{}, err
			}
			if len(us) != 1 {
				return Candidate{}, errs.New(errs.Validation, "그 사용자를 찾을 수 없어요")
			}
			c = Candidate{User: us[0]}
			c.Eligible, c.Reasons = Eligible(us[0], to)
		}
		if !c.Eligible {
			return Candidate{}, errs.New(errs.Validation, "자격이 없는 사용자예요: %s", strings.Join(c.Reasons, ","))
		}
		return c, nil
	}
	var news []NewAward
	var exclude []string
	if in.PopularID != "" {
		c, err := chosen(in.PopularID)
		if err != nil {
			return nil, false, err
		}
		// 순위 표 밖의 사람이어도 그 사람 몫을 다시 센다(REV-154 M2)
		from, _, _ := MonthBounds(in.Month)
		if ls, err := s.repo.Likes(ctx, from, to, c.User.ID, 1); err != nil {
			return nil, false, err
		} else if len(ls) == 1 {
			c.Likes, c.Likers = ls[0].Likes, ls[0].Likers
		}
		if c.Likes <= 0 {
			return nil, false, errs.New(errs.Validation, "인정 좋아요가 없는 사람은 인기상을 받을 수 없어요")
		}
		news = append(news, NewAward{ID: s.newID(), Month: in.Month, Category: CategoryPopular, UserID: c.User.ID, Rank: 1, Days: c.Days, Likes: c.Likes})
		exclude = append(exclude, c.User.ID)
	}
	if in.PickID != "" {
		c, err := chosen(in.PickID)
		if err != nil {
			return nil, false, err
		}
		news = append(news, NewAward{ID: s.newID(), Month: in.Month, Category: CategoryPick, UserID: c.User.ID, Rank: 1, Reason: in.PickReason, Days: c.Days, Likes: c.Likes})
		exclude = append(exclude, c.User.ID)
	}
	seed, err := s.seedOf(ctx, b.Month.Month)
	if err != nil {
		return nil, false, err
	}
	for i, id := range Draw(seed, pool, exclude, SteadyWinners) {
		c := all[id]
		news = append(news, NewAward{ID: s.newID(), Month: in.Month, Category: CategorySteady, UserID: id, Rank: i + 1, Days: c.Days, Likes: c.Likes})
	}
	if len(news) == 0 {
		return nil, false, errs.New(errs.Validation, "줄 상이 없어요 — 후보가 없으면 확정하지 않아요")
	}
	first, err := s.repo.Announce(ctx, in.Month, viewerID, CandidatesHash(pool), news)
	if err != nil {
		return nil, false, err
	}
	aw, err := s.repo.AwardsForMonths(ctx, []string{in.Month})
	if err != nil {
		return nil, false, err
	}
	if !first {
		return aw, true, nil
	}
	// 요청이 끊겨도(창 닫기) 알림은 남긴다 — 다시 확정하면 already 라 보낼 길이 없다(REV-154 M1)
	nctx := context.WithoutCancel(ctx)
	for _, a := range news {
		s.notify.NotifySelf(nctx, a.UserID, "award", a.ID)
	}
	slog.Info("이달의 리프터 확정", "month", in.Month, "awards", len(news))
	return aw, false, nil
}

func (s *Service) ListAwards(ctx context.Context, viewerID, claim, month string) (Month, []Award, error) {
	if err := s.requireAdmin(ctx, viewerID, claim); err != nil {
		return Month{}, nil, err
	}
	if _, _, err := MonthBounds(month); err != nil {
		return Month{}, nil, err
	}
	m, ok, err := s.repo.GetMonth(ctx, month)
	if err != nil {
		return Month{}, nil, err
	}
	if !ok {
		return Month{Month: month, Status: StatusOpen}, []Award{}, nil
	}
	if m.Status != StatusAnnounced {
		m.Seed = ""
	}
	aw, err := s.repo.AwardsForMonths(ctx, []string{month})
	return m, aw, err
}

func (s *Service) SetCoupon(ctx context.Context, viewerID, claim, awardID, code, item, expires string) error {
	if err := s.requireAdmin(ctx, viewerID, claim); err != nil {
		return err
	}
	code, item = strings.TrimSpace(code), strings.TrimSpace(item)
	if code == "" || len([]rune(code)) > maxCouponCode {
		return errs.New(errs.Validation, "쿠폰 번호를 확인해 주세요")
	}
	if item == "" || len([]rune(item)) > maxCouponItem {
		return errs.New(errs.Validation, "상품 이름을 확인해 주세요")
	}
	var exp *time.Time
	if expires != "" {
		t, err := time.ParseInLocation("2006-01-02", expires, KST)
		if err != nil {
			return errs.New(errs.Validation, "유효 기한은 YYYY-MM-DD 예요")
		}
		// 지난 날짜는 받지 않는다(REV-156 화면 7)
		if t.Before(time.Date(s.now().In(KST).Year(), s.now().In(KST).Month(), s.now().In(KST).Day(), 0, 0, 0, 0, KST)) {
			return errs.New(errs.Validation, "유효 기한이 이미 지났어요")
		}
		exp = &t
	}
	ok, err := s.repo.SetCoupon(ctx, awardID, code, item, exp, viewerID)
	if err != nil {
		return err
	}
	if !ok {
		return errs.New(errs.NotFound, "수상 기록을 찾을 수 없어요")
	}
	slog.Info("쿠폰 등록", "award", awardID) // 번호는 남기지 않는다
	return nil
}

func (s *Service) SearchUsers(ctx context.Context, viewerID, claim, q, month string) ([]Candidate, error) {
	if err := s.requireAdmin(ctx, viewerID, claim); err != nil {
		return nil, err
	}
	q = strings.TrimSpace(q)
	if len([]rune(q)) < 2 {
		return []Candidate{}, nil
	}
	us, err := s.repo.SearchUsers(ctx, q)
	if err != nil {
		return nil, err
	}
	// [원본] 늘 지난 달 말 기준 — 운영자가 고른 달과 판정 달이 달랐다
	// _, to, _ := MonthBounds(MonthOf(s.now().AddDate(0, -1, 0)))
	// [개선] 고른 달 끝 기준(비우면 지난 달 · REV-156 화면 3)
	if month == "" {
		month = MonthOf(s.now().AddDate(0, -1, 0))
	}
	_, to, err := MonthBounds(month)
	if err != nil {
		return nil, errs.New(errs.Validation, "달 형식은 YYYY-MM 이에요")
	}
	out := make([]Candidate, 0, len(us))
	for _, u := range us {
		c := Candidate{User: u}
		c.Eligible, c.Reasons = Eligible(u, to)
		out = append(out, c)
	}
	return out, nil
}
