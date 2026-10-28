// @plm SRS-088  운영 상태 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
// @plm SRS-087  백업 결과(daily·restore_test)로 경보 이유를 정한다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것: **기기 보고를 어떻게 믿을 만한 줄로 바꾸고, 언제 운영진을 부르는가.**
//
// ── 지키는 규칙 ─────────────────────────────────────────────────────────────
//
//	· 보고는 로그인한 사람이면 누구나(역할 무관). 동기가 죽어 있을 때가 가장 중요한 보고다.
//	· 기기가 보낸 값은 **잘라서** 믿는다: device_id 문자 검사 · 버전 32자 · 오류 200자(제어문자 제거) ·
//	  연속 실패 0..10000 · 미동기 0..10^7. 사용자당 최신 8줄 · 분당 6회(넘으면 조용히 무시).
//	· 시각은 기기가 보낸 「나이」로 **서버 시계에서** 다시 계산한다(기기 시계 틀어짐 무관 · qa spec H-2).
//	· 멈춤 판정은 기기의 isBackupStalled(core/src/domain/syncStall.ts)와 **같은 식**이다(qa spec H-1).
//	  어긋나면 사용자 화면은 경고가 없는데 운영 화면만 빨갛거나, 그 반대가 된다.
//	· 단 `now` 의 뜻이 다르다(qa code H-1): 기기는 앱이 열려 있을 때만 판정하고 곧 다시 시도하지만, 서버는 마지막
//	  보고를 그대로 둔 채 **서버의 지금**으로 판정한다. 그래서 서버는 식 앞에 거름망을 둔다(Classify):
//	  ① 같은 사용자의 더 새 건강한 보고가 있거나 서버 마지막 동기 쓰기가 그 보고보다 뒤면 → 풀린 것(목록에서 뺌)
//	  ② 보고가 72시간 넘게 없으면 → 「연락 끊긴 기기」(회색 · 경보 아님) — 이탈·재설치·기기 id 바뀜
//	  ③ 나머지만 「멈춤」(경보). 진짜 멈춘 기기는 앱을 쓰는 동안 최소 10분 간격으로 계속 보고하므로 ③ 에 잡힌다.
//	· 운영 화면은 admin 만 — claim 으로 빠르게 거르고 DB 역할을 다시 읽는다(qa spec M-8).
//	· 경보는 **안내**다. 남용(가짜 보고)으로 켜질 수 있지만, 화면이 원인 사용자를 보여 주므로 바로 드러난다.
//
// ─────────────────────────────────────────────────────────────────────────────
package ops

import (
	"context"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	// 사용자당 남기는 기기 줄 수(qa spec H-5 ①).
	KeepDevicesPerUser = 8
	// 사용자당 분당 보고 상한(qa spec H-5 ②) — 넘으면 조용히 무시한다.
	ReportsPerMinute = 6
	maxFailures      = 10_000
	maxPending       = 10_000_000
	maxVersionRunes  = 32
	maxErrorRunes    = 200
	// 기기 나이 상한 — 10년. 그보다 큰 값은 고장 난 시계거나 장난이다(시각 계산이 넘치지 않게).
	maxAge = 10 * 365 * 24 * time.Hour

	// 멈춤 판정(기기 isBackupStalled 와 같은 값).
	StaleAfter       = 24 * time.Hour
	StallFailures    = 3
	DailyStaleAfter  = 36 * time.Hour
	RestoreStaleDays = 40
	// 90일 넘게 보고 없는 줄은 조회에서 뺀다(지우지는 않는다).
	HealthWindow = 90 * 24 * time.Hour
	// 경보·「멈춘 사용자」는 이 안의 보고만 판정한다(qa code H-1). 넘으면 「연락 끊긴 기기」(경보 아님).
	ActiveReportWindow = 72 * time.Hour
	// 운영 화면 사용자 목록 상한(지금 규모의 수십 배).
	maxUsers = 1000
)

// 경보 이유 코드 — 화면이 문구로 바꾼다(계약 ops.proto 의 alert_reasons 주석과 같은 목록).
const (
	ReasonStalled       = "stalled"
	ReasonDailyNone     = "daily_none"
	ReasonDailyStale    = "daily_stale"
	ReasonRestoreNone   = "restore_none"
	ReasonRestoreOld    = "restore_old"
	ReasonRestoreFailed = "restore_failed"
	ReasonLowDisk       = "low_disk"
)

var deviceIDRe = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

// Report는 기기가 보낸 그대로다(잘리기 전).
type Report struct {
	DeviceID            string
	AppVersion          string
	SuccessAgeMs        *int64
	AttemptAgeMs        *int64
	ConsecutiveFailures int64
	Pending             *int64
	Blocked             bool
	LastError           string
}

// Health는 저장되는(또는 읽혀 온) 기기 한 줄이다. 시각은 서버 시계 기준.
type Health struct {
	UserID              string
	DeviceID            string
	AppVersion          string
	LastSuccessAt       *time.Time
	LastAttemptAt       *time.Time
	ConsecutiveFailures int32
	Pending             *int32
	Blocked             bool
	LastError           string
	FirstReportedAt     time.Time
	ReportedAt          time.Time
}

type UserRow struct {
	ID           string
	Email        string
	DisplayName  string
	LastSyncAt   *time.Time
	LastActiveAt *time.Time
}

type BackupRun struct {
	Kind          string
	OK            bool
	SizeBytes     int64
	Tables        int32
	DiskFreeBytes int64
	Detail        string
	CreatedAt     time.Time
}

type Repo interface {
	// upsert 와 사용자당 최신 keep 줄 정리를 **한 트랜잭션**에서.
	UpsertHealth(ctx context.Context, h Health, keep int) error
	// 없으면 ("", false, nil).
	UserRole(ctx context.Context, userID string) (string, bool, error)
	ListUsers(ctx context.Context, limit int) ([]UserRow, error)
	ListHealthSince(ctx context.Context, since time.Time) ([]Health, error)
	// 없으면 (BackupRun{}, false, nil). okOnly 면 성공 줄만.
	LastBackupRun(ctx context.Context, kind string, okOnly bool) (BackupRun, bool, error)
	// 사용자별 서버 마지막 동기 쓰기(max sync_records.updated_at) — 기록이 없는 사용자는 map 에 없다(qa code H-1 ②).
	LastSyncByUser(ctx context.Context, userIDs []string) (map[string]time.Time, error)
}

type Service struct {
	repo Repo
	now  func() time.Time

	mu     sync.Mutex
	recent map[string][]time.Time // 사용자 → 최근 1분 보고 시각(분당 상한)
}

func NewService(repo Repo, now func() time.Time) *Service {
	return &Service{repo: repo, now: now, recent: map[string][]time.Time{}}
}

// ── 보고 ─────────────────────────────────────────────────────────────────────

// ReportClientHealth — 로그인만 확인한다(역할 무관). 분당 상한을 넘으면 오류 없이 무시한다(accepted=false).
func (s *Service) ReportClientHealth(ctx context.Context, viewerID string, r Report) (accepted bool, err error) {
	if viewerID == "" {
		return false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	h, err := Normalize(viewerID, r, s.now())
	if err != nil {
		return false, err
	}
	if !s.allow(viewerID, h.ReportedAt) {
		return false, nil
	}
	if err := s.repo.UpsertHealth(ctx, h, KeepDevicesPerUser); err != nil {
		return false, err
	}
	return true, nil
}

// Normalize는 기기 값을 자르고 시각을 서버 시계로 다시 계산한다(순수 함수 — 테스트가 직접 부른다).
func Normalize(userID string, r Report, now time.Time) (Health, error) {
	id := strings.TrimSpace(r.DeviceID)
	if !deviceIDRe.MatchString(id) {
		return Health{}, errs.New(errs.Validation, "기기 id 형식이 아닙니다")
	}
	h := Health{
		UserID:              userID,
		DeviceID:            id,
		AppVersion:          cleanText(r.AppVersion, maxVersionRunes),
		LastSuccessAt:       atFromAge(now, r.SuccessAgeMs),
		LastAttemptAt:       atFromAge(now, r.AttemptAgeMs),
		ConsecutiveFailures: int32(clamp(r.ConsecutiveFailures, 0, maxFailures)),
		Blocked:             r.Blocked,
		LastError:           cleanText(r.LastError, maxErrorRunes),
		FirstReportedAt:     now,
		ReportedAt:          now,
	}
	if r.Pending != nil {
		p := int32(clamp(*r.Pending, 0, maxPending))
		h.Pending = &p
	}
	return h, nil
}

// server_now − age. 나이가 없으면 시각도 없다 · 음수(=미래)는 0 → now · 너무 크면 상한.
func atFromAge(now time.Time, ageMs *int64) *time.Time {
	if ageMs == nil {
		return nil
	}
	age := time.Duration(clamp(*ageMs, 0, int64(maxAge/time.Millisecond))) * time.Millisecond
	t := now.Add(-age)
	return &t
}

func clamp(v, lo, hi int64) int64 {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

// 제어문자를 지우고(줄바꿈·탭 포함 — 한 줄로 보인다) 앞뒤 공백을 걷은 뒤 n글자(룬)로 자른다.
func cleanText(s string, n int) string {
	var b strings.Builder
	count := 0
	for _, r := range strings.TrimSpace(s) {
		if unicode.IsControl(r) {
			continue
		}
		if count >= n {
			break
		}
		b.WriteRune(r)
		count++
	}
	return strings.TrimSpace(b.String())
}

// 사용자당 1분에 ReportsPerMinute 번까지. 인스턴스 메모리 — 여러 인스턴스면 그만큼 느슨해질 뿐이다(안내용 상한).
func (s *Service) allow(userID string, now time.Time) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	cut := now.Add(-time.Minute)
	kept := s.recent[userID][:0]
	for _, t := range s.recent[userID] {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= ReportsPerMinute {
		s.recent[userID] = kept
		return false
	}
	if len(s.recent) > 50_000 {
		s.recent = map[string][]time.Time{}
	}
	s.recent[userID] = append(kept, now)
	return true
}

// ── 판정 ─────────────────────────────────────────────────────────────────────

// IsStalled — 기기 isBackupStalled(core/src/domain/syncStall.ts)와 같은 식:
//
//	pending>0 && (blocked || failures≥3 || (stale24h && 시도 있음 && failures>0))
//	stale24h = 성공 없음 또는 now − 마지막 성공 > 24시간
func IsStalled(h Health, now time.Time) bool {
	if h.Pending == nil || *h.Pending <= 0 {
		return false
	}
	if h.Blocked {
		return true
	}
	if h.ConsecutiveFailures >= StallFailures {
		return true
	}
	stale := h.LastSuccessAt == nil || now.Sub(*h.LastSuccessAt) > StaleAfter
	return stale && h.LastAttemptAt != nil && h.ConsecutiveFailures > 0
}

// Classify — 식(IsStalled)에 걸린 줄을 「멈춤」(경보)과 「연락 끊긴 기기」(경보 아님)로 나눈다(qa code H-1).
// 풀린 줄(같은 사용자의 더 새 건강한 보고 · 그 보고 뒤의 서버 동기 쓰기)은 어느 쪽에도 넣지 않는다.
// health 순서를 그대로 지킨다(저장소가 사용자별 최신순으로 준다).
func Classify(health []Health, lastSync map[string]time.Time, now time.Time) (stalled, disconnected []Health) {
	for _, h := range health {
		if !IsStalled(h, now) {
			continue
		}
		if t, ok := lastSync[h.UserID]; ok && t.After(h.ReportedAt) {
			continue // 그 보고 뒤에 서버에 동기 쓰기가 있었다 — 기기 교체·재설치 뒤 잘 도는 중
		}
		if newerHealthy(health, h, now) {
			continue
		}
		if now.Sub(h.ReportedAt) > ActiveReportWindow {
			disconnected = append(disconnected, h)
			continue
		}
		stalled = append(stalled, h)
	}
	return stalled, disconnected
}

// 같은 사용자의 다른 기기 줄 중 h 보다 나중에 보고했고 멈춤이 아닌 것이 있는가.
func newerHealthy(health []Health, h Health, now time.Time) bool {
	for _, o := range health {
		if o.UserID == h.UserID && o.DeviceID != h.DeviceID && o.ReportedAt.After(h.ReportedAt) && !IsStalled(o, now) {
			return true
		}
	}
	return false
}

// 식(IsStalled)에 걸린 줄의 사용자만 — 거름망 ② 에 쓸 마지막 동기 쓰기를 묻는다.
func (s *Service) lastSyncFor(ctx context.Context, health []Health, now time.Time) (map[string]time.Time, error) {
	seen := map[string]bool{}
	ids := []string{}
	for _, h := range health {
		if IsStalled(h, now) && !seen[h.UserID] {
			seen[h.UserID] = true
			ids = append(ids, h.UserID)
		}
	}
	if len(ids) == 0 {
		return map[string]time.Time{}, nil
	}
	return s.repo.LastSyncByUser(ctx, ids)
}

// StalledDays — now − 마지막 성공(없으면 첫 보고)의 날 수(내림 · 음수 0).
func StalledDays(h Health, now time.Time) int32 {
	from := h.FirstReportedAt
	if h.LastSuccessAt != nil {
		from = *h.LastSuccessAt
	}
	d := now.Sub(from)
	if d < 0 {
		return 0
	}
	return int32(d / (24 * time.Hour))
}

// BackupFacts는 경보 판정에 필요한 백업 줄들이다(없으면 nil).
type BackupFacts struct {
	LastDaily       *BackupRun
	LastOkDaily     *BackupRun
	LastRestoreTest *BackupRun
}

// AlertReasons — 순서 고정(화면이 깜빡이지 않게): stalled · daily · restore · low_disk.
func AlertReasons(stalledCount int, b BackupFacts, now time.Time) []string {
	out := []string{}
	if stalledCount > 0 {
		out = append(out, ReasonStalled)
	}
	switch {
	case b.LastDaily == nil:
		out = append(out, ReasonDailyNone)
	case b.LastOkDaily == nil || now.Sub(b.LastOkDaily.CreatedAt) > DailyStaleAfter:
		out = append(out, ReasonDailyStale)
	}
	switch {
	case b.LastRestoreTest == nil:
		out = append(out, ReasonRestoreNone)
	case !b.LastRestoreTest.OK:
		out = append(out, ReasonRestoreFailed)
	case now.Sub(b.LastRestoreTest.CreatedAt) > RestoreStaleDays*24*time.Hour:
		out = append(out, ReasonRestoreOld)
	}
	if b.LastDaily != nil && strings.Contains(b.LastDaily.Detail, "low_disk") {
		out = append(out, ReasonLowDisk)
	}
	return out
}

// ── 운영 화면(admin) ─────────────────────────────────────────────────────────

type UserStatus struct {
	User    UserRow
	Devices []Health
}

type Stalled struct {
	User   UserRow
	Device Health
	Days   int32
}

type Status struct {
	Users   []UserStatus
	Stalled []Stalled
	// 보고가 72시간 넘게 끊긴 멈춤 줄 — 회색 목록 · 경보 아님(qa code H-1).
	Disconnected []Stalled
	Backup       BackupFacts
	Alert        bool
	Reasons      []string
	Now          time.Time
}

func (s *Service) GetOpsStatus(ctx context.Context, viewerID, role string) (Status, error) {
	if err := s.requireAdmin(ctx, viewerID, role); err != nil {
		return Status{}, err
	}
	now := s.now()
	users, err := s.repo.ListUsers(ctx, maxUsers)
	if err != nil {
		return Status{}, err
	}
	health, err := s.repo.ListHealthSince(ctx, now.Add(-HealthWindow))
	if err != nil {
		return Status{}, err
	}
	backup, err := s.backupFacts(ctx)
	if err != nil {
		return Status{}, err
	}

	byUser := map[string][]Health{}
	for _, h := range health {
		byUser[h.UserID] = append(byUser[h.UserID], h) // 저장소가 이미 최신순으로 준다
	}
	known := map[string]UserRow{}
	st := Status{Backup: backup, Now: now}
	for _, u := range users {
		known[u.ID] = u
		st.Users = append(st.Users, UserStatus{User: u, Devices: byUser[u.ID]})
	}
	// [원본] 90일 창 전체를 서버의 지금으로 판정 — 끊긴 기기가 최대 90일 상시 경보가 됐다(qa code H-1)
	// for _, h := range health {
	// 	if !IsStalled(h, now) {
	// 		continue
	// 	}
	// 	u, ok := known[h.UserID]
	// 	if !ok {
	// 		u = UserRow{ID: h.UserID} // 목록 상한 밖의 사용자도 멈춤에는 싣는다
	// 	}
	// 	st.Stalled = append(st.Stalled, Stalled{User: u, Device: h, Days: StalledDays(h, now)})
	// }
	// [개선] 거름망(Classify) — 최근 보고만 멈춤 · 오래된 줄은 연락 끊긴 기기 · 풀린 줄은 뺌
	lastSync, err := s.lastSyncFor(ctx, health, now)
	if err != nil {
		return Status{}, err
	}
	stalled, disconnected := Classify(health, lastSync, now)
	row := func(h Health) Stalled {
		u, ok := known[h.UserID]
		if !ok {
			u = UserRow{ID: h.UserID} // 목록 상한 밖의 사용자도 멈춤에는 싣는다
		}
		return Stalled{User: u, Device: h, Days: StalledDays(h, now)}
	}
	for _, h := range stalled {
		st.Stalled = append(st.Stalled, row(h))
	}
	for _, h := range disconnected {
		st.Disconnected = append(st.Disconnected, row(h))
	}
	st.Reasons = AlertReasons(len(st.Stalled), backup, now)
	st.Alert = len(st.Reasons) > 0
	return st, nil
}

// GetOpsAlert — 탭 점용. 사용자 목록 없이 판정만.
func (s *Service) GetOpsAlert(ctx context.Context, viewerID, role string) (bool, int, error) {
	if err := s.requireAdmin(ctx, viewerID, role); err != nil {
		return false, 0, err
	}
	now := s.now()
	health, err := s.repo.ListHealthSince(ctx, now.Add(-HealthWindow))
	if err != nil {
		return false, 0, err
	}
	backup, err := s.backupFacts(ctx)
	if err != nil {
		return false, 0, err
	}
	// [원본] n := 0
	// for _, h := range health {
	// 	if IsStalled(h, now) {
	// 		n++
	// 	}
	// }
	// [개선] GetOpsStatus 와 같은 거름망 — 탭 점과 /ops 화면이 같은 답을 낸다
	lastSync, err := s.lastSyncFor(ctx, health, now)
	if err != nil {
		return false, 0, err
	}
	stalled, _ := Classify(health, lastSync, now)
	n := len(stalled)
	reasons := AlertReasons(n, backup, now)
	return len(reasons) > 0, len(reasons), nil
}

func (s *Service) backupFacts(ctx context.Context) (BackupFacts, error) {
	var b BackupFacts
	get := func(kind string, okOnly bool) (*BackupRun, error) {
		r, ok, err := s.repo.LastBackupRun(ctx, kind, okOnly)
		if err != nil || !ok {
			return nil, err
		}
		return &r, nil
	}
	var err error
	if b.LastDaily, err = get("daily", false); err != nil {
		return b, err
	}
	if b.LastOkDaily, err = get("daily", true); err != nil {
		return b, err
	}
	if b.LastRestoreTest, err = get("restore_test", false); err != nil {
		return b, err
	}
	return b, nil
}

// 로그인하지 않은 것(401)과 권한이 없는 것(403)은 다른 답이다(moderation 과 같은 이유 — 화면이 토큰 갱신 뒤 재시도한다).
// claim 은 빠른 거부일 뿐이다 — admin 을 회수해도 access 토큰은 최대 15분 산다. 그래서 DB 역할을 다시 읽는다.
func (s *Service) requireAdmin(ctx context.Context, viewerID, role string) error {
	if viewerID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if role != "admin" {
		return errs.New(errs.Forbidden, "운영진 계정만 볼 수 있습니다")
	}
	dbRole, ok, err := s.repo.UserRole(ctx, viewerID)
	if err != nil {
		return err
	}
	if !ok || dbRole != "admin" {
		return errs.New(errs.Forbidden, "운영진 계정만 볼 수 있습니다")
	}
	return nil
}

// EmailHint — `@` 앞 3글자 + `…`. 주소가 없으면 빈 문자열.
func EmailHint(email string) string {
	local, _, _ := strings.Cut(strings.TrimSpace(email), "@")
	if local == "" {
		return ""
	}
	r := []rune(local)
	if len(r) > 3 {
		r = r[:3]
	}
	return string(r) + "…"
}
