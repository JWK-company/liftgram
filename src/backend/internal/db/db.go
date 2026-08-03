// @plm SRS-008  DB 연결 — 프로세스당 하나의 풀 (첫 사용 시점에 만든다)
//
// 풀을 프로세스당 하나만 두는 이유: 핸들러마다 연결을 만들면 요청 수만큼 커넥션이 늘어
// DB의 max_connections를 금세 넘긴다. pgxpool이 재사용·수명·헬스체크를 대신한다.
package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// New는 풀을 만들고 **연결을 실제로 한 번 확인한다**.
// 부팅 시점에 확인하지 않으면 첫 요청에서야 설정 오류를 알게 된다.
func New(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL 해석 실패: %w", err)
	}
	// 기본값은 보수적으로. 부하 실측 전에는 크게 잡을 이유가 없다.
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("DB 연결 확인 실패: %w", err)
	}
	return pool, nil
}
