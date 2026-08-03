// @plm SRS-008  api entry point — 설정 검증 · 조립 · 정상 종료
// @plm SRS-010  헬스 — 생존과 준비를 나눈다
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 이 서비스의 **composition root**이다. 인스턴스가 만들어지는 곳은 여기 하나뿐이고,
// 도메인 패키지는 자기가 무엇을 주입받았는지 모른다(인터페이스로만 안다).
//
// 새 도메인을 붙이는 순서(전부 여기 몇 줄):
//  1. repo := <도메인>.NewRepo(pool)
//  2. svc  := <도메인>.NewService(repo, bus, idem)
//  3. h    := <도메인>.NewHandler(svc, bus, cfg.InstanceID)
//  4. mux.Handle(withAPIPrefix(<도메인>v1connect.New<X>ServiceHandler(h, opts...)))
//     (make gen 이 이 네 줄을 자동으로 넣는다)
//
// ── 왜 /api 접두사를 붙이나 ─────────────────────────────────────────────────
//
//	브라우저는 web만 보고, web은 `/api/*`를 통째로 여기로 넘긴다(ADR-010).
//	Connect가 만드는 경로는 `/exercise.v1.ExerciseService/…` 이므로 그 앞에 /api를 붙여
//	프록시 규칙을 하나로 유지한다 — 프록시가 경로를 알기 시작하면 규칙이 두 곳에 생긴다.
//
// ─────────────────────────────────────────────────────────────────────────────
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"connectrpc.com/connect"
	"connectrpc.com/validate"
	"github.com/google/uuid"

	"github.com/JWK-company/liftgram/src/backend/gen/auth/v1/authv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/coaching/v1/coachingv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/dm/v1/dmv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/exercise/v1/exercisev1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/feed/v1/feedv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/feedback/v1/feedbackv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/gear/v1/gearv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/media/v1/mediav1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/meta/v1/metav1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/moderation/v1/moderationv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/notification/v1/notificationv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/story/v1/storyv1connect"
	"github.com/JWK-company/liftgram/src/backend/gen/sync/v1/syncv1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
	"github.com/JWK-company/liftgram/src/backend/internal/coaching"
	"github.com/JWK-company/liftgram/src/backend/internal/config"
	"github.com/JWK-company/liftgram/src/backend/internal/db"
	"github.com/JWK-company/liftgram/src/backend/internal/dm"
	"github.com/JWK-company/liftgram/src/backend/internal/exercise"
	"github.com/JWK-company/liftgram/src/backend/internal/feed"
	"github.com/JWK-company/liftgram/src/backend/internal/feedback"
	"github.com/JWK-company/liftgram/src/backend/internal/gear"
	"github.com/JWK-company/liftgram/src/backend/internal/idempotency"
	"github.com/JWK-company/liftgram/src/backend/internal/media"
	"github.com/JWK-company/liftgram/src/backend/internal/meta"
	"github.com/JWK-company/liftgram/src/backend/internal/middleware"
	"github.com/JWK-company/liftgram/src/backend/internal/moderation"
	"github.com/JWK-company/liftgram/src/backend/internal/notification"
	"github.com/JWK-company/liftgram/src/backend/internal/realtime"
	"github.com/JWK-company/liftgram/src/backend/internal/story"
	syncdomain "github.com/JWK-company/liftgram/src/backend/internal/sync"
)

// 헬스체크 모드 — 컨테이너 이미지에 curl·wget을 넣지 않기 위해 **서버 자신이** 확인한다.
// compose/k8s의 probe가 `server -healthcheck` 를 부르면 자기 자신에게 요청해 보고 종료 코드로 답한다.
// 검사 도구와 실제 서버가 같은 코드·같은 설정을 쓰므로 둘이 어긋날 수 없다.
var healthcheckMode = flag.Bool("healthcheck", false, "자기 자신의 /api/healthz 를 확인하고 종료 코드로 답한다")

func main() {
	flag.Parse()
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if *healthcheckMode {
		os.Exit(runHealthcheck())
	}

	// 설정이 없으면 **여기서 죽는다.** 조용히 떠서 첫 요청에 500을 내는 것이 가장 나쁜 실패 모드다.
	cfg, err := config.Load()
	if err != nil {
		slog.Error("설정 검증 실패", "err", err)
		os.Exit(1)
	}
	// 토큰 서명 키는 **이 실행 단위에만** 필요하다(마이그레이션 러너에는 없어도 된다).
	if err := cfg.RequireServerSecrets(); err != nil {
		slog.Error("설정 검증 실패", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.New(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("DB 연결 실패", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	bus, err := realtime.New(cfg.RealtimeBus, cfg.RedisURL)
	if err != nil {
		slog.Error("propagation 버스 초기화 실패", "err", err)
		os.Exit(1)
	}
	defer bus.Close()

	idem, err := idempotency.New(cfg.IdempotencyMode(), cfg.RedisURL)
	if err != nil {
		slog.Error("idempotency 저장소 초기화 실패", "err", err)
		os.Exit(1)
	}

	limiter, err := middleware.NewLimiter(cfg.RateLimitMode(), cfg.RedisURL, cfg.RateLimit, cfg.RateLimitWindowSec)
	if err != nil {
		slog.Error("rate limit 초기화 실패", "err", err)
		os.Exit(1)
	}

	// 계약(.proto)에 선언한 검증 규칙을 자동으로 적용한다 — 핸들러에 검증 코드가 없는 이유다.
	validator := validate.NewInterceptor()

	// 순서가 의미를 갖는다: 로그(바깥) → 요청제한 → 검증 → 오류변환 → 핸들러.
	// 제한을 검증보다 앞에 두는 이유 — 막을 요청에 파싱 비용을 쓰지 않는다.
	// 신원(auth)은 **검증보다 앞**이다: 핸들러가 "누구인지"를 보고 판단할 수 있어야 하고,
	// 토큰이 틀려도 여기서 막지 않으므로(로그인 없이 쓰는 화면이 많다) 비용도 거의 없다.
	authRepo := auth.NewRepo(pool)
	authSvc := auth.NewService(authRepo, auth.NewHMACSigner(cfg.JWTSecret))

	opts := connect.WithInterceptors(
		middleware.RequestLogInterceptor(),
		limiter.Interceptor(),
		auth.Interceptor(authSvc),
		validator,
		middleware.ErrorInterceptor(),
	)

	mux := http.NewServeMux()

	// ── 도메인 조립 ──
	// make gen 이 새 모듈을 **이 표식 바로 아래**에 끼워 넣는다(scripts/gen-module.mjs).
	// 표식을 지우거나 문구를 바꾸면 생성기가 조용히 조립을 빠뜨린다 — 그때는 생성기도 함께 고친다.
	// GEN-ANCHOR:domains

	// ── 운동 카탈로그 ──
	// 커스텀 종목의 id만 서버가 만든다. 시드 종목의 id는 name_en에서 파생한 결정적 값이라
	// 여기서 만들지 않는다(마이그레이션이 이미 넣어 두었다).
	exerciseRepo := exercise.NewRepo(pool)
	exerciseSvc := exercise.NewService(exerciseRepo, bus, idem, uuid.NewString)
	exerciseHandler := exercise.NewHandler(exerciseSvc, bus)
	exercisePath, exerciseHTTP := exercisev1connect.NewExerciseServiceHandler(exerciseHandler, opts)
	mount(mux, exercisePath, exerciseHTTP)

	// WebSocket — Connect가 아니라 직접 받는다(양방향은 HTTP/2 필요라 브라우저에서 못 쓴다).
	mux.Handle("/ws", exerciseHandler.WSHandler())

	// ── 계정·인증 ──
	// 서비스는 위(인터셉터)에서 이미 만들었다 — 같은 인스턴스를 핸들러도 쓴다.
	authPath, authHTTP := authv1connect.NewAuthServiceHandler(auth.NewHandler(authSvc), opts)
	mount(mux, authPath, authHTTP)

	// ── 미디어 ──
	// 저장소는 **여기서 한 번** 정해진다. 도메인은 자기가 디스크를 쓰는지 R2를 쓰는지 모른다.
	storage, err := newStorage(cfg)
	if err != nil {
		slog.Error("미디어 저장소 준비 실패", "err", err)
		os.Exit(1)
	}
	mediaRepo := media.NewRepo(pool)
	mediaSvc := media.NewService(mediaRepo, storage, media.NoopScanner{}, uuid.NewString)
	mediaHandler := media.NewHandler(mediaSvc)
	mediaPath, mediaHTTP := mediav1connect.NewMediaServiceHandler(mediaHandler, opts)
	mount(mux, mediaPath, mediaHTTP)
	// 사진 서브만은 RPC가 아니다 — `<img src>`가 그냥 GET으로 가져간다(핸들러 주석 참고).
	// /api 접두사도 함께 받는다: 브라우저는 frontend만 보고 frontend가 /api/*를 넘긴다.
	mux.Handle("/media/file/", mediaHandler.FileHandler())
	mux.Handle("/api/media/file/", http.StripPrefix("/api", mediaHandler.FileHandler()))
	slog.Info("미디어 저장소", "provider", storage.Name())

	// 글·스토리가 함께 쓰는 판정 — "이 사진 주소를 실어도 되는가".
	ownership := media.NewOwnership(mediaRepo)

	// ── 알림 ──
	// 피드가 이걸 받아 좋아요·댓글·팔로우 때 곁들여 쌓는다(실패해도 본 동작은 성공한다).
	notificationSvc := notification.NewService(notification.NewRepo(pool), uuid.NewString)
	notificationPath, notificationHTTP := notificationv1connect.NewNotificationServiceHandler(notification.NewHandler(notificationSvc), opts)
	mount(mux, notificationPath, notificationHTTP)

	// ── 피드 ──
	feedSvc := feed.NewService(feed.NewRepo(pool), ownership, notifyAdapter{notificationSvc}, uuid.NewString)
	feedPath, feedHTTP := feedv1connect.NewFeedServiceHandler(feed.NewHandler(feedSvc), opts)
	mount(mux, feedPath, feedHTTP)

	// ── 다이렉트 메시지 ──
	// 실시간은 전파 버스를 탄다 — 이름만 나가고 받는 쪽이 DB를 다시 읽는다.
	dmSvc := dm.NewService(dm.NewRepo(pool), ownership, bus, uuid.NewString)
	dmPath, dmHTTP := dmv1connect.NewDmServiceHandler(dm.NewHandler(dmSvc, bus), opts)
	mount(mux, dmPath, dmHTTP)

	// ── 착용장비 ──
	// 제휴 설정은 **환경변수에만** 있다. 기본은 꺼짐이고, 어떤 이상 입력에도 꺼짐으로 수렴한다.
	gearSvc := gear.NewService(gear.NewRepo(pool), gear.ParseConfig(cfg.GearAffiliateEnabled, cfg.GearAffiliateLinks), uuid.NewString, time.Now)
	gearPath, gearHTTP := gearv1connect.NewGearServiceHandler(gear.NewHandler(gearSvc), opts)
	mount(mux, gearPath, gearHTTP)

	// 코칭(SRS-048) — 사람이 사람을 가르친다. 회원 기록은 **동기 저장소를 그 자리에서** 읽는다
	// (복사해 두면 해지한 뒤에도 남는다).
	coachingSvc := coaching.NewService(coaching.NewRepo(pool), uuid.NewString, time.Now)
	coachingPath, coachingHTTP := coachingv1connect.NewCoachingServiceHandler(coaching.NewHandler(coachingSvc), opts)
	mount(mux, coachingPath, coachingHTTP)

	// 오프라인 동기(SRS-006) — 기기의 로컬 DB와 서버를 맞춘다. 레코드의 속은 해석하지 않는다.
	syncSvc := syncdomain.NewService(syncdomain.NewRepo(pool, uuid.NewString), uuid.NewString)
	syncPath, syncHTTP := syncv1connect.NewSyncServiceHandler(syncdomain.NewHandler(syncSvc), opts)
	mount(mux, syncPath, syncHTTP)

	// 개발 피드백(SRS-006) — 내부 사람 전용. 저장소를 새로 만들지 않고 PLM 아이디어보드에 얹는다.
	feedbackSvc := feedback.NewService(
		feedback.NewHTTPBoard(cfg.PLMAPIURL, cfg.PLMAPIToken, cfg.PLMProject),
		feedback.NewRepo(pool),
	)
	feedbackPath, feedbackHTTP := feedbackv1connect.NewFeedbackServiceHandler(feedback.NewHandler(feedbackSvc), opts)
	mount(mux, feedbackPath, feedbackHTTP)

	// ── 신고·모더레이션 ──
	// 신고는 누구나, 검토는 역할이 있는 사람만 — 그 판정은 service가 한다(handler는 신원만 넘긴다).
	moderationSvc := moderation.NewService(moderation.NewRepo(pool), uuid.NewString)
	moderationPath, moderationHTTP := moderationv1connect.NewModerationServiceHandler(moderation.NewHandler(moderationSvc), opts)
	mount(mux, moderationPath, moderationHTTP)

	// ── 스토리 ──
	// 24시간 뒤 안 보인다. 시계는 주입한다(테스트가 시간을 움직일 수 있게).
	storySvc := story.NewService(story.NewRepo(pool), ownership, uuid.NewString, time.Now)
	storyPath, storyHTTP := storyv1connect.NewStoryServiceHandler(story.NewHandler(storySvc), opts)
	mount(mux, storyPath, storyHTTP)

	// ── 운영 메타 ──
	// 도메인이 아니라 실행 환경의 사실이라 따로 둔다(도메인을 걷어내도 운영 화면이 남는다).
	metaPath, metaHTTP := metav1connect.NewMetaServiceHandler(meta.NewHandler(bus, cfg.InstanceID), opts)
	mount(mux, metaPath, metaHTTP)

	// ── 헬스 ──
	// healthz: 프로세스가 살아 있는가 → 실패하면 오케스트레이터가 **재시작**한다.
	// readyz : 지금 트래픽을 받아도 되는가 → 실패하면 **트래픽만 끊고** 재시작하지 않는다.
	// DB가 잠깐 흔들릴 때 재시작을 반복하면 상황이 더 나빠지므로 DB 확인은 readyz에만 둔다.
	started := time.Now()
	mux.HandleFunc("/api/healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "uptime": time.Since(started).Seconds()})
	})
	mux.HandleFunc("/api/readyz", func(w http.ResponseWriter, r *http.Request) {
		pingCtx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()
		if err := pool.Ping(pingCtx); err != nil {
			// 준비되지 않음은 **오류가 아니라 상태다** — 오케스트레이터가 읽을 모양을 그대로 준다.
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"status": "degraded", "db": "down", "detail": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "ready", "db": "up"})
	})

	srv := &http.Server{
		Addr:              ":" + strconv.Itoa(cfg.APIPort),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		// WriteTimeout을 두지 않는다 — 서버 스트리밍·WebSocket이 오래 열려 있어야 하기 때문이다.
		// 유휴 연결은 각 채널의 하트비트·ping이 관리한다.
	}

	go func() {
		slog.Info("api listening", "port", cfg.APIPort, "bus", bus.Kind(), "instance", cfg.InstanceID)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("bootstrap 실패", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	// 정상 종료 — 처리 중인 요청을 끝낼 시간을 주되, 정해진 시간을 넘기면 강제로 닫는다.
	slog.Info("shutdown 시작")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), time.Duration(cfg.ShutdownTimeoutSec)*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Warn("shutdown 타임아웃 — 강제 종료", "err", err)
	}
	slog.Info("shutdown 완료")
}

// mount는 Connect가 준 경로 앞에 /api를 붙여 등록한다(위 주석의 이유).
// notifyAdapter는 notification.Service를 feed가 아는 좁은 포트에 맞춘다.
//
// feed는 알림 패키지를 모른다(문자열 kind만 안다) — 그래야 알림을 걷어내도 피드가 컴파일된다.
type notifyAdapter struct{ svc *notification.Service }

func (a notifyAdapter) Notify(ctx context.Context, userID, actorID, kind, postID string) {
	a.svc.Notify(ctx, userID, actorID, notification.Kind(kind), postID)
}

// newStorage는 설정이 고른 저장소를 만든다.
//
// s3를 골랐는데 설정이 비어 있으면 **부팅을 멈춘다** — 조용히 디스크로 되돌아가면
// 재배포마다 사진이 사라지는 것을 아무도 모른 채 운영된다.
func newStorage(cfg *config.Config) (media.Storage, error) {
	if cfg.StorageProvider == "s3" {
		return media.NewS3Storage(media.S3Config{
			Endpoint:  cfg.S3Endpoint,
			Bucket:    cfg.S3Bucket,
			Region:    cfg.S3Region,
			AccessKey: cfg.S3AccessKey,
			SecretKey: cfg.S3SecretKey,
		})
	}
	return media.NewDiskStorage(cfg.MediaDir)
}

func mount(mux *http.ServeMux, path string, h http.Handler) {
	full := "/api" + path
	mux.Handle(full, http.StripPrefix("/api", h))
	// 접두사 없는 경로도 함께 받는다 — gRPC 클라이언트나 내부 호출은 프록시를 거치지 않는다.
	mux.Handle(path, h)
}

// runHealthcheck는 자기 포트로 한 번 요청해 본다. 0=정상, 1=비정상.
func runHealthcheck() int {
	cfg, err := config.Load()
	if err != nil {
		return 1
	}
	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get("http://127.0.0.1:" + strconv.Itoa(cfg.APIPort) + "/api/healthz")
	if err != nil {
		return 1
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
