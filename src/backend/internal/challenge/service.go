// 그룹 챌린지 서비스(SPEC-064 · SRS-118~121) — 규칙(rules.go)과 저장소(Repo) 사이의 흐름.
// connect·proto·pgx 를 모른다(src/CLAUDE.md 4절) — 저장소는 Repo/Tx 포트, 사진은 PhotoStore 포트.
package challenge

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"io"
	"log/slog"
	"sort"
	"sync"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type Ctx = context.Context

var ErrNotFound = errors.New("challenge: not found")

// ── 도메인 값 ─────────────────────────────────────────────────────────────

type Challenge struct {
	ID             string
	OwnerID        string
	Title          string
	Penalty        string
	Rule           Rule
	Token          string
	Status         string
	CreatedAt      time.Time
	EndedAt        *time.Time
	PhotosPurgedAt *time.Time
}

type Member struct {
	UserID   string
	Name     string
	Avatar   string
	JoinedAt time.Time
	LeftAt   *time.Time
}

func (m Member) Active() bool { return m.LeftAt == nil }

type Prompt struct {
	ID          string
	ChallengeID string
	UserID      string
	WorkoutID   string
	Code        string
	IssuedAt    time.Time
	UsedAt      *time.Time
}

type ProofRow struct {
	Proof
	ChallengeID string
	UserID      string
	PromptID    string
	PromptCode  string
	StorageKey  string
	Hash        uint64
	Source      string
	DupOf       string
	Flags       int
	FlaggedByMe bool
}

type UserDay struct {
	UserID string
	DayRow
}

type UserWorkout struct {
	UserID string
	Workout
}

type DebtRow struct {
	UserID string
	Day    Day
	PaidAt *time.Time
}

type KeyRow struct{ ID, Key string }

// Tx 는 한 트랜잭션 안의 저장소다. 없는 행은 ErrNotFound.
type Tx interface {
	GetChallenge(ctx Ctx, id string, forUpdate bool) (Challenge, error)
	ChallengeByToken(ctx Ctx, token string) (Challenge, error)
	InsertChallenge(ctx Ctx, c Challenge) error
	UpdateRule(ctx Ctx, c Challenge) (bool, error)
	SetToken(ctx Ctx, id, token string) error
	SetOwner(ctx Ctx, id, owner string) error
	SetStatus(ctx Ctx, id, from, to string, at time.Time) (bool, error)
	ListByStatus(ctx Ctx, status string) ([]Challenge, error)
	ListMine(ctx Ctx, user string) ([]Challenge, error)
	CountOpen(ctx Ctx, user string) (int, error)
	LockUser(ctx Ctx, user string) error
	TryLoopLock(ctx Ctx) (bool, error)
	TryChallengeLock(ctx Ctx, id string) (bool, error)
	TryPurgeLock(ctx Ctx) (bool, error)

	Members(ctx Ctx, id string) ([]Member, error)
	UpsertMember(ctx Ctx, id, user string, at time.Time) error
	MarkLeft(ctx Ctx, id, user string, at time.Time) (bool, error)
	DeleteMember(ctx Ctx, id, user string) error
	Blocked(ctx Ctx, id, user string) (bool, error)

	InsertPrompt(ctx Ctx, p Prompt) error
	PromptForUpdate(ctx Ctx, id string) (Prompt, error)
	UsePrompt(ctx Ctx, id string, at time.Time) error
	RecentPrompts(ctx Ctx, user string, since time.Time) (int, error)

	InsertProof(ctx Ctx, p ProofRow) error
	GetProof(ctx Ctx, id string, forUpdate bool) (ProofRow, error)
	Proofs(ctx Ctx, id, viewer string) ([]ProofRow, error)
	NearestOwn(ctx Ctx, user string, hash uint64) (string, int, bool, error)
	NearestGroup(ctx Ctx, id, user string, hash uint64) (string, int, bool, error)
	SetProofInvalid(ctx Ctx, id string, at time.Time) (bool, error)
	InsertFlag(ctx Ctx, proof, voter string, at time.Time) error
	DeleteFlag(ctx Ctx, proof, voter string) error
	CountFlags(ctx Ctx, id, proof string) (int, error)

	Days(ctx Ctx, id string) ([]UserDay, error)
	UpsertDay(ctx Ctx, id, user string, row DayRow, at time.Time) error
	DeleteDay(ctx Ctx, id, user string, day Day) error
	JudgeWorkouts(ctx Ctx, users []string, from, to time.Time) ([]UserWorkout, error)

	InsertDebt(ctx Ctx, id, user string, day Day) error
	DeleteDebt(ctx Ctx, id, user string, day Day) error
	Debts(ctx Ctx, id string) ([]DebtRow, error)
	SetDebtPaid(ctx Ctx, id, user string, day Day, paidAt *time.Time, by string) (bool, error)

	InsertNotice(ctx Ctx, id, user, kind, ref string) (bool, error)

	PurgeDue(ctx Ctx, before time.Time) ([]string, error)
	PurgeKeys(ctx Ctx, id string) ([]KeyRow, error)
	ClearKey(ctx Ctx, proof string) error
	CountKeys(ctx Ctx, id string) (int, error)
	MarkPurged(ctx Ctx, id string, at time.Time) error
	DeletePrompts(ctx Ctx, id string) error
	OrphanProofs(ctx Ctx) ([]KeyRow, error)
	DeleteProof(ctx Ctx, id string) error
}

// Repo 는 트랜잭션을 연다. fn 이 오류를 돌려주면 되돌린다.
type Repo interface {
	InTx(ctx Ctx, fn func(tx Tx) error) error
}

// Notifier — 시스템 알림(actor = 받는 사람 자신 · 이의한 사람을 드러내지 않는다).
type Notifier interface {
	NotifySelf(ctx Ctx, userID, kind, refID string)
}

// 알림 종류(notification.Kind 와 같은 글자).
const (
	NoticeRemind       = "challenge_remind"
	NoticeMissed       = "challenge_missed"
	NoticeProofInvalid = "challenge_proof_invalid"
	NoticeEnded        = "challenge_ended"
	NoticeCancelled    = "challenge_cancelled"
)

type Service struct {
	repo   Repo
	photos PhotoStore
	notify Notifier
	newID  func() string
	now    func() time.Time
	rnd    func() uint32
	// 사진 디코드 동시 실행 수(REV-160 1) — 16MP 디코드는 수십 MB 라 몇 개만 겹쳐도 메모리가 튄다
	decode chan struct{}
	upMu   sync.Mutex
	upHits map[string][]time.Time
}

func NewService(repo Repo, photos PhotoStore, notify Notifier, newID func() string) *Service {
	return &Service{repo: repo, photos: photos, notify: notify, newID: newID, now: time.Now, rnd: randU32,
		decode: make(chan struct{}, 3), upHits: map[string][]time.Time{}}
}

// uploadsPerMinute — 사용자별 업로드 시도 상한(지시 발급 상한과 같다).
const uploadsPerMinute = 10

// allowUpload — 사용자별 1분 창(이 서버 메모리 · 재시작하면 비워진다). 넘으면 false.
func (s *Service) allowUpload(uid string, now time.Time) bool {
	s.upMu.Lock()
	defer s.upMu.Unlock()
	keep := s.upHits[uid][:0]
	for _, t := range s.upHits[uid] {
		if now.Sub(t) < time.Minute {
			keep = append(keep, t)
		}
	}
	if len(keep) >= uploadsPerMinute {
		s.upHits[uid] = keep
		return false
	}
	s.upHits[uid] = append(keep, now)
	if len(s.upHits) > 10000 { // 오래 안 쓴 사람을 비운다(메모리 상한)
		for k, v := range s.upHits {
			if len(v) == 0 || now.Sub(v[len(v)-1]) >= time.Minute {
				delete(s.upHits, k)
			}
		}
	}
	return true
}

// checkPrompt — 업로드 가능한 지시인가(본인 · 미사용 · 3분 안 · 진행 중 멤버). 사진을 열기 전과 쓰기 직전에 두 번 본다.
func checkPrompt(ctx Ctx, tx Tx, uid string, p Prompt, now time.Time) (Challenge, error) {
	if p.UserID != uid {
		return Challenge{}, errs.New(errs.NotFound, "지시를 찾을 수 없어요 — 새 지시로 다시 찍어 주세요")
	}
	if p.UsedAt != nil {
		return Challenge{}, errs.New(errs.Conflict, "이미 쓴 지시예요 — 새 지시로 다시 찍어 주세요")
	}
	if now.Sub(p.IssuedAt) > PromptTTL {
		return Challenge{}, errs.New(errs.Conflict, "지시 시간이 지났어요 — 새 지시로 다시 찍어 주세요")
	}
	c, err := tx.GetChallenge(ctx, p.ChallengeID, false)
	if err != nil {
		return Challenge{}, mapNF(err)
	}
	ms, err := tx.Members(ctx, c.ID)
	if err != nil {
		return Challenge{}, err
	}
	if c.Status != StatusActive || !activeMember(ms, uid) {
		return Challenge{}, errs.New(errs.Conflict, "지금은 인증 사진을 올릴 수 없어요")
	}
	return c, nil
}

// flagDeadline — 이의 마감 = 그날 확정 시각. 단 챌린지 끝(마지막 날 확정 시각)을 넘지 않는다(REV-160 5 —
// 마지막 날을 만회한 인증의 날은 LastDay+1 이라 끝난 뒤에도 이의가 받아졌다).
func flagDeadline(c Challenge, d Day) time.Time {
	dl := d.Finalize()
	if last := c.Rule.LastDay().Finalize(); last.Before(dl) {
		dl = last
	}
	return dl
}

// SetNow 는 시험용 시각 주입이다.
func (s *Service) SetNow(f func() time.Time) { s.now = f }

func randU32() uint32 {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return binary.LittleEndian.Uint32(b[:])
}

// NewToken 은 128비트 초대 토큰이다(crypto/rand · URL 안전).
func NewToken() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

func notFound() error { return errs.New(errs.NotFound, "챌린지를 찾을 수 없어요") }

func needUser(uid string) error {
	if uid == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return nil
}

func mapNF(err error) error {
	if errors.Is(err, ErrNotFound) {
		return notFound()
	}
	return err
}

func activeMember(ms []Member, uid string) bool {
	for _, m := range ms {
		if m.UserID == uid && m.Active() {
			return true
		}
	}
	return false
}

func activeIDs(ms []Member) []string {
	var out []string
	for _, m := range ms {
		if m.Active() {
			out = append(out, m.UserID)
		}
	}
	return out
}

// ── 만들기·고치기·초대 ──────────────────────────────────────────────────────

func (s *Service) Create(ctx Ctx, uid string, d Draft) (Detail, error) {
	if err := needUser(uid); err != nil {
		return Detail{}, err
	}
	now := s.now()
	v, err := d.Validate(DayOf(now))
	if err != nil {
		return Detail{}, errs.New(errs.Validation, "챌린지 규칙을 확인해 주세요")
	}
	id := s.newID()
	err = s.repo.InTx(ctx, func(tx Tx) error {
		if err := tx.LockUser(ctx, uid); err != nil {
			return err
		}
		n, err := tx.CountOpen(ctx, uid)
		if err != nil {
			return err
		}
		if n >= MaxActive {
			return errs.New(errs.Conflict, "동시에 할 수 있는 챌린지는 %d개까지예요", MaxActive)
		}
		c := draftChallenge(v)
		c.ID, c.OwnerID, c.Token, c.Status, c.CreatedAt = id, uid, NewToken(), StatusRecruiting, now
		if err := tx.InsertChallenge(ctx, c); err != nil {
			return err
		}
		return tx.UpsertMember(ctx, id, uid, now)
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Get(ctx, uid, id, nil)
}

func draftChallenge(v Draft) Challenge {
	return Challenge{Title: v.Title, Penalty: v.Penalty, Rule: Rule{
		StartsOn: v.StartsOn, Weeks: v.Weeks, RuleKind: v.RuleKind, Weekdays: v.Weekdays,
		MinSets: v.MinSets, ProofMode: v.ProofMode, PassPerWeek: v.PassPerWeek,
	}}
}

func (s *Service) Update(ctx Ctx, uid, id string, d Draft) (Detail, error) {
	if err := needUser(uid); err != nil {
		return Detail{}, err
	}
	v, err := d.Validate(DayOf(s.now()))
	if err != nil {
		return Detail{}, errs.New(errs.Validation, "챌린지 규칙을 확인해 주세요")
	}
	err = s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, true)
		if err != nil {
			return mapNF(err)
		}
		if c.OwnerID != uid {
			return s.ownerOnly(ctx, tx, c, uid)
		}
		if c.Status != StatusRecruiting {
			return errs.New(errs.Conflict, "시작한 뒤에는 규칙을 바꿀 수 없어요")
		}
		n := draftChallenge(v)
		n.ID = id
		_, err = tx.UpdateRule(ctx, n)
		return err
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Get(ctx, uid, id, nil)
}

// ownerOnly — 멤버면 Forbidden, 아니면 NotFound(존재를 드러내지 않는다).
func (s *Service) ownerOnly(ctx Ctx, tx Tx, c Challenge, uid string) error {
	ms, err := tx.Members(ctx, c.ID)
	if err != nil {
		return err
	}
	if activeMember(ms, uid) {
		return errs.New(errs.Forbidden, "방장만 할 수 있어요")
	}
	return notFound()
}

func (s *Service) RotateInvite(ctx Ctx, uid, id string) (string, error) {
	if err := needUser(uid); err != nil {
		return "", err
	}
	tok := NewToken()
	err := s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, true)
		if err != nil {
			return mapNF(err)
		}
		if c.OwnerID != uid {
			return s.ownerOnly(ctx, tx, c, uid)
		}
		return tx.SetToken(ctx, id, tok)
	})
	return tok, err
}

type InviteView struct {
	ID            string
	Title         string
	Penalty       string
	Rule          Rule
	Status        string
	MemberCount   int
	AlreadyMember bool
}

// GetInvite — 비로그인도 본다. 멤버 이름은 싣지 않는다(인원 수만 · REV-159).
func (s *Service) GetInvite(ctx Ctx, uid, token string) (InviteView, error) {
	var v InviteView
	if token == "" {
		return v, notFound()
	}
	err := s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.ChallengeByToken(ctx, token)
		if err != nil {
			return mapNF(err)
		}
		ms, err := tx.Members(ctx, c.ID)
		if err != nil {
			return err
		}
		v = InviteView{ID: c.ID, Title: c.Title, Penalty: c.Penalty, Rule: c.Rule, Status: c.Status,
			MemberCount: len(activeIDs(ms)), AlreadyMember: uid != "" && activeMember(ms, uid)}
		return nil
	})
	return v, err
}

func (s *Service) Join(ctx Ctx, uid, token string) (string, error) {
	if err := needUser(uid); err != nil {
		return "", err
	}
	var id string
	now := s.now()
	err := s.repo.InTx(ctx, func(tx Tx) error {
		if err := tx.LockUser(ctx, uid); err != nil {
			return err
		}
		c0, err := tx.ChallengeByToken(ctx, token)
		if err != nil {
			return mapNF(err)
		}
		c, err := tx.GetChallenge(ctx, c0.ID, true) // 정원은 행 잠금 안에서 센다(REV-159)
		if err != nil {
			return mapNF(err)
		}
		id = c.ID
		ms, err := tx.Members(ctx, c.ID)
		if err != nil {
			return err
		}
		if activeMember(ms, uid) {
			return nil
		}
		if c.Status != StatusRecruiting || !now.Before(c.Rule.StartsOn.Start()) {
			return errs.New(errs.Conflict, "이미 시작한 챌린지예요")
		}
		if len(activeIDs(ms)) >= MaxMembers {
			return errs.New(errs.Conflict, "정원(%d명)이 찼어요", MaxMembers)
		}
		if b, err := tx.Blocked(ctx, c.ID, uid); err != nil {
			return err
		} else if b {
			return errs.New(errs.Forbidden, "참가할 수 없는 챌린지예요")
		}
		n, err := tx.CountOpen(ctx, uid)
		if err != nil {
			return err
		}
		if n >= MaxActive {
			return errs.New(errs.Conflict, "동시에 할 수 있는 챌린지는 %d개까지예요", MaxActive)
		}
		return tx.UpsertMember(ctx, c.ID, uid, now)
	})
	return id, err
}

// Leave — 모집 중 방장이면 해산, 진행 중 방장이면 먼저 넘겨야 한다(REV-159). 진행 중이면 다음 날부터 판정하지 않는다.
func (s *Service) Leave(ctx Ctx, uid, id string) error {
	if err := needUser(uid); err != nil {
		return err
	}
	now := s.now()
	var notifyTo []string
	err := s.repo.InTx(ctx, func(tx Tx) error {
		notifyTo = nil
		c, err := tx.GetChallenge(ctx, id, true)
		if err != nil {
			return mapNF(err)
		}
		ms, err := tx.Members(ctx, id)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) {
			return notFound()
		}
		if c.OwnerID == uid {
			switch {
			case c.Status == StatusRecruiting:
				ok, err := tx.SetStatus(ctx, id, StatusRecruiting, StatusCancelled, now)
				if err != nil {
					return err
				}
				// 방장이 나가 해산 — 남은 멤버에게 취소 알림(REV-160 7)
				if ok {
					for _, u := range activeIDs(ms) {
						if u == uid {
							continue
						}
						first, err := tx.InsertNotice(ctx, id, u, NoticeCancelled, c.Rule.StartsOn.String())
						if err != nil {
							return err
						}
						if first {
							notifyTo = append(notifyTo, u)
						}
					}
				}
				_, err = tx.MarkLeft(ctx, id, uid, now)
				return err
			case c.Status == StatusActive && len(activeIDs(ms)) > 1:
				return errs.New(errs.Conflict, "방장을 다른 멤버에게 넘긴 뒤 나갈 수 있어요")
			}
		}
		if c.Status == StatusRecruiting {
			return tx.DeleteMember(ctx, id, uid)
		}
		_, err = tx.MarkLeft(ctx, id, uid, now)
		return err
	})
	if err != nil {
		return err
	}
	for _, u := range notifyTo {
		s.notify.NotifySelf(ctx, u, NoticeCancelled, id)
	}
	return nil
}

func (s *Service) TransferOwner(ctx Ctx, uid, id, to string) error {
	if err := needUser(uid); err != nil {
		return err
	}
	return s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, true)
		if err != nil {
			return mapNF(err)
		}
		if c.OwnerID != uid {
			return s.ownerOnly(ctx, tx, c, uid)
		}
		ms, err := tx.Members(ctx, id)
		if err != nil {
			return err
		}
		if to == uid || !activeMember(ms, to) {
			return errs.New(errs.Validation, "넘길 멤버를 골라 주세요")
		}
		return tx.SetOwner(ctx, id, to)
	})
}

// Kick — 시작 전에만(진행 중 내보내기는 벌칙 회피·괴롭힘 수단이 된다 · SRS-118).
func (s *Service) Kick(ctx Ctx, uid, id, target string) error {
	if err := needUser(uid); err != nil {
		return err
	}
	return s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, true)
		if err != nil {
			return mapNF(err)
		}
		if c.OwnerID != uid {
			return s.ownerOnly(ctx, tx, c, uid)
		}
		if c.Status != StatusRecruiting {
			return errs.New(errs.Conflict, "시작한 뒤에는 내보낼 수 없어요")
		}
		if target == uid {
			return errs.New(errs.Validation, "자기 자신은 내보낼 수 없어요")
		}
		return tx.DeleteMember(ctx, id, target)
	})
}

// ── 읽기 ──────────────────────────────────────────────────────────────────

type Summary struct {
	Challenge
	MemberCount int
	IsOwner     bool
	MyToday     string
}

type Cell struct {
	UserID  string
	Day     Day
	Result  string
	Final   bool
	ProofID string
	Web     bool
	Suspect bool
}

type Tally struct {
	UserID                                  string
	Done, MadeUp, Pass, Missed, Debts, Paid int
}

type Detail struct {
	Summary
	Members      []Member
	Cells        []Cell
	Week         int
	WeekCount    int
	Today        Day
	Tallies      []Tally
	Debts        []DebtRow
	MyPassesLeft int
	InviteToken  string
	PurgeOn      *Day
}

func (s *Service) ListMine(ctx Ctx, uid string) ([]Summary, error) {
	if err := needUser(uid); err != nil {
		return nil, err
	}
	var out []Summary
	err := s.repo.InTx(ctx, func(tx Tx) error {
		cs, err := tx.ListMine(ctx, uid)
		if err != nil {
			return err
		}
		for _, c := range cs {
			ms, err := tx.Members(ctx, c.ID)
			if err != nil {
				return err
			}
			sm := Summary{Challenge: c, MemberCount: len(activeIDs(ms)), IsOwner: c.OwnerID == uid}
			if c.Status == StatusActive {
				st, err := s.todayFor(ctx, tx, c, uid)
				if err != nil {
					return err
				}
				sm.MyToday = st
			}
			out = append(out, sm)
		}
		return nil
	})
	return out, err
}

// todayFor — 오늘 내 칸(인정되면 done · 쉬는 날 rest · 아니면 today).
func (s *Service) todayFor(ctx Ctx, tx Tx, c Challenge, uid string) (string, error) {
	today := DayOf(s.now())
	if !c.Rule.IsRequired(today) {
		return LiveStatus(c.Rule, today, today, false), nil
	}
	ok, err := s.creditedLive(ctx, tx, c, uid, today)
	if err != nil {
		return "", err
	}
	return LiveStatus(c.Rule, today, today, ok), nil
}

func (s *Service) creditedLive(ctx Ctx, tx Tx, c Challenge, uid string, d Day) (bool, error) {
	ws, err := tx.JudgeWorkouts(ctx, []string{uid}, d.Start(), d.End())
	if err != nil {
		return false, err
	}
	ps, err := tx.Proofs(ctx, c.ID, uid)
	if err != nil {
		return false, err
	}
	_, ok := BestCredit(c.Rule, d, workoutsOf(ws, uid), proofsOf(ps, uid), c.Rule.MinSets)
	return ok, nil
}

func workoutsOf(ws []UserWorkout, uid string) []Workout {
	var out []Workout
	for _, w := range ws {
		if w.UserID == uid {
			out = append(out, w.Workout)
		}
	}
	return out
}

func proofsOf(ps []ProofRow, uid string) []Proof {
	var out []Proof
	for _, p := range ps {
		if p.UserID == uid {
			out = append(out, p.Proof)
		}
	}
	return out
}

// Get — 멤버만(나간 멤버는 NotFound · SRS-121). week = nil 이면 오늘이 든 주(끝났으면 마지막 주).
func (s *Service) Get(ctx Ctx, uid, id string, week *int) (Detail, error) {
	if err := needUser(uid); err != nil {
		return Detail{}, err
	}
	var d Detail
	err := s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, false)
		if err != nil {
			return mapNF(err)
		}
		ms, err := tx.Members(ctx, id)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) {
			return notFound()
		}
		now := s.now()
		today := DayOf(now)
		r := c.Rule
		d.Challenge = c
		d.Members = ms
		d.MemberCount = len(activeIDs(ms))
		d.IsOwner = c.OwnerID == uid
		d.Today = today
		d.WeekCount = r.Weeks
		w := r.WeekIndex(today)
		if week != nil {
			w = *week
		}
		if w < 0 {
			w = 0
		}
		if w >= r.Weeks {
			w = r.Weeks - 1
		}
		d.Week = w
		if c.OwnerID == uid && c.Status == StatusRecruiting {
			d.InviteToken = c.Token
		}
		if c.EndedAt != nil {
			p := DayOf(c.EndedAt.Add(PhotoRetention))
			d.PurgeOn = &p
		}
		rows, err := tx.Days(ctx, id)
		if err != nil {
			return err
		}
		ps, err := tx.Proofs(ctx, id, uid)
		if err != nil {
			return err
		}
		debts, err := tx.Debts(ctx, id)
		if err != nil {
			return err
		}
		d.Debts = debts
		// 이번 주 실시간 인정(확정 전 칸) — 그 주 운동만 읽는다
		from := r.StartsOn.Add(7 * w)
		ws, err := tx.JudgeWorkouts(ctx, memberIDs(ms), from.Start(), from.Add(7).Start())
		if err != nil {
			return err
		}
		byKey := map[string]UserDay{}
		for _, row := range rows {
			byKey[row.UserID+"|"+row.Day.String()] = row
		}
		proofByID := map[string]ProofRow{}
		for _, p := range ps {
			proofByID[p.ID] = p
		}
		for _, m := range ms {
			for i := 0; i < 7; i++ {
				day := from.Add(i)
				cell := Cell{UserID: m.UserID, Day: day}
				if row, ok := byKey[m.UserID+"|"+day.String()]; ok {
					cell.Result, cell.Final, cell.ProofID = row.Result, row.Final, row.ProofID
				} else {
					cr, ok := BestCredit(r, day, workoutsOf(ws, m.UserID), proofsOf(ps, m.UserID), r.MinSets)
					cell.Result = LiveStatus(r, day, today, ok)
					if ok {
						cell.ProofID = cr.ProofID
					}
					if c.Status == StatusRecruiting && r.InRange(day) && r.IsRequired(day) {
						cell.Result = "upcoming"
					}
					if m.LeftAt != nil && !day.Before(DayOf(*m.LeftAt).Add(1)) {
						cell.Result = ""
					}
				}
				if p, ok := proofByID[cell.ProofID]; ok {
					cell.Web, cell.Suspect = p.Source == "web", p.Status == ProofSuspect
				}
				d.Cells = append(d.Cells, cell)
			}
		}
		// 합계·남은 면제권
		tal := map[string]*Tally{}
		for _, m := range ms {
			tal[m.UserID] = &Tally{UserID: m.UserID}
		}
		passesThisWeek := 0
		for _, row := range rows {
			t := tal[row.UserID]
			if t == nil {
				continue
			}
			switch row.Result {
			case ResDone:
				t.Done++
			case ResMadeUp:
				t.MadeUp++
			case ResPass:
				t.Pass++
				if row.UserID == uid && r.WeekIndex(row.Day) == r.WeekIndex(today) {
					passesThisWeek++
				}
			case ResMissed:
				t.Missed++
			}
		}
		for _, db := range debts {
			if t := tal[db.UserID]; t != nil {
				t.Debts++
				if db.PaidAt != nil {
					t.Paid++
				}
			}
		}
		for _, m := range ms {
			d.Tallies = append(d.Tallies, *tal[m.UserID])
		}
		d.MyPassesLeft = r.PassPerWeek - passesThisWeek
		if d.MyPassesLeft < 0 {
			d.MyPassesLeft = 0
		}
		if c.Status == StatusActive {
			ok, err := s.creditedLive(ctx, tx, c, uid, today)
			if err != nil {
				return err
			}
			d.MyToday = LiveStatus(r, today, today, ok)
		}
		return nil
	})
	return d, err
}

func memberIDs(ms []Member) []string {
	out := make([]string, 0, len(ms))
	for _, m := range ms {
		out = append(out, m.UserID)
	}
	return out
}

// ActiveForWorkout — 오늘 인증이 필요한 진행 중 챌린지(운동 화면 버튼). proved = 오늘 이미 인증한 챌린지 id.
func (s *Service) ActiveForWorkout(ctx Ctx, uid string) ([]Summary, []string, error) {
	if err := needUser(uid); err != nil {
		return nil, nil, err
	}
	var out []Summary
	var proved []string
	today := DayOf(s.now())
	err := s.repo.InTx(ctx, func(tx Tx) error {
		cs, err := tx.ListMine(ctx, uid)
		if err != nil {
			return err
		}
		for _, c := range cs {
			if c.Status != StatusActive || !c.Rule.NeedsPhoto() {
				continue
			}
			// 오늘이 쉬는 날이어도 어제를 만회할 수 있으니 기간 안(+다음 날)이면 보인다
			if today.Before(c.Rule.StartsOn) || today.After(c.Rule.LastDay().Add(1)) {
				continue
			}
			out = append(out, Summary{Challenge: c})
			ps, err := tx.Proofs(ctx, c.ID, uid)
			if err != nil {
				return err
			}
			for _, p := range ps {
				if p.UserID == uid && p.Status != ProofInvalid && DayOf(p.CapturedAt).Equal(today) {
					proved = append(proved, c.ID)
					break
				}
			}
		}
		return nil
	})
	return out, proved, err
}

// ── 인증 ──────────────────────────────────────────────────────────────────

const promptsPerMinute = 10

// IssuePrompt — 운동이 서버에 아직 없어도 발급한다(workout_id 만 기록 · 판정 때 대조 · REV-159).
func (s *Service) IssuePrompt(ctx Ctx, uid, id, workoutID string) (Prompt, error) {
	if err := needUser(uid); err != nil {
		return Prompt{}, err
	}
	if workoutID == "" || len(workoutID) > 64 {
		return Prompt{}, errs.New(errs.Validation, "운동을 시작한 뒤에 찍을 수 있어요")
	}
	now := s.now()
	var p Prompt
	err := s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, false)
		if err != nil {
			return mapNF(err)
		}
		ms, err := tx.Members(ctx, id)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) {
			return notFound()
		}
		if c.Status != StatusActive || !c.Rule.NeedsPhoto() {
			return errs.New(errs.Conflict, "지금은 인증 사진을 찍을 수 없어요")
		}
		n, err := tx.RecentPrompts(ctx, uid, now.Add(-time.Minute))
		if err != nil {
			return err
		}
		if n >= promptsPerMinute {
			return errs.New(errs.ResourceExhausted, "잠시 뒤에 다시 찍어 주세요")
		}
		p = Prompt{ID: s.newID(), ChallengeID: id, UserID: uid, WorkoutID: workoutID,
			Code: PromptCode(c.Rule.ProofMode, s.rnd()), IssuedAt: now}
		return tx.InsertPrompt(ctx, p)
	})
	return p, err
}

// UploadProof — 지시 3분 · 일회용 · 본인 · 진행 중 멤버. 서버가 다시 인코딩하고 dHash 로 중복을 본다.
func (s *Service) UploadProof(ctx Ctx, uid, promptID string, img []byte, source string) (ProofRow, error) {
	if err := needUser(uid); err != nil {
		return ProofRow{}, err
	}
	if source != "app" {
		source = "web"
	}
	now := s.now()
	// [개선] 사진을 열기 전에 횟수와 지시부터 본다(REV-160 1) — 아무 지시 id 로 큰 사진을 계속 보내 디코드·디스크를 태우지 못하게
	if !s.allowUpload(uid, now) {
		return ProofRow{}, errs.New(errs.ResourceExhausted, "잠시 뒤에 다시 찍어 주세요")
	}
	if err := s.repo.InTx(ctx, func(tx Tx) error {
		p, err := tx.PromptForUpdate(ctx, promptID)
		if err != nil {
			return errs.New(errs.NotFound, "지시를 찾을 수 없어요 — 새 지시로 다시 찍어 주세요")
		}
		_, err = checkPrompt(ctx, tx, uid, p, now)
		return err
	}); err != nil {
		return ProofRow{}, err
	}
	select {
	case s.decode <- struct{}{}:
	case <-ctx.Done():
		return ProofRow{}, ctx.Err()
	}
	data, hash, err := ProcessPhoto(img)
	<-s.decode
	if err != nil {
		return ProofRow{}, errs.New(errs.Validation, "사진을 읽을 수 없어요")
	}
	// 파일을 먼저 저장하고(트랜잭션 밖 · 느린 IO), 실패하면 지운다
	key, err := s.photos.Save(ctx, data, "image/jpeg")
	if err != nil {
		return ProofRow{}, err
	}
	var out ProofRow
	err = s.repo.InTx(ctx, func(tx Tx) error {
		p, err := tx.PromptForUpdate(ctx, promptID)
		if err != nil {
			return errs.New(errs.NotFound, "지시를 찾을 수 없어요 — 새 지시로 다시 찍어 주세요")
		}
		// 지시 시각은 처음 본 now 로 잰다 — 디코드가 밀려 3분을 넘겨도 사용자의 잘못이 아니다
		c, err := checkPrompt(ctx, tx, uid, p, now)
		if err != nil {
			return err
		}
		status, dupOf := ProofOK, ""
		if pid, dist, ok, err := tx.NearestOwn(ctx, uid, hash); err != nil {
			return err
		} else if ok && dist <= DupRejectDist {
			return errs.New(errs.Conflict, "전에 올린 사진과 같은 사진이에요 — 새로 찍어 주세요")
		} else if ok && dist <= DupOwnSuspectDist {
			status, dupOf = ProofSuspect, pid
		}
		if pid, dist, ok, err := tx.NearestGroup(ctx, c.ID, uid, hash); err != nil {
			return err
		} else if ok && dist <= DupSuspectDist {
			status, dupOf = ProofSuspect, pid
		}
		if err := tx.UsePrompt(ctx, p.ID, now); err != nil {
			return err
		}
		out = ProofRow{
			Proof:       Proof{ID: s.newID(), WorkoutID: p.WorkoutID, IssuedAt: p.IssuedAt, CapturedAt: now, Status: status},
			ChallengeID: c.ID, UserID: uid, PromptID: p.ID, PromptCode: p.Code, StorageKey: key, Hash: hash, Source: source, DupOf: dupOf,
		}
		return tx.InsertProof(ctx, out)
	})
	if err != nil {
		if derr := s.photos.Delete(context.WithoutCancel(ctx), key); derr != nil {
			slog.Warn("인증 사진 정리 실패", "err", derr)
		}
		return ProofRow{}, err
	}
	return out, nil
}

type ProofView struct {
	ProofRow
	Day       Day
	Flaggable bool
}

// ListProofs — 멤버만. day·user 로 좁힌다(비우면 전부).
func (s *Service) ListProofs(ctx Ctx, uid, id, day, user string) ([]ProofView, error) {
	if err := needUser(uid); err != nil {
		return nil, err
	}
	var out []ProofView
	now := s.now()
	err := s.repo.InTx(ctx, func(tx Tx) error {
		ms, err := tx.Members(ctx, id)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) {
			return notFound()
		}
		c, err := tx.GetChallenge(ctx, id, false)
		if err != nil {
			return mapNF(err)
		}
		ps, err := tx.Proofs(ctx, id, uid)
		if err != nil {
			return err
		}
		ws, err := s.workoutDays(ctx, tx, ps)
		if err != nil {
			return err
		}
		for _, p := range ps {
			d := proofDay(p, ws)
			if (day != "" && d.String() != day) || (user != "" && p.UserID != user) {
				continue
			}
			v := ProofView{ProofRow: p, Day: d}
			// [원본] now.Before(d.Finalize()) — 끝난 챌린지에도 이의 단추가 보였다(REV-160 5)
			v.Flaggable = p.UserID != uid && p.Status != ProofInvalid && c.Status == StatusActive && now.Before(flagDeadline(c, d))
			v.StorageKey = ""
			out = append(out, v)
		}
		return nil
	})
	return out, err
}

// workoutDays — 인증 날짜 = 그 운동 시작의 날(REV-159). 운동이 아직 서버에 없으면 받은 시각의 날.
func (s *Service) workoutDays(ctx Ctx, tx Tx, ps []ProofRow) (map[string]Day, error) {
	out := map[string]Day{}
	if len(ps) == 0 {
		return out, nil
	}
	users := map[string]bool{}
	from, to := ps[0].CapturedAt, ps[0].CapturedAt
	for _, p := range ps {
		users[p.UserID] = true
		if p.CapturedAt.Before(from) {
			from = p.CapturedAt
		}
		if p.CapturedAt.After(to) {
			to = p.CapturedAt
		}
	}
	var ids []string
	for u := range users {
		ids = append(ids, u)
	}
	sort.Strings(ids)
	ws, err := tx.JudgeWorkouts(ctx, ids, from.Add(-MaxWorkout-ProofAfter), to.Add(ProofBefore))
	if err != nil {
		return nil, err
	}
	for _, w := range ws {
		out[w.ID] = DayOf(w.StartedAt)
	}
	return out, nil
}

func proofDay(p ProofRow, ws map[string]Day) Day {
	if d, ok := ws[p.WorkoutID]; ok {
		return d
	}
	return DayOf(p.CapturedAt)
}

// Flag — 「인증 아닌 것 같아요」. 그날 확정 전까지 · 본인 아님 · 무효는 되돌리지 않는다(REV-159).
func (s *Service) Flag(ctx Ctx, uid, proofID string, on bool) (ProofView, error) {
	if err := needUser(uid); err != nil {
		return ProofView{}, err
	}
	now := s.now()
	var view ProofView
	var notifyUser, chID string
	err := s.repo.InTx(ctx, func(tx Tx) error {
		p, err := tx.GetProof(ctx, proofID, true)
		if err != nil {
			return mapNF(err)
		}
		c, err := tx.GetChallenge(ctx, p.ChallengeID, true)
		if err != nil {
			return mapNF(err)
		}
		ms, err := tx.Members(ctx, c.ID)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) {
			return notFound()
		}
		if p.UserID == uid {
			return errs.New(errs.Validation, "내 인증에는 할 수 없어요")
		}
		if p.Status == ProofInvalid {
			return errs.New(errs.Conflict, "이미 무효가 된 인증이에요")
		}
		ws, err := s.workoutDays(ctx, tx, []ProofRow{p})
		if err != nil {
			return err
		}
		d := proofDay(p, ws)
		// 마감 = 그날 확정 시각(D+1 끝 + 12시간). done 은 첫 판정 때 final 이지만 마감 전이면 이의로 뒤집힌다.
		// [원본] if !now.Before(d.Finalize()) — 챌린지 끝을 넘겨 받았다(REV-160 5)
		if c.Status != StatusActive || !now.Before(flagDeadline(c, d)) {
			return errs.New(errs.Conflict, "이의 기간이 지났어요")
		}
		if !on {
			if err := tx.DeleteFlag(ctx, p.ID, uid); err != nil {
				return err
			}
		} else {
			if err := tx.InsertFlag(ctx, p.ID, uid, now); err != nil {
				return err
			}
			n, err := tx.CountFlags(ctx, c.ID, p.ID)
			if err != nil {
				return err
			}
			others := 0
			for _, m := range ms {
				if m.Active() && m.UserID != p.UserID {
					others++
				}
			}
			if need := Majority(others); need > 0 && n >= need {
				if ok, err := tx.SetProofInvalid(ctx, p.ID, now); err != nil {
					return err
				} else if ok {
					p.Status = ProofInvalid
					if err := s.rejudgeProof(ctx, tx, c, p, now); err != nil {
						return err
					}
					if first, err := tx.InsertNotice(ctx, c.ID, p.UserID, NoticeProofInvalid, p.ID); err != nil {
						return err
					} else if first {
						notifyUser, chID = p.UserID, c.ID
					}
				}
			}
		}
		ps, err := tx.Proofs(ctx, c.ID, uid)
		if err != nil {
			return err
		}
		for _, x := range ps {
			if x.ID == p.ID {
				view = ProofView{ProofRow: x, Day: d}
				view.StorageKey = ""
				view.Flaggable = x.Status != ProofInvalid && now.Before(flagDeadline(c, d))
			}
		}
		return nil
	})
	if err == nil && notifyUser != "" {
		s.notify.NotifySelf(ctx, notifyUser, NoticeProofInvalid, chID)
	}
	return view, err
}

// rejudgeProof — 그 인증을 근거로 쓴 날을 다시 판정한다(얼림 예외). 벌칙도 맞춘다.
func (s *Service) rejudgeProof(ctx Ctx, tx Tx, c Challenge, p ProofRow, now time.Time) error {
	rows, err := tx.Days(ctx, c.ID)
	if err != nil {
		return err
	}
	for _, row := range rows {
		if row.UserID != p.UserID || row.ProofID != p.ID {
			continue
		}
		in, err := s.judgeInput(ctx, tx, c, row.UserID, row.Day, rows, now)
		if err != nil {
			return err
		}
		next := Rejudge(in)
		if err := s.writeDay(ctx, tx, c, row.UserID, row.Day, next, now); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) judgeInput(ctx Ctx, tx Tx, c Challenge, uid string, d Day, rows []UserDay, now time.Time) (JudgeInput, error) {
	ws, err := tx.JudgeWorkouts(ctx, []string{uid}, d.Start(), d.Add(2).Start())
	if err != nil {
		return JudgeInput{}, err
	}
	ps, err := tx.Proofs(ctx, c.ID, uid)
	if err != nil {
		return JudgeInput{}, err
	}
	var prev *DayRow
	used := 0
	for _, r := range rows {
		if r.UserID != uid {
			continue
		}
		if r.Day.Equal(d) {
			rr := r.DayRow
			prev = &rr
			continue
		}
		if r.Result == ResPass && c.Rule.WeekIndex(r.Day) == c.Rule.WeekIndex(d) {
			used++
		}
	}
	return JudgeInput{Rule: c.Rule, Day: d, Prev: prev, Workouts: workoutsOf(ws, uid), Proofs: proofsOf(ps, uid),
		PassesUsed: used, Now: now}, nil
}

// writeDay — 행을 쓰고 벌칙을 맞춘다. next = nil 이면 행을 지운다.
func (s *Service) writeDay(ctx Ctx, tx Tx, c Challenge, uid string, d Day, next *DayRow, now time.Time) error {
	if next == nil {
		if err := tx.DeleteDay(ctx, c.ID, uid, d); err != nil {
			return err
		}
		return tx.DeleteDebt(ctx, c.ID, uid, d)
	}
	if err := tx.UpsertDay(ctx, c.ID, uid, *next, now); err != nil {
		return err
	}
	if next.Result == ResMissed {
		return tx.InsertDebt(ctx, c.ID, uid, d)
	}
	return tx.DeleteDebt(ctx, c.ID, uid, d)
}

// MarkDebtPaid — 본인과 방장.
func (s *Service) MarkDebtPaid(ctx Ctx, uid, id, user string, day Day, paid bool) error {
	if err := needUser(uid); err != nil {
		return err
	}
	now := s.now()
	return s.repo.InTx(ctx, func(tx Tx) error {
		c, err := tx.GetChallenge(ctx, id, false)
		if err != nil {
			return mapNF(err)
		}
		ms, err := tx.Members(ctx, id)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) {
			return notFound()
		}
		if uid != user && uid != c.OwnerID {
			return errs.New(errs.Forbidden, "본인이나 방장만 체크할 수 있어요")
		}
		var at *time.Time
		if paid {
			at = &now
		}
		ok, err := tx.SetDebtPaid(ctx, id, user, day, at, uid)
		if err != nil {
			return err
		}
		if !ok {
			return errs.New(errs.NotFound, "벌칙을 찾을 수 없어요")
		}
		return nil
	})
}

// ReadPhoto — 멤버만(나간 멤버 제외). 호출부가 닫는다.
func (s *Service) ReadPhoto(ctx Ctx, uid, proofID string) (io.ReadCloser, error) {
	if uid == "" {
		return nil, ErrNotFound
	}
	var key string
	err := s.repo.InTx(ctx, func(tx Tx) error {
		p, err := tx.GetProof(ctx, proofID, false)
		if err != nil {
			return err
		}
		ms, err := tx.Members(ctx, p.ChallengeID)
		if err != nil {
			return err
		}
		if !activeMember(ms, uid) || p.StorageKey == "" {
			return ErrNotFound
		}
		key = p.StorageKey
		return nil
	})
	if err != nil {
		return nil, ErrNotFound
	}
	return s.photos.Open(ctx, key)
}

// ReadPhotoForReview — 신고 검토(운영). 권한은 호출부(moderation)가 이미 확인했다.
func (s *Service) ReadPhotoForReview(ctx Ctx, proofID string) ([]byte, error) {
	var key string
	err := s.repo.InTx(ctx, func(tx Tx) error {
		p, err := tx.GetProof(ctx, proofID, false)
		if err != nil {
			return err
		}
		key = p.StorageKey
		return nil
	})
	if err != nil || key == "" {
		return nil, ErrNotFound
	}
	rc, err := s.photos.Open(ctx, key)
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	return io.ReadAll(io.LimitReader(rc, MaxPhotoBytes))
}
