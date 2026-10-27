// @plm SRS-006  계정·인증 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것: 누가 로그인할 수 있는가 · 토큰을 언제 내주고 언제 무효로 하는가.
// 저장 방법(SQL)도, 전달 방법(RPC)도 모른다 — 그래서 DB 없이 테스트가 돈다.
//
// ── 지키는 규칙 세 가지 ─────────────────────────────────────────────────────
//
// ① **로그인 실패는 한 가지 오류로만 답한다.**
//
//	"그런 이메일 없음"과 "비밀번호 틀림"을 구분해 주면, 공격자가 이메일 목록을 만들 수 있다.
//	비밀번호가 없는 계정(소셜 로그인)도 같은 오류로 답한다.
//
// ② **없는 이메일이어도 해시 계산은 한다.**
//
//	있는 계정만 bcrypt를 돌리면 응답 시간이 갈려서 "가입 여부"가 시간으로 새어 나간다.
//	그래서 사용자를 못 찾아도 더미 해시로 한 번 비교한다(타이밍 평탄화).
//
// ③ **refresh는 쓰는 순간 폐기하고 새로 준다**(회전).
//
//	훔친 토큰을 쓰면 진짜 사용자의 것이 무효가 되어 도난이 드러난다.
//	토큰 원문은 저장하지 않는다 — 해시만 둔다.
//
// ─────────────────────────────────────────────────────────────────────────────
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"log/slog"
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
	// 이메일 소유가 확인됐는가(SRS-052 · 0013의 email_verified_at)
	EmailVerified bool
}

// RefreshToken은 살아 있는 세션 하나다.
type RefreshToken struct {
	UserID    string
	ExpiresAt time.Time
	// 0018 · SRS-083 — 회전 유예·재사용 탐지에 쓴다. 폐기되지 않았으면 RevokedAt 은 nil.
	FamilyID     string
	RevokedAt    *time.Time
	RevokeReason string
	// 0019 · SRS-083 — 「미사용 후계」 규칙. TokenHash 는 자기 해시, ParentHash 는 이 토큰을 만든 회전의 옛 토큰.
	TokenHash  string
	ParentHash string
}

// 폐기 사유(0018 · SRS-083). 유예는 rotated 에만 준다.
const (
	revokeRotated = "rotated"
	revokeLogout  = "logout"
	revokeReuse   = "reuse"
	// 0019 — 미사용 후계를 대체했다(응답 유실·탭 경합 구제).
	revokeSuperseded = "superseded"
)

// refreshReuseGrace — **대체된(superseded)** 토큰을 받아 주는 짧은 창. 탭 둘이 같은 쿠키로 갱신해 서로의 후계를
// 대체했을 때, 브라우저 쿠키 저장소에 진 쪽 토큰이 남은 경우를 살린다(QA L-7). 회전된(rotated) 토큰에는 시간 창이
// 없다 — 「미사용 후계」 규칙이 판단한다(Refresh 주석).
const refreshReuseGrace = 30 * time.Second

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

	// [원본] 회전 유예가 없던 때의 세 가지 — pgRepo 에 함수는 남아 있다(GetLiveRefreshToken·RevokeRefreshToken).
	// CreateRefreshToken(ctx context.Context, hash, userID string, expiresAt time.Time) error
	// GetLiveRefreshToken(ctx context.Context, hash string) (RefreshToken, error)
	// RevokeRefreshToken(ctx context.Context, hash string) error

	// [개선] 0018·0019 · SRS-083 — 계열(family)·부모(parent)·폐기 사유로 회전 유예·재사용 탐지를 가린다.
	// parentHash: 회전으로 만들었으면 옛 토큰 해시, 새 로그인이면 "".
	CreateRefreshToken(ctx context.Context, hash, userID, familyID, parentHash string, expiresAt time.Time) error
	// 만료되지 않았으면 폐기됐어도 돌려준다. 없거나 만료면 NotFound.
	GetRefreshToken(ctx context.Context, hash string) (RefreshToken, error)
	// 살아 있을 때만 rotated 로 폐기한다. true = 내가 회전했다(동시 갱신의 승자).
	RotateRefreshToken(ctx context.Context, hash string, at time.Time) (bool, error)
	// [원본] 「마지막 회전이면 허용」 판단용 — 재사용 탐지를 무력화해 뺐다(/qa code H-1). pgRepo 에 함수는 남아 있다.
	// LatestRotationAt(ctx context.Context, familyID string) (time.Time, error)
	// [개선] 계열의 살아 있는 토큰(언제나 하나). 없으면 found=false.
	LiveRefreshInFamily(ctx context.Context, familyID string) (RefreshToken, bool, error)
	// 살아 있는 토큰을 superseded 로 폐기한다(미사용 후계 대체).
	SupersedeRefreshToken(ctx context.Context, hash string, at time.Time) error
	// 한 사용자의 세션 결정을 한 트랜잭션·한 줄로 세운다(/qa code H-3). fn 이 받는 Repo 는 그 트랜잭션에 묶여 있다.
	WithUserLock(ctx context.Context, userID string, fn func(Repo) error) error
	// 계열 전체를 그 사유로 끊는다. 이미 폐기된 행의 사유도 덮어쓴다(유예를 닫는다).
	RevokeRefreshFamily(ctx context.Context, familyID, reason string, at time.Time) error
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
	// 정식 계정 기능(account.go) — WithAccount로 끼운다. nil 이면 메일 없는 옛 동작
	acct *Account
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

	// 주소 확인 메일 — 실패해도 가입은 성공한다(재발송이 복구 경로 · account.go 규칙 ⑤).
	if _, err := s.sendVerification(ctx, u, true); err != nil {
		slog.Error("[auth] 가입 확인 메일 준비 실패", "err", err)
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

// [원본] 유예 없는 회전 — 응답을 못 받은 갱신 하나·탭 둘의 동시 갱신이 세션 전체를 죽였다(H-1).
// 원복하려면 아래 RefreshV1 을 Refresh 로 되돌린다.
func (s *Service) RefreshV1(ctx context.Context, rawToken string) (User, Tokens, error) {
	hash := hashToken(rawToken)
	rt, err := s.repo.GetRefreshToken(ctx, hash)
	if err != nil || rt.RevokedAt != nil {
		// 없거나 이미 폐기됐거나 만료됐다 — 어느 쪽인지 알려 주지 않는다.
		return User{}, Tokens{}, errs.New(errs.Unauthorized, "세션이 만료되었습니다. 다시 로그인해 주세요")
	}

	u, err := s.repo.GetUserByID(ctx, rt.UserID)
	if err != nil {
		return User{}, Tokens{}, errs.New(errs.Unauthorized, "세션이 만료되었습니다. 다시 로그인해 주세요")
	}

	// **먼저 폐기하고** 새로 준다. 순서가 반대면 실패 시 두 토큰이 동시에 살아 있을 수 있다.
	if _, err := s.repo.RotateRefreshToken(ctx, hash, s.now()); err != nil {
		return User{}, Tokens{}, err
	}

	tokens, err := s.issue(ctx, u)
	return u, tokens, err
}

// [원본 V2] 회전 + 유예 + 「마지막 회전이면 허용」 — /qa code H-1·H-2 로 대체했다(탈취 토큰이 평행 세션을 만든다).
// 원복하려면 아래를 되살리고 저장소 인터페이스(LatestRotationAt·CreateRefreshToken 인자)도 그때로 돌린다.
// //
// // 회전은 그대로 한다(먼저 폐기, 그다음 같은 계열로 새 토큰). 회전으로 폐기된 토큰이 다시 오면:
// //   - 30초 안이면 받아 준다 — 같은 쿠키로 탭 둘이 동시에 갱신한 경우.
// //   - 그 토큰이 계열의 **마지막 회전**이면 받아 준다 — 그 뒤 새 토큰이 한 번도 쓰이지 않았다는 뜻이고,
// //     정상 클라이언트가 응답(새 쿠키)을 못 받은 채 앱을 닫았다가 다시 연 경우다.
// //   - 그 밖(이미 다음 회전이 일어난 옛 토큰을 30초 밖에서)은 **탈취**로 본다 → 계열 전체를 끊는다.
// //
// // 로그아웃·재사용 탐지·전체 폐기로 끊긴 토큰에는 유예가 없다.
// func (s *Service) Refresh(ctx context.Context, rawToken string) (User, Tokens, error) {
// 	expired := errs.New(errs.Unauthorized, "세션이 만료되었습니다. 다시 로그인해 주세요")
// 	hash := hashToken(rawToken)
// 	rt, err := s.repo.GetRefreshToken(ctx, hash)
// 	if err != nil {
// 		// 없거나 만료됐다 — 어느 쪽인지 알려 주지 않는다.
// 		return User{}, Tokens{}, expired
// 	}
// 	u, err := s.repo.GetUserByID(ctx, rt.UserID)
// 	if err != nil {
// 		return User{}, Tokens{}, expired
// 	}
// 	family := rt.FamilyID
// 	if family == "" {
// 		family = hash // 0018 이전 토큰은 저마다 자기 계열이다
// 	}
// 	now := s.now()
//
// 	if rt.RevokedAt == nil {
// 		won, err := s.repo.RotateRefreshToken(ctx, hash, now)
// 		if err != nil {
// 			return User{}, Tokens{}, err
// 		}
// 		if won {
// 			tokens, err := s.issueInFamily(ctx, u, family)
// 			return u, tokens, err
// 		}
// 		// 같은 순간 다른 요청이 먼저 회전했다 — 방금 폐기된 토큰으로 다시 읽어 유예 규칙을 탄다.
// 		if rt, err = s.repo.GetRefreshToken(ctx, hash); err != nil || rt.RevokedAt == nil {
// 			return User{}, Tokens{}, expired
// 		}
// 	}
//
// 	if rt.RevokeReason != revokeRotated {
// 		return User{}, Tokens{}, expired
// 	}
// 	if !s.reuseAllowed(ctx, rt, family, now) {
// 		// 재사용 탐지 — 훔친 토큰이 쓰였거나 정상 사용자가 옛 쿠키를 들고 있다. 어느 쪽이든 그 계열을 끊는다.
// 		if err := s.repo.RevokeRefreshFamily(ctx, family, revokeReuse, now); err != nil {
// 			slog.Error("[auth] 재사용 탐지 뒤 계열 폐기 실패", "err", err)
// 		}
// 		slog.Warn("[auth] refresh 재사용 탐지 — 계열 폐기", "user", rt.UserID)
// 		return User{}, Tokens{}, expired
// 	}
// 	tokens, err := s.issueInFamily(ctx, u, family)
// 	return u, tokens, err
// }
//
// // reuseAllowed — 회전으로 폐기된 토큰을 다시 받아 줄지.
// func (s *Service) reuseAllowed(ctx context.Context, rt RefreshToken, family string, now time.Time) bool {
// 	if rt.RevokedAt == nil {
// 		return false
// 	}
// 	if now.Sub(*rt.RevokedAt) <= refreshReuseGrace {
// 		return true
// 	}
// 	latest, err := s.repo.LatestRotationAt(ctx, family)
// 	if err != nil {
// 		return false
// 	}
// 	// 이 토큰보다 뒤에 일어난 회전이 없다 = 새 토큰이 쓰인 적 없다.
// 	return !latest.After(*rt.RevokedAt)
// }

// @plm SRS-083  [개선] 회전 + 「미사용 후계」 규칙 + 계열 재사용 탐지(/qa code H-1·H-2·H-3)
//
// 살아 있는 토큰이 오면 회전한다(옛 토큰 rotated, 새 토큰의 parent = 옛 토큰). 폐기된 토큰이 오면:
//   - rotated R: 계열의 살아 있는 토큰이 R 의 후계이고 **아직 한 번도 쓰이지 않았으면** 응답 유실로 본다 →
//     그 후계를 superseded 로 대체하고 새 후계를 준다. 후계가 이미 쓰였으면 재사용 → 계열 전체 폐기.
//   - superseded X: 30초 안이고 계열의 살아 있는 토큰이 X 의 형제(같은 부모)면 탭 경합으로 보고 같은 방식으로
//     대체한다. 그 밖은 재사용 → 계열 전체 폐기.
//   - logout·reuse·all·legacy: 유예 없음.
//
// 그래서 한 계열에 살아 있는 토큰은 언제나 하나다 — 공격자와 정상 클라이언트 중 하나는 반드시 무효 토큰을 내밀게
// 되고, 그 순간 계열이 끊긴다(RFC 9700 §4.14.2). 판단·쓰기는 사용자 잠금 트랜잭션 안에서 한다(로그아웃·비밀번호
// 변경과 섞이지 않는다).
func (s *Service) Refresh(ctx context.Context, rawToken string) (User, Tokens, error) {
	expired := errs.New(errs.Unauthorized, "세션이 만료되었습니다. 다시 로그인해 주세요")
	hash := hashToken(rawToken)
	peek, err := s.repo.GetRefreshToken(ctx, hash) // 누구의 토큰인지만 본다 — 판단은 잠금 안에서 다시 읽는다
	if err != nil {
		return User{}, Tokens{}, expired // 없거나 만료 — 어느 쪽인지 알려 주지 않는다
	}
	u, err := s.repo.GetUserByID(ctx, peek.UserID)
	if err != nil {
		return User{}, Tokens{}, expired
	}

	var (
		tokens   Tokens
		ok       bool
		detected string // 재사용으로 끊은 계열(로그용)
	)
	err = s.repo.WithUserLock(ctx, u.ID, func(r Repo) error {
		rt, err := r.GetRefreshToken(ctx, hash)
		if err != nil {
			return nil // 그 사이 만료 — ok=false
		}
		family := rt.FamilyID
		if family == "" {
			family = hash // 0018 이전 토큰은 저마다 자기 계열이다
		}
		now := s.now()

		// parent: 새로 줄 토큰의 부모.
		var parent string
		switch {
		case rt.RevokedAt == nil:
			won, err := r.RotateRefreshToken(ctx, hash, now)
			if err != nil {
				return err
			}
			if !won { // 잠금 안이라 일어나지 않는다 — 안전하게 거절
				return nil
			}
			parent = hash
		case rt.RevokeReason == revokeRotated || rt.RevokeReason == revokeSuperseded:
			live, found, err := r.LiveRefreshInFamily(ctx, family)
			if err != nil {
				return err
			}
			if !found {
				return nil // 계열이 이미 끝났다(로그아웃·전체 폐기·만료) — 조용히 거절
			}
			want := hash // rotated R: 살아 있는 토큰이 R 의 후계여야 한다
			if rt.RevokeReason == revokeSuperseded {
				// superseded X: 30초 안 + 살아 있는 토큰이 X 의 형제(같은 부모)여야 한다.
				want = ""
				if rt.ParentHash != "" && now.Sub(*rt.RevokedAt) <= refreshReuseGrace {
					want = rt.ParentHash
				}
			}
			if want == "" || live.ParentHash != want {
				// 재사용 — 훔친 토큰이 쓰였거나 정상 사용자가 오래된 쿠키를 들고 있다. 어느 쪽이든 그 계열을 끊는다.
				if err := r.RevokeRefreshFamily(ctx, family, revokeReuse, now); err != nil {
					return err
				}
				detected = family
				return nil
			}
			if err := r.SupersedeRefreshToken(ctx, live.TokenHash, now); err != nil {
				return err
			}
			parent = want
		default:
			return nil // logout·reuse·all·legacy — 유예 없음
		}
		tokens, err = s.issueInFamily(ctx, r, u, family, parent)
		if err != nil {
			return err
		}
		ok = true
		return nil
	})
	if err != nil {
		return User{}, Tokens{}, err
	}
	if detected != "" {
		// 침해 대응 근거 — 원문 토큰은 남기지 않는다(QA L-5 일부).
		slog.Warn("[auth] refresh 재사용 탐지 — 계열 폐기", "user", u.ID, "family", shortHash(detected))
	}
	if !ok {
		return User{}, Tokens{}, expired
	}
	return u, tokens, nil
}

// shortHash — 로그에 남길 계열 식별자(해시 앞 12자). 원문 토큰이 아니라 해시의 일부다.
func shortHash(h string) string {
	if len(h) > 12 {
		return h[:12]
	}
	return h
}

// ── 로그아웃 ─────────────────────────────────────────────────────────────────

// 이 기기의 세션만 끊는다. 없는 토큰이어도 성공으로 답한다 — 로그아웃은 멱등이어야 하고,
// 실패를 알려 주면 "그 토큰은 유효했다"는 정보가 된다.
func (s *Service) LogOut(ctx context.Context, rawToken string) error {
	// [원본] 토큰 하나만 폐기 — 회전 유예로 생긴 형제 토큰이 살아남는다(SRS-083 · QA Q3).
	// return s.repo.RevokeRefreshToken(ctx, hashToken(rawToken))
	// [개선] 그 토큰의 계열 전체를 끊는다. 다른 기기(다른 계열)는 그대로.
	hash := hashToken(rawToken)
	rt, err := s.repo.GetRefreshToken(ctx, hash)
	if err != nil {
		return nil // 없거나 만료 — 로그아웃은 멱등
	}
	family := rt.FamilyID
	if family == "" {
		family = hash
	}
	// 갱신과 같은 사용자 잠금 안에서 끊는다 — 진행 중인 유예 재발급이 로그아웃 뒤에 새 토큰을 쓰지 못한다(H-3).
	return s.repo.WithUserLock(ctx, rt.UserID, func(r Repo) error {
		return r.RevokeRefreshFamily(ctx, family, revokeLogout, s.now())
	})
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

// issue — 새 로그인(새 계열).
func (s *Service) issue(ctx context.Context, u User) (Tokens, error) {
	return s.issueInFamily(ctx, s.repo, u, "", "")
}

// issueInFamily — family 가 비면 새 계열(자기 해시), 아니면 그 계열에 잇는다(회전·유예 재발급 · SRS-083).
// r: 갱신이면 잠금 트랜잭션에 묶인 저장소. parent: 이 토큰을 만든 회전의 옛 토큰(0019).
func (s *Service) issueInFamily(ctx context.Context, r Repo, u User, family, parent string) (Tokens, error) {
	access, err := s.signer.Sign(u.ID, u.Role, AccessTTL)
	if err != nil {
		return Tokens{}, err
	}

	raw, err := newRefreshToken()
	if err != nil {
		return Tokens{}, err
	}
	hash := hashToken(raw)
	if family == "" {
		family = hash
	}
	if err := r.CreateRefreshToken(ctx, hash, u.ID, family, parent, s.now().Add(refreshTTL)); err != nil {
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
