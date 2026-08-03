// @plm SRS-006  계정·인증 저장소 — 저장소와의 대화만 한다
//
// SQL은 database/queries/auth.sql 에 있고 Go는 생성물이다(make sqlc).
// 여기 있는 것은 **생성 타입 ↔ 도메인 타입** 변환과 **저장소 오류 → 도메인 오류** 옮기기뿐이다.
//
// null 다루기: 스키마의 nullable 컬럼은 `*string`으로 온다. 도메인은 포인터를 쓰지 않는다 —
// "없음"과 "빈 문자열"을 도메인에서 구분할 이유가 없어서, 경계인 여기서 평평하게 만든다.
package auth

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 같은 이메일로 두 번 가입한 경우가 이걸로 온다.
const pgUniqueViolation = "23505"

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool)}
}

func (r *pgRepo) CreateUser(ctx context.Context, u User) (User, error) {
	row, err := r.q.CreateUser(ctx, sqlcgen.CreateUserParams{
		ID:           u.ID,
		Email:        ptr(u.Email),
		DisplayName:  ptr(u.DisplayName),
		PasswordHash: ptr(u.PasswordHash),
		AuthProvider: u.AuthProvider,
		Role:         u.Role,
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return User{}, errs.New(errs.Conflict, "이미 가입된 이메일입니다")
	}
	if err != nil {
		return User{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) GetUserByID(ctx context.Context, id string) (User, error) {
	row, err := r.q.GetUserByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errs.New(errs.NotFound, "사용자 없음")
	}
	if err != nil {
		return User{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) GetUserByEmail(ctx context.Context, email string) (User, error) {
	row, err := r.q.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errs.New(errs.NotFound, "사용자 없음")
	}
	if err != nil {
		return User{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) UpdateProfile(ctx context.Context, id string, p ProfilePatch) (User, error) {
	row, err := r.q.UpdateUserProfile(ctx, sqlcgen.UpdateUserProfileParams{
		ID:                 id,
		SetDisplayName:     p.SetDisplayName,
		DisplayName:        p.DisplayName,
		SetAvatarUrl:       p.SetAvatarURL,
		AvatarUrl:          p.AvatarURL,
		SetExperienceLevel: p.SetExperienceLevel,
		ExperienceLevel:    p.ExperienceLevel,
		SetTrainerIntent:   p.SetTrainerIntent,
		TrainerIntent:      p.TrainerIntent,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, errs.New(errs.NotFound, "사용자 없음")
	}
	if err != nil {
		return User{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) CreateRefreshToken(ctx context.Context, hash, userID string, expiresAt time.Time) error {
	return r.q.CreateRefreshToken(ctx, sqlcgen.CreateRefreshTokenParams{
		TokenHash: hash,
		UserID:    userID,
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
}

func (r *pgRepo) GetLiveRefreshToken(ctx context.Context, hash string) (RefreshToken, error) {
	row, err := r.q.GetLiveRefreshToken(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		// 없는 것·폐기된 것·만료된 것을 구분하지 않는다 — 쿼리가 이미 살아 있는 것만 준다.
		return RefreshToken{}, errs.New(errs.NotFound, "세션 없음")
	}
	if err != nil {
		return RefreshToken{}, err
	}
	return RefreshToken{UserID: row.UserID, ExpiresAt: row.ExpiresAt.Time}, nil
}

func (r *pgRepo) RevokeRefreshToken(ctx context.Context, hash string) error {
	return r.q.RevokeRefreshToken(ctx, hash)
}

func toDomain(row sqlcgen.User) User {
	return User{
		ID:              row.ID,
		Email:           deref(row.Email),
		DisplayName:     deref(row.DisplayName),
		AvatarURL:       deref(row.AvatarUrl),
		PasswordHash:    deref(row.PasswordHash),
		AuthProvider:    row.AuthProvider,
		Role:            row.Role,
		ExperienceLevel: deref(row.ExperienceLevel),
		TrainerIntent:   row.TrainerIntent,
		CreatedAt:       row.CreatedAt.Time,
	}
}

// 빈 문자열은 null로 저장한다 — "값이 없다"를 한 가지 방식으로만 표현하기 위해서다.
func ptr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func deref(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}
