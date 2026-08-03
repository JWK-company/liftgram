// @plm SRS-001  운동 카탈로그 저장소 — 저장소와의 대화만 한다
//
// 이 파일의 책임: **sqlc가 생성한 쿼리를 도메인 타입으로 옮기는 얇은 층.**
// SQL 자체는 database/queries/exercise.sql 에 있고, Go 코드는 생성물이다(make sqlc).
// 그래서 규칙이 SQL 옆에 스며들 자리가 없다 — 규칙은 service.go에만 있다.
//
// 저장소 오류를 도메인 오류로 옮기는 것도 여기 일이다. 그래야 service.go가 pgx를 모른 채
// 규칙만 남는다(CLAUDE.md의 레이어 경계).
package exercise

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// unique 위반. 이름이 이미 있는 경우가 이걸로 온다.
const pgUniqueViolation = "23505"

type pgRepo struct {
	q *sqlcgen.Queries
}

// NewRepo는 풀 하나를 받아 저장소를 만든다. 트랜잭션이 필요해지면
// sqlcgen.Queries.WithTx(tx)로 같은 인터페이스를 트랜잭션 위에서 쓴다.
func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool)}
}

func (r *pgRepo) GetByID(ctx context.Context, id string) (Exercise, error) {
	row, err := r.q.GetExerciseByID(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return Exercise{}, errs.New(errs.NotFound, "종목 '%s' 없음", id)
	}
	if err != nil {
		return Exercise{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) ListAfter(ctx context.Context, f ListFilter) ([]Summary, error) {
	rows, err := r.q.ListExercisesAfter(ctx, sqlcgen.ListExercisesAfterParams{
		Cursor:    f.Cursor,
		Q:         f.Query,
		Equipment: string(f.Equipment),
		Muscle:    string(f.Muscle),
		Lim:       f.Limit,
	})
	if err != nil {
		return nil, err
	}
	out := make([]Summary, 0, len(rows))
	for _, row := range rows {
		out = append(out, Summary{
			ID:             row.ID,
			NameKo:         row.NameKo,
			NameEn:         deref(row.NameEn),
			Equipment:      Equipment(row.Equipment),
			PrimaryMuscles: toMuscles(row.PrimaryMuscles),
			Kind:           kindOf(row.Kind),
			IsCustom:       row.IsCustom,
		})
	}
	return out, nil
}

func (r *pgRepo) PullAfter(ctx context.Context, cursor string, limit int32) ([]Exercise, error) {
	rows, err := r.q.PullCatalogAfter(ctx, sqlcgen.PullCatalogAfterParams{Cursor: cursor, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Exercise, 0, len(rows))
	for _, row := range rows {
		out = append(out, toDomain(row))
	}
	return out, nil
}

func (r *pgRepo) CreateCustom(ctx context.Context, id string, in NewCustom) (Exercise, error) {
	row, err := r.q.CreateCustomExercise(ctx, sqlcgen.CreateCustomExerciseParams{
		ID:               id,
		NameKo:           in.NameKo,
		PrimaryMuscles:   fromMuscles(in.PrimaryMuscles),
		SecondaryMuscles: fromMuscles(in.SecondaryMuscles),
		Equipment:        string(in.Equipment),
		// 레거시 계승 — 기본값은 null로 적는다(app/의 로컬 스키마와 표현을 맞춘다).
		Kind:     nullIf(string(in.Kind), string(KindStrength)),
		LoadMode: nullIf(string(in.LoadMode), string(LoadModeExternal)),
	})
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
		return Exercise{}, errs.New(errs.Conflict, "'%s' 종목이 이미 있습니다", in.NameKo)
	}
	if err != nil {
		return Exercise{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) Archive(ctx context.Context, id string) (int64, error) {
	return r.q.ArchiveCustomExercise(ctx, id)
}

func (r *pgRepo) Revision(ctx context.Context) (Revision, error) {
	row, err := r.q.GetCatalogRevision(ctx)
	if err != nil {
		return Revision{}, err
	}
	return Revision{Count: row.Count, UpdatedAt: row.UpdatedAt.Time}, nil
}

// ── 변환 ─────────────────────────────────────────────────────────────────────
// 생성물의 타입 → 도메인 타입. 이 변환이 있어서 스키마가 바뀌어도
// service.go가 sqlc 생성물의 모양에 묶이지 않는다.

func toDomain(e sqlcgen.Exercise) Exercise {
	return Exercise{
		ID:               e.ID,
		NameKo:           e.NameKo,
		NameEn:           deref(e.NameEn),
		PrimaryMuscles:   toMuscles(e.PrimaryMuscles),
		SecondaryMuscles: toMuscles(e.SecondaryMuscles),
		Equipment:        Equipment(e.Equipment),
		Kind:             kindOf(e.Kind),
		LoadMode:         loadModeOf(e.LoadMode),
		SubstituteIDs:    e.SubstituteIds,
		ImageURL:         deref(e.ImageUrl),
		IsCustom:         e.IsCustom,
		UpdatedAt:        e.UpdatedAt.Time,
	}
}

// null의 뜻을 푸는 자리 — app/이 남긴 레거시 표현(null = 기본값)을 여기서 한 번만 해석한다.
func kindOf(s *string) Kind {
	if s == nil || *s == "" {
		return KindStrength
	}
	return Kind(*s)
}

func loadModeOf(s *string) LoadMode {
	if s == nil || *s == "" {
		return LoadModeExternal
	}
	return LoadMode(*s)
}

// nullIf는 기본값이면 null로 적는다(그 반대가 kindOf·loadModeOf다).
func nullIf(v, def string) *string {
	if v == "" || v == def {
		return nil
	}
	s := strings.TrimSpace(v)
	return &s
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func toMuscles(in []string) []Muscle {
	out := make([]Muscle, 0, len(in))
	for _, m := range in {
		out = append(out, Muscle(m))
	}
	return out
}

func fromMuscles(in []Muscle) []string {
	out := make([]string, 0, len(in))
	for _, m := range in {
		out = append(out, string(m))
	}
	return out
}
