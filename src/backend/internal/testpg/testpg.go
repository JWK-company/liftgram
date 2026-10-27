// Package testpg는 실제 Postgres 통합 테스트의 공용 입구다.
//
// 설정은 config 한 곳에서만 읽는다(check-docs ⑤) — 테스트가 os.Getenv 를 직접 부르지 않고 여기를 거친다.
// LIFTGRAM_TEST_DATABASE_URL 이 비어 있으면 테스트를 건너뛴다(가짜 저장소 테스트만 돈다).
// 가리키는 DB 는 마이그레이션이 끝난 **빈 스크래치 DB**여야 한다 — 테스트가 행을 만들고 지운다. 운영·개발 DB 금지.
//
// 테스트 코드만 import 한다(서버 바이너리는 이 패키지를 쓰지 않는다).
package testpg

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/config"
)

// Pool은 스크래치 DB 연결 풀을 돌려준다. 주소가 없으면 t.Skip — 테스트가 끝나면 풀을 닫는다.
func Pool(t testing.TB) *pgxpool.Pool {
	t.Helper()
	url := config.IntegrationDatabaseURL()
	if url == "" {
		t.Skip("LIFTGRAM_TEST_DATABASE_URL 없음 — 실제 Postgres 테스트는 건너뜀")
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
