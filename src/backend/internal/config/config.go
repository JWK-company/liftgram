// @plm SRS-008  필수 설정 누락은 부팅 실패로 즉시 드러난다.
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **설정을 읽고 검증하는 단 한 곳.**
//
// os.Getenv를 직접 부르는 코드는 여기 말고 없어야 한다. 그래야
//
//	· 어떤 설정이 필요한지가 이 구조체 하나로 다 드러나고
//	· 오타·누락이 **부팅 시점에** 잡힌다(첫 요청까지 미뤄지지 않는다)
//	· 문자열이 숫자로 바뀌는 변환이 한 곳에만 있다.
//
// ── 설정을 추가하는 법 ──────────────────────────────────────────────────────
//  1. 아래 Config에 필드 하나 + Load()에 읽는 줄 하나
//  2. .env.example에 설명과 함께 추가 — 이게 곧 문서다
//  3. 컨테이너에 필요하면 compose.yaml의 environment에도 추가
//     `make env-check` 가 이 세 곳을 대조해 빠진 것을 잡는다.
//
// ─────────────────────────────────────────────────────────────────────────────
package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	// [필수] 없으면 부팅하지 않는다.
	DatabaseURL string

	// api가 듣는 포트(내부 전용). web은 API_URL로 여기에 붙는다.
	APIPort int

	// memory | redis — 인스턴스가 하나면 memory로 충분하고, 여럿이면 redis가 이어 준다.
	RealtimeBus string
	RedisURL    string

	// idempotency key 저장소. 비우면 RealtimeBus를 따라간다(둘 다 "인스턴스가 여럿인가"를 뜻한다).
	IdempotencyStore string

	// rate limit — 0 이하면 비활성(개발 편의). 저장소는 지정 없으면 RealtimeBus를 따른다.
	RateLimit          int
	RateLimitWindowSec int
	RateLimitStore     string

	ShutdownTimeoutSec int

	// 화면에 표시할 인스턴스 식별자. 비면 호스트명을 쓴다.
	InstanceID string

	// [필수] access 토큰 서명 키. 없으면 부팅하지 않는다 —
	// 기본값을 두면 그 값이 그대로 배포되어 **누구나 토큰을 위조할 수 있다**.
	JWTSecret string

	// ── 미디어 저장소 ──
	// "disk"(기본) 또는 "s3". disk는 재배포에서 사라지는 호스트가 많다 — 사진을 오래 남기려면 s3.
	StorageProvider string
	MediaDir        string
	S3Endpoint      string
	S3Bucket        string
	S3Region        string
	S3AccessKey     string
	S3SecretKey     string

	// ── 착용장비 제휴(ADR-027) ──
	// **기본은 꺼짐이다.** 켜는 것은 "true" 정확 일치일 때만 — 미등록 매체에 광고를 노출하면 제재 대상이라
	// 오타로 켜지는 일이 없어야 한다. 링크는 카테고리→딥링크 JSON 문자열이며 사람이 사전 생성한 것만 넣는다.
	GearAffiliateEnabled string
	GearAffiliateLinks   string

	// ── 개발 피드백 → 아이디어보드(SRS-006) ──
	// 토큰이 없으면 그 탭만 "지금 안 된다"고 답한다 — 부팅은 막지 않는다.
	// **토큰은 서버에만 있다**(앱 번들에 들어가면 회수할 방법이 없다).
	PLMAPIURL   string
	PLMAPIToken string
	PLMProject  string

	// 마이그레이션 SQL이 있는 디렉터리.
	// 실행 위치가 두 가지라 기본값을 찾아서 정한다(아래 defaultMigrationsDir):
	//   컨테이너 → /app/migrations · 로컬(backend에서 go run) → ../database/migrations
	// MIGRATIONS_DIR로 덮어쓸 수 있다.
	MigrationsDir string
}

// Load는 .env(있으면)와 환경변수를 읽어 검증한다. 누락이면 error를 돌려주고,
// entry point(main·migrate)이 그것을 받아 즉시 종료한다 — 조용히 뜨는 일이 없다.
func Load() (*Config, error) {
	loadDotenv()

	c := &Config{
		DatabaseURL:          os.Getenv("DATABASE_URL"),
		APIPort:              envInt("API_PORT", 3001),
		RealtimeBus:          envStr("REALTIME_BUS", "memory"),
		RedisURL:             envStr("REDIS_URL", "redis://localhost:6379"),
		IdempotencyStore:     os.Getenv("IDEMPOTENCY_STORE"),
		RateLimit:            envInt("RATE_LIMIT", 120),
		RateLimitWindowSec:   envInt("RATE_LIMIT_WINDOW_SEC", 60),
		RateLimitStore:       os.Getenv("RATE_LIMIT_STORE"),
		ShutdownTimeoutSec:   envInt("SHUTDOWN_TIMEOUT_MS", 10000) / 1000,
		InstanceID:           os.Getenv("INSTANCE_ID"),
		JWTSecret:            os.Getenv("JWT_SECRET"),
		MigrationsDir:        envStr("MIGRATIONS_DIR", defaultMigrationsDir()),
		GearAffiliateEnabled: os.Getenv("GEAR_AFFILIATE_ENABLED"),
		GearAffiliateLinks:   os.Getenv("GEAR_AFFILIATE_LINKS"),

		PLMAPIURL:       envStr("PLM_API_URL", "https://jwk-plm.shoi.ch"),
		PLMAPIToken:     os.Getenv("PLM_API_TOKEN"),
		PLMProject:      envStr("PLM_PROJECT", "liftgram"),
		StorageProvider: strings.ToLower(envStr("STORAGE_PROVIDER", "disk")),
		MediaDir:        envStr("MEDIA_DIR", defaultMediaDir()),
		S3Endpoint:      os.Getenv("S3_ENDPOINT"),
		S3Bucket:        os.Getenv("S3_BUCKET"),
		S3Region:        envStr("S3_REGION", "auto"),
		S3AccessKey:     os.Getenv("S3_ACCESS_KEY_ID"),
		S3SecretKey:     os.Getenv("S3_SECRET_ACCESS_KEY"),
	}

	var missing []string
	if c.DatabaseURL == "" {
		missing = append(missing, "DATABASE_URL")
	}
	// 오타가 조용히 disk로 떨어지면 사진이 사라지는 것을 아무도 모른다 — 부팅에서 막는다.
	if c.StorageProvider != "disk" && c.StorageProvider != "s3" {
		return nil, fmt.Errorf("[env] STORAGE_PROVIDER는 disk 또는 s3여야 합니다 (받은 값: %q)", c.StorageProvider)
	}
	if c.RealtimeBus != "memory" && c.RealtimeBus != "redis" {
		return nil, fmt.Errorf("[env] REALTIME_BUS는 memory 또는 redis여야 합니다 (받은 값: %q)", c.RealtimeBus)
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("[env] 설정 검증 실패 — 누락: %s", strings.Join(missing, ", "))
	}
	if c.InstanceID == "" {
		if h, err := os.Hostname(); err == nil {
			c.InstanceID = h
		}
	}
	return c, nil
}

// RequireServerSecrets는 **API 서버에만** 필요한 비밀을 검사한다.
//
// Load()에 넣지 않는 이유: 마이그레이션 러너도 같은 Config를 읽는데, 스키마를 적용하는 데
// 토큰 서명 키가 필요할 리 없다. 거기서 막히면 "설정이 틀렸다"가 아니라 **틀린 곳에서 막히는**
// 가짜 실패가 된다(실제로 한 번 밟았다). 그래서 요구는 그것이 진짜 필요한 단위가 한다.
func (c *Config) RequireServerSecrets() error {
	if c.JWTSecret == "" {
		return fmt.Errorf("[env] 설정 검증 실패 — 누락: JWT_SECRET")
	}
	// 짧은 키는 무차별 대입으로 뚫린다. HS256의 권장 최소는 키가 해시 출력만큼(32바이트)이다.
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("[env] JWT_SECRET은 32자 이상이어야 합니다 (받은 길이: %d)", len(c.JWTSecret))
	}
	return nil
}

// idempotency 저장소·rate limit 저장소는 지정이 없으면 propagation 버스를 따라간다 —
// 셋 다 "인스턴스가 하나인가 여럿인가"라는 같은 질문에 답하기 때문이다.
func (c *Config) IdempotencyMode() string { return orElse(c.IdempotencyStore, c.RealtimeBus) }
func (c *Config) RateLimitMode() string   { return orElse(c.RateLimitStore, c.RealtimeBus) }

func orElse(v, fallback string) string {
	if v != "" {
		return v
	}
	return fallback
}

// defaultMigrationsDir는 마이그레이션 SQL을 **실행 위치에 따라** 찾는다.
//
// 마이그레이션은 database/ 가 소유하지만(사람이 읽고 쓰는 자산), 러너는 두 곳에서 돈다:
//
//	컨테이너: /app 에서 실행 → /app/migrations (이미지가 그 자리에 복사한다)
//	로컬:     backend/ 에서 go run → ../database/migrations
//	저장소 루트에서 실행하는 경우도 받아 준다.
//
// 못 찾으면 "migrations"를 돌려준다 — 러너가 "그 디렉터리가 없다"고 정확히 말하게 두는 편이
// 조용히 0건 적용하고 성공하는 것보다 낫다.
func defaultMigrationsDir() string {
	for _, c := range []string{"migrations", filepath.Join("..", "database", "migrations"), filepath.Join("database", "migrations")} {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c
		}
	}
	return "migrations"
}

// 사진을 어디에 둘지 — 컨테이너는 /app/media(볼륨), 로컬은 backend 밖의 .media/.
// 실행 위치에 따라 저장 폴더가 갈리면 "방금 올린 사진이 안 보이는" 일이 생긴다.
func defaultMediaDir() string {
	if st, err := os.Stat("/app"); err == nil && st.IsDir() {
		return "/app/media"
	}
	return filepath.Join("..", ".media")
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

// loadDotenv는 .env를 찾아 읽는다 — 다만 **이미 설정된 값은 덮지 않는다**.
// 우선순위: 실제 환경변수 > .env 파일 > 기본값.
//
// 위로 거슬러 올라가며 찾는 이유: 모노레포에서 설정 파일은 저장소 루트에 하나뿐인데
// 실행 위치는 워크스페이스 안(backend)이다. 못 찾아도 조용히 넘어간다 —
// 컨테이너·CI에는 .env가 없고 환경변수만 오기 때문이다(누락은 위 검증이 잡는다).
func loadDotenv() {
	dir, err := os.Getwd()
	if err != nil {
		return
	}
	for i := 0; i < 4; i++ {
		f, err := os.Open(filepath.Join(dir, ".env"))
		if err == nil {
			defer f.Close()
			sc := bufio.NewScanner(f)
			for sc.Scan() {
				line := strings.TrimSpace(sc.Text())
				if line == "" || strings.HasPrefix(line, "#") {
					continue
				}
				eq := strings.Index(line, "=")
				if eq < 1 {
					continue
				}
				key := strings.TrimSpace(line[:eq])
				if _, ok := os.LookupEnv(key); ok {
					continue // 이미 설정된 값이 이긴다
				}
				val := strings.TrimSpace(line[eq+1:])
				// 따옴표로 감싼 값은 벗긴다(공백이 들어간 값을 적을 수 있게).
				if len(val) >= 2 && (val[0] == '"' || val[0] == '\'') && val[len(val)-1] == val[0] {
					val = val[1 : len(val)-1]
				}
				os.Setenv(key, val)
			}
			return
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return
		}
		dir = parent
	}
}
