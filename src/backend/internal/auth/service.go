// @plm SRS-006  계정·인증 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것: 누가 로그인할 수 있는가 · 토큰을 언제 내주고 언제 무효로 하는가.
// 저장 방법(SQL)도, 전달 방법(RPC)도 모른다 — 그래서 DB 없이 테스트가 돈다.
//
// ── 지키는 규칙 세 가지 ─────────────────────────────────────────────────────
//
// ① **로그인 실패는 한 가지 오류로만 답한다.**
//    "그런 이메일 없음"과 "비밀번호 틀림"을 구분해 주면, 공격자가 이메일 목록을 만들 수 있다.
//    비밀번호가 없는 계정(소셜 로그인)도 같은 오류로 답한다.
//
// ② **없는 이메일이어도 해시 계산은 한다.**
//    있는 계정만 bcrypt를 돌리면 응답 시간이 갈려서 "가입 여부"가 시간으로 새어 나간다.
//    그래서 사용자를 못 찾아도 더미 해시로 한 번 비교한다(타이밍 평탄화).
//
// ③ **refresh는 쓰는 순간 폐기하고 새로 준다**(회전).
//    훔친 토큰을 쓰면 진짜 사용자의 것이 무효가 되어 도난이 드러난다.
//    토큰 원문은 저장하지 않는다 — 해시만 둔다.
// ─────────────────────────────────────────────────────────────────────────────
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	// access는 짧게 산다 — 훔쳐가도 금방 쓸모없어진다.
	AccessTTL = 15 * time.Minute
	// refresh는 길게 살지만 한 번 쓰면 폐기된다.
	refreshTTL = 30 * 24 * time.Hour

	// 옛 백엔드(server/, NestJS)와 같은 값이다 — 기존 해시를 그대로 옮길 수 있게.
	bcryptCost = 10
)

// 사용자를 못 찾았을 때 비교할 더미 해시. 있는 계정과 없는 계정의 응답 시간을 비슷하게 만든다.
// (값 자체는 무의미하다 — 어떤 비밀번호와도 맞지 않는다.)
var dummyHash = []byte("$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy")

// User는 도메인이 아는 사용자다. 저장소 행도, proto 메시지도 아니다.
type User struct {
	ID              string
	Email           string
	DisplayName     string
	AvatarURL       string
	PasswordHash    string
	AuthProvider    string
	Role            string
	ExperienceLevel string
	TrainerIntent   bool
	CreatedAt       time.Time
}

// RefreshToken은 살아 있는 세션 하나다.
type RefreshToken struct {
	UserID    string
	ExpiresAt time.Time
}

// ProfilePatch는 "보낸 것만 바꾼다"를 표현한다 — 빈 문자열로 지우는 것과 안 보낸 것을 구분한다.
type ProfilePatch struct {
	DisplayName        string
	SetDisplayName     bool
	AvatarURL          string
	SetAvatarURL       bool
	ExperienceLevel    string
	SetExperienceLevel bool
	TrainerIntent      bool
	SetTrainerIntent   bool
}

// Repo는 이 도메인이 저장소에 바라는 전부다. 구현은 repo.go(pgx)에 있고, 테스트는 가짜를 끼운다.
type Repo interface {
	CreateUser(ctx context.Context, u User) (User, error)
	GetUserByID(ctx context.Context, id string) (User, error)
	GetUserByEmail(ctx context.Context, email string) (User, error)
	UpdateProfile(ctx context.Context, id string, p ProfilePatch) (User, error)

	CreateRefreshToken(ctx context.Context, hash, userID string, expiresAt time.Time) error
	GetLiveRefreshToken(ctx context.Context, hash string) (RefreshToken, error)
	RevokeRefreshToken(ctx context.Context, hash string) error
}

// Tokens는 세션 한 벌이다.
type Tokens struct {
	AccessToken  string
	RefreshToken string
	ExpiresIn    int32
}

// Signer는 access 토큰을 만들고 검사한다. 구현은 jwt.go에 있다.
type Signer interface {
	Sign(userID, role string, ttl time.Duration) (string, error)
	Verify(token string) (userID string, role string, err error)
}

type Service struct {
	repo   Repo
	signer Signer
	now    func() time.Time
}

func NewService(repo Repo, signer Signer) *Service {
	return &Service{repo: repo, signer: signer, now: time.Now}
}

// ── 가입 ─────────────────────────────────────────────────────────────────────

func (s *Service) SignUp(ctx context.Context, email, password, displayName string) (User, Tokens, error) {
	email = normalizeEmail(email)
	if email == "" {
		return User{}, Tokens{}, errs.New(errs.Validation, "이메일이 필요합니다")
	}
	// 계약(protovalidate)이 이미 걸렀지만, RPC가 아닌 경로(이관·배치)로 들어올 수도 있어 한 번 더 본다.
	if len(password) < 8 {
		return User{}, Tokens{}, errs.New(errs.Validation, "비밀번호는 8자 이상이어야 합니다")
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return User{}, Tokens{}, err
	}

	u, err := s.repo.CreateUser(ctx, User{
		ID:           uuid.NewString(),
		Email:        email,
		DisplayName:  strings.TrimSpace(displayName),
		PasswordHash: string(hash),
		AuthProvider: "local",
		Role:         "user",
	})
	if err != nil {
		return User{}, Tokens{}, err
	}

	tokens, err := s.issue(ctx, u)
	return u, tokens, err
}

// ── 로그인 ───────────────────────────────────────────────────────────────────

func (s *Service) LogIn(ctx context.Context, email, password string) (User, Tokens, error) {
	u, err := s.repo.GetUserByEmail(ctx, normalizeEmail(email))

	// 사용자를 못 찾았어도 해시 비교를 한 번 한다 — 응답 시간으로 가입 여부가 새지 않게.
	stored := dummyHash
	if err == nil && u.PasswordHash != "" {
		stored = []byte(u.PasswordHash)
	}
	matchErr := bcrypt.CompareHashAndPassword(stored, []byte(password))

	// 셋 중 무엇이 틀렸든 **같은 오류**를 낸다.
	if err != nil || u.PasswordHash == "" || matchErr != nil {
		return User{}, Tokens{}, errs.New(errs.Unauthorized, "이메일 또는 비밀번호가 올바르지 않습니다")
	}

	tokens, err := s.issue(ctx, u)
	return u, tokens, err
}

// ── 갱신(회전) ───────────────────────────────────────────────────────────────

func (s *Service) Refresh(ctx context.Context, rawToken string) (User, Tokens, error) {
	hash := hashToken(rawToken)
	rt, err := s.repo.GetLiveRefreshToken(ctx, hash)
	if err != nil {
		// 없거나 이미 폐기됐거나 만료됐다 — 어느 쪽인지 알려 주지 않는다.
		return User{}, Tokens{}, errs.New(errs.Unauthorized, "세션이 만료되었습니다. 다시 로그인해 주세요")
	}

	u, err := s.repo.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return User{}, Tokens{}, errs.New(errs.Unauthorized, "세션이 만료되었습니다. 다시 로그인해 주세요")
	}

	// **먼저 폐기하고** 새로 준다. 순서가 반대면 실패 시 두 토큰이 동시에 살아 있을 수 있다.
	if err := s.repo.RevokeRefreshToken(ctx, hash); err != nil {
		return User{}, Tokens{}, err
	}

	tokens, err := s.issue(ctx, u)
	return u, tokens, err
}

// ── 로그아웃 ─────────────────────────────────────────────────────────────────

// 이 기기의 세션만 끊는다. 없는 토큰이어도 성공으로 답한다 — 로그아웃은 멱등이어야 하고,
// 실패를 알려 주면 "그 토큰은 유효했다"는 정보가 된다.
func (s *Service) LogOut(ctx context.Context, rawToken string) error {
	return s.repo.RevokeRefreshToken(ctx, hashToken(rawToken))
}

// ── 조회·수정 ────────────────────────────────────────────────────────────────

func (s *Service) Me(ctx context.Context, userID string) (User, error) {
	u, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return User{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return u, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, p ProfilePatch) (User, error) {
	if p.SetDisplayName {
		p.DisplayName = strings.TrimSpace(p.DisplayName)
	}
	if p.SetExperienceLevel && !validExperience(p.ExperienceLevel) {
		return User{}, errs.New(errs.Validation, "알 수 없는 경력 값입니다: %s", p.ExperienceLevel)
	}
	return s.repo.UpdateProfile(ctx, userID, p)
}

// VerifyAccess는 access 토큰에서 사용자 id를 꺼낸다. 미들웨어가 부른다.
func (s *Service) VerifyAccess(token string) (userID, role string, err error) {
	id, r, err := s.signer.Verify(token)
	if err != nil {
		return "", "", errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	return id, r, nil
}

// ── 내부 ─────────────────────────────────────────────────────────────────────

func (s *Service) issue(ctx context.Context, u User) (Tokens, error) {
	access, err := s.signer.Sign(u.ID, u.Role, AccessTTL)
	if err != nil {
		return Tokens{}, err
	}

	raw, err := newRefreshToken()
	if err != nil {
		return Tokens{}, err
	}
	if err := s.repo.CreateRefreshToken(ctx, hashToken(raw), u.ID, s.now().Add(refreshTTL)); err != nil {
		return Tokens{}, err
	}

	return Tokens{
		AccessToken:  access,
		RefreshToken: raw,
		ExpiresIn:    int32(AccessTTL.Seconds()),
	}, nil
}

// 이메일은 대소문자·공백을 정리해 저장한다 — 'A@b.com '과 'a@b.com'은 같은 사람이다.
func normalizeEmail(e string) string {
	return strings.ToLower(strings.TrimSpace(e))
}

// refresh 토큰 원문 — 32바이트 난수. 추측할 수 없어야 하므로 crypto/rand를 쓴다.
func newRefreshToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// 저장은 해시로만. 원문이 아니라 이 값이 DB에 남는다.
//
// 여기서 bcrypt를 쓰지 않는 이유: 토큰은 이미 32바이트 난수라 무차별 대입이 불가능하고,
// 갱신마다 느린 해시를 돌릴 이유가 없다. 사람이 고른 비밀번호와는 사정이 다르다.
func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func validExperience(v string) bool {
	switch v {
	case "", "beginner", "intermediate", "advanced":
		return true
	}
	return false
}
