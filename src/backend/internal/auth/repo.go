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
	// pool 은 트랜잭션을 여는 데만 쓴다. 트랜잭션 안의 pgRepo(WithUserLock 이 넘기는 것)는 nil 이다.
	pool *pgxpool.Pool
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool), pool: pool}
}

// @plm SRS-083  WithUserLock — 한 사용자의 세션 결정(갱신·로그아웃·전체 폐기)을 한 트랜잭션·한 줄로 세운다(/qa code H-3).
//
// 트랜잭션 첫 문장이 사용자 단위 advisory 잠금이다. 그래서 「갱신이 살아 있는 토큰을 읽은 뒤, 전체 폐기가 끼어들고,
// 갱신이 새 토큰을 쓴다」는 순서가 생길 수 없다. fn 이 오류를 내면 되돌린다.
func (r *pgRepo) WithUserLock(ctx context.Context, userID string, fn func(Repo) error) error {
	if r.pool == nil {
		return errors.New("auth: 이미 트랜잭션 안이다(WithUserLock 중첩)")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }() // 커밋 뒤에는 아무 일도 하지 않는다
	inner := &pgRepo{q: sqlcgen.New(tx)}
	if err := inner.q.LockUserSessions(ctx, userID); err != nil {
		return err
	}
	if err := fn(inner); err != nil {
		return err
	}
	return tx.Commit(ctx)
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

func (r *pgRepo) CreateRefreshToken(ctx context.Context, hash, userID, familyID, parentHash string, expiresAt time.Time) error {
	var parent *string
	if parentHash != "" {
		parent = &parentHash
	}
	return r.q.CreateRefreshToken(ctx, sqlcgen.CreateRefreshTokenParams{
		TokenHash:  hash,
		UserID:     userID,
		ExpiresAt:  pgtype.Timestamptz{Time: expiresAt, Valid: true},
		FamilyID:   &familyID,
		ParentHash: parent,
	})
}

// LiveRefreshInFamily — 계열의 살아 있는 토큰(0019 · SRS-083). 없으면 found=false.
func (r *pgRepo) LiveRefreshInFamily(ctx context.Context, familyID string) (RefreshToken, bool, error) {
	row, err := r.q.LiveRefreshInFamily(ctx, &familyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return RefreshToken{}, false, nil
	}
	if err != nil {
		return RefreshToken{}, false, err
	}
	return refreshFromRow(row), true, nil
}

func (r *pgRepo) SupersedeRefreshToken(ctx context.Context, hash string, at time.Time) error {
	return r.q.SupersedeRefreshToken(ctx, sqlcgen.SupersedeRefreshTokenParams{
		At:        pgtype.Timestamptz{Time: at, Valid: true},
		TokenHash: hash,
	})
}

func refreshFromRow(row sqlcgen.RefreshToken) RefreshToken {
	rt := RefreshToken{
		TokenHash: row.TokenHash, UserID: row.UserID, ExpiresAt: row.ExpiresAt.Time,
		FamilyID: deref(row.FamilyID), RevokeReason: deref(row.RevokeReason), ParentHash: deref(row.ParentHash),
	}
	if row.RevokedAt.Valid {
		at := row.RevokedAt.Time
		rt.RevokedAt = &at
	}
	return rt
}

// GetRefreshToken — 만료되지 않았으면 폐기됐어도 돌려준다(SRS-083).
func (r *pgRepo) GetRefreshToken(ctx context.Context, hash string) (RefreshToken, error) {
	row, err := r.q.GetRefreshToken(ctx, hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return RefreshToken{}, errs.New(errs.NotFound, "세션 없음")
	}
	if err != nil {
		return RefreshToken{}, err
	}
	return refreshFromRow(row), nil
}

func (r *pgRepo) RotateRefreshToken(ctx context.Context, hash string, at time.Time) (bool, error) {
	n, err := r.q.RotateRefreshToken(ctx, sqlcgen.RotateRefreshTokenParams{
		At:        pgtype.Timestamptz{Time: at, Valid: true},
		TokenHash: hash,
	})
	return n == 1, err
}

func (r *pgRepo) LatestRotationAt(ctx context.Context, familyID string) (time.Time, error) {
	t, err := r.q.LatestRotationAt(ctx, &familyID)
	if err != nil {
		return time.Time{}, err
	}
	return t.Time, nil
}

func (r *pgRepo) RevokeRefreshFamily(ctx context.Context, familyID, reason string, at time.Time) error {
	return r.q.RevokeRefreshFamily(ctx, sqlcgen.RevokeRefreshFamilyParams{
		At:       pgtype.Timestamptz{Time: at, Valid: true},
		Reason:   reason,
		FamilyID: &familyID,
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
		EmailVerified:   row.EmailVerifiedAt.Valid,
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
