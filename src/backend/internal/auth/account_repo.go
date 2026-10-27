// @plm SRS-052  정식 계정 저장소 — 일회용 토큰 · 소유 확인 · 비밀번호 · 소셜 로그인 수단
//
// 규칙(언제 발급하고 언제 소모하는가)은 account.go가 안다. 여기는 생성 타입 ↔ 도메인 변환뿐이다.
package auth

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 일회용 토큰의 목적 — 0013의 CHECK와 같은 목록이다.
const (
	PurposeVerifyEmail   = "verify_email"
	PurposeResetPassword = "reset_password"
	PurposeLoginCode     = "login_code"
	PurposeLinkTicket    = "link_ticket"
)

// AuthToken은 소모된 일회용 토큰이다(원문은 없다 — 해시로만 찾는다).
type AuthToken struct {
	UserID string
	Email  string
}

// Identity는 소셜 로그인 수단 하나다.
type Identity struct {
	UserID         string
	Provider       string
	ProviderUserID string
	Email          string
	CreatedAt      time.Time
}

// AccountRepo는 정식 계정 규칙이 저장소에 바라는 전부다. pgRepo가 Repo와 함께 구현한다.
// Repo와 나눈 이유: 기존 테스트의 가짜 저장소를 건드리지 않고 기능을 얹기 위해서다.
type AccountRepo interface {
	SetEmailVerified(ctx context.Context, userID string) error
	SetPasswordHash(ctx context.Context, userID, hash string) error
	RevokeAllRefreshTokens(ctx context.Context, userID string) error

	CreateAuthToken(ctx context.Context, hash, userID, purpose, email string, expiresAt time.Time) error
	ConsumeAuthToken(ctx context.Context, hash, purpose string) (AuthToken, error)
	LastAuthTokenAt(ctx context.Context, userID, purpose string) (time.Time, error)
	InvalidateAuthTokens(ctx context.Context, userID, purpose string) error

	GetIdentity(ctx context.Context, provider, providerUserID string) (Identity, error)
	CreateIdentity(ctx context.Context, userID, provider, providerUserID, email string) error
	ListIdentities(ctx context.Context, userID string) ([]Identity, error)
	DeleteIdentity(ctx context.Context, userID, provider string) (int64, error)
}

func (r *pgRepo) SetEmailVerified(ctx context.Context, userID string) error {
	return r.q.SetEmailVerified(ctx, userID)
}

func (r *pgRepo) SetPasswordHash(ctx context.Context, userID, hash string) error {
	return r.q.SetPasswordHash(ctx, sqlcgen.SetPasswordHashParams{ID: userID, PasswordHash: ptr(hash)})
}

// [원본] 잠금 없이 폐기 — 같은 순간 진행 중인 갱신이 폐기 뒤에 새 토큰을 쓸 수 있었다(SRS-083 /qa code H-3).
// return r.q.RevokeAllRefreshTokensForUser(ctx, userID)
// [개선] 갱신과 같은 사용자 잠금 안에서 폐기한다.
func (r *pgRepo) RevokeAllRefreshTokens(ctx context.Context, userID string) error {
	if r.pool == nil { // 이미 잠금 트랜잭션 안
		return r.q.RevokeAllRefreshTokensForUser(ctx, userID)
	}
	return r.WithUserLock(ctx, userID, func(tx Repo) error {
		return tx.(*pgRepo).q.RevokeAllRefreshTokensForUser(ctx, userID)
	})
}

func (r *pgRepo) CreateAuthToken(ctx context.Context, hash, userID, purpose, email string, expiresAt time.Time) error {
	return r.q.CreateAuthToken(ctx, sqlcgen.CreateAuthTokenParams{
		TokenHash: hash, UserID: userID, Purpose: purpose, Email: ptr(email),
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
}

func (r *pgRepo) ConsumeAuthToken(ctx context.Context, hash, purpose string) (AuthToken, error) {
	row, err := r.q.ConsumeAuthToken(ctx, sqlcgen.ConsumeAuthTokenParams{TokenHash: hash, Purpose: purpose})
	if errors.Is(err, pgx.ErrNoRows) {
		// 없는 것·쓴 것·만료된 것을 가르지 않는다.
		return AuthToken{}, errs.New(errs.NotFound, "토큰 없음")
	}
	if err != nil {
		return AuthToken{}, err
	}
	return AuthToken{UserID: row.UserID, Email: deref(row.Email)}, nil
}

func (r *pgRepo) LastAuthTokenAt(ctx context.Context, userID, purpose string) (time.Time, error) {
	t, err := r.q.LastAuthTokenAt(ctx, sqlcgen.LastAuthTokenAtParams{UserID: userID, Purpose: purpose})
	if err != nil {
		return time.Time{}, err
	}
	return t.Time, nil
}

func (r *pgRepo) InvalidateAuthTokens(ctx context.Context, userID, purpose string) error {
	return r.q.InvalidateAuthTokens(ctx, sqlcgen.InvalidateAuthTokensParams{UserID: userID, Purpose: purpose})
}

func (r *pgRepo) GetIdentity(ctx context.Context, provider, providerUserID string) (Identity, error) {
	row, err := r.q.GetIdentity(ctx, sqlcgen.GetIdentityParams{Provider: provider, ProviderUserID: providerUserID})
	if errors.Is(err, pgx.ErrNoRows) {
		return Identity{}, errs.New(errs.NotFound, "로그인 수단 없음")
	}
	if err != nil {
		return Identity{}, err
	}
	return toIdentity(row), nil
}

func (r *pgRepo) CreateIdentity(ctx context.Context, userID, provider, providerUserID, email string) error {
	_, err := r.q.CreateIdentity(ctx, sqlcgen.CreateIdentityParams{
		ID: uuid.NewString(), UserID: userID, Provider: provider, ProviderUserID: providerUserID, Email: ptr(email),
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return errs.New(errs.Conflict, "이미 다른 계정에 연결된 로그인 수단입니다")
	}
	return err
}

func (r *pgRepo) ListIdentities(ctx context.Context, userID string) ([]Identity, error) {
	rows, err := r.q.ListIdentities(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]Identity, 0, len(rows))
	for _, row := range rows {
		out = append(out, toIdentity(row))
	}
	return out, nil
}

func (r *pgRepo) DeleteIdentity(ctx context.Context, userID, provider string) (int64, error) {
	return r.q.DeleteIdentity(ctx, sqlcgen.DeleteIdentityParams{UserID: userID, Provider: provider})
}

func toIdentity(row sqlcgen.AuthIdentity) Identity {
	return Identity{
		UserID: row.UserID, Provider: row.Provider, ProviderUserID: row.ProviderUserID,
		Email: deref(row.Email), CreatedAt: row.CreatedAt.Time,
	}
}

// NewAccountRepo — 같은 pgRepo를 AccountRepo로도 쓴다(조립 지점이 부른다).
func NewAccountRepo(r Repo) AccountRepo {
	if pr, ok := r.(*pgRepo); ok {
		return pr
	}
	return nil
}
