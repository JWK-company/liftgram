// @plm SRS-008  마이그레이션 entry point — 앱 부팅과 분리된 실행 단위
//
// compose의 migrate 서비스가 이 바이너리를 one-shot으로 돌리고, 정상 종료(0)한 뒤에야 api가 뜬다.
// 실패는 조용히 넘기지 않는다 — 종료 코드가 앱 기동을 막는다.
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/JWK-company/liftgram/src/backend/internal/config"
	"github.com/JWK-company/liftgram/src/backend/internal/db"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("설정 검증 실패", "err", err)
		os.Exit(1)
	}
	ctx := context.Background()
	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("DB 연결 실패", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	// 설정은 config 한 곳에서만 읽는다 — entry point이 os.Getenv를 직접 부르지 않는다.
	applied, total, err := db.Migrate(ctx, pool, cfg.MigrationsDir)
	if err != nil {
		slog.Error("마이그레이션 실패", "err", err)
		os.Exit(1)
	}
	slog.Info("[migrate] 완료", "applied", applied, "total", total)
}
