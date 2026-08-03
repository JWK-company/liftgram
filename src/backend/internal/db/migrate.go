// @plm SRS-008  one-shot 마이그레이션 러너 — idempotency 실행 보장
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **migrations/*.sql을 순서대로, 한 번씩만 적용하는 것.**
//
// 앱과 분리된 실행 단위다(runtime contract). 앱 부팅 때 마이그레이션을 돌리면
// 인스턴스가 동시에 뜰 때 같은 DDL이 겹치고, 롤백 시점도 앱 수명과 얽힌다.
// compose에서는 `migrate` 서비스가 one-shot으로 돌고 끝난 뒤에야 api가 뜬다.
//
// idempotency 보장: 적용한 파일 이름을 `_migrations` 테이블에 남긴다. 몇 번 돌려도 결과가 같다.
//
//	확인: `make migrate-check` (두 번 돌려서 2회차가 전부 skip인지 본다)
//
// 파일 하나 = 트랜잭션 하나. 도중에 실패하면 그 파일의 변경은 통째로 되돌아가고
// `_migrations`에도 기록되지 않으므로, 고친 뒤 다시 돌리면 된다.
//
// SQL 파일은 **한 번 적용된 뒤에는 고치지 않는다**(이미 적용한 환경이 따라오지 못한다).
// 새 파일을 만든다 — 파일명 순서가 곧 적용 순서다(`NNNN_설명.sql`).
//
// 같은 디렉터리를 sqlc가 스키마로 읽는다(sqlc.yaml) — schema의 source of truth이 하나로 유지된다.
// ─────────────────────────────────────────────────────────────────────────────
package db

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Migrate는 dir의 *.sql을 파일명 순서로 적용하고, 적용 건수를 돌려준다.
func Migrate(ctx context.Context, pool *pgxpool.Pool, dir string) (applied int, total int, err error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0, 0, fmt.Errorf("마이그레이션 디렉터리를 열 수 없습니다(%s): %w", dir, err)
	}
	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files) // 파일명 순서 = 적용 순서

	if _, err := pool.Exec(ctx, `CREATE TABLE IF NOT EXISTS _migrations (
		name text PRIMARY KEY,
		applied_at timestamptz NOT NULL DEFAULT now()
	)`); err != nil {
		return 0, len(files), err
	}

	rows, err := pool.Query(ctx, `SELECT name FROM _migrations`)
	if err != nil {
		return 0, len(files), err
	}
	done := map[string]bool{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return 0, len(files), err
		}
		done[n] = true
	}
	rows.Close()

	for _, f := range files {
		if done[f] {
			slog.Info("[migrate] skip", "file", f)
			continue
		}
		body, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			return applied, len(files), err
		}
		// 파일 하나 = 트랜잭션 하나.
		tx, err := pool.Begin(ctx)
		if err != nil {
			return applied, len(files), err
		}
		if _, err := tx.Exec(ctx, string(body)); err != nil {
			_ = tx.Rollback(ctx)
			return applied, len(files), fmt.Errorf("%s 적용 실패: %w", f, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO _migrations (name) VALUES ($1)`, f); err != nil {
			_ = tx.Rollback(ctx)
			return applied, len(files), err
		}
		if err := tx.Commit(ctx); err != nil {
			return applied, len(files), err
		}
		slog.Info("[migrate] apply", "file", f)
		applied++
	}
	return applied, len(files), nil
}
