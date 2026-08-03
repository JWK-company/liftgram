// @plm SRS-039  착용장비 규칙 — 설정을 내보내고, 클릭을 눌러 담는다 (ADR-027)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것 둘:
//
//	① **무엇을 내보내도 되는가** — 완성된 딥링크만. 파트너 태그·서브아이디 같은 조립 재료는
//	   절대 나가지 않는다(앱이 링크를 만들 수 없게 하는 것이 설계 의도다 — ADR-027 D2).
//	② **같은 클릭을 두 번 담지 않는다** — 짧은 시간의 반복은 집계를 부풀리고, 제재 사유이기도 하다.
//
// ── 설정이 틀려도 서버는 뜬다 ───────────────────────────────────────────────
// 오타 하나로 부팅이 막히면 장비와 무관한 전 기능이 함께 죽는다. 어떤 이상 입력에도
// **꺼짐으로 수렴**하되, 무슨 일이 있었는지는 로그로 남긴다(무증상 실패 방지).
// ─────────────────────────────────────────────────────────────────────────────
package gear

import (
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 8종 고정. core의 GEAR_CATEGORIES와 **같은 목록**이어야 한다 —
// 한쪽에만 있는 카테고리는 링크도 라벨도 없이 화면에 뜬다.
var Categories = []string{
	"wristWrap", "strap", "belt", "kneeSleeve", "gloves", "shoes", "chalk", "armSleeve",
}

var validCategory = func() map[string]bool {
	m := make(map[string]bool, len(Categories))
	for _, c := range Categories {
		m[c] = true
	}
	return m
}()

const (
	// 같은 (사람, 글, 장비)의 반복은 이 시간 안에서는 한 번만 담는다.
	// 몇 초~몇 분의 정상 재방문은 전부 흡수하면서, 며칠에 걸친 진짜 관심은 따로 남는 균형점이다.
	dedupeWindow = 10 * time.Minute
	// 딥링크 길이 상한. 파트너스 단축 링크는 수십 자다 — 이보다 길면 오설정이거나 주입 시도다.
	maxLinkLen = 2048
)

// Config는 화면에 내려보내는 전부다.
type Config struct {
	Enabled bool
	// 카테고리 → 사전 생성된 딥링크. 서버는 이 값을 **가공하지 않는다**.
	Links map[string]string
}

type Repo interface {
	RecentClickExists(ctx context.Context, userID, postID, category string, since time.Time) (bool, error)
	CreateClick(ctx context.Context, id, userID, postID, category, source, kind string) error
}

type Service struct {
	cfg   Config
	repo  Repo
	newID func() string
	now   func() time.Time
}

func NewService(repo Repo, cfg Config, newID func() string, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{cfg: cfg, repo: repo, newID: newID, now: now}
}

// GetConfig는 매번 **복사본**을 준다 — 호출부의 실수로 내부 설정이 바뀌지 않게.
func (s *Service) GetConfig() Config {
	out := Config{Enabled: s.cfg.Enabled}
	if len(s.cfg.Links) > 0 {
		out.Links = make(map[string]string, len(s.cfg.Links))
		for k, v := range s.cfg.Links {
			out.Links[k] = v
		}
	}
	return out
}

// RecordClick은 링크를 **연 뒤에** 불린다. 그래서 막지 않는다 —
// 중복이라 담지 않았는지 여부가 화면 동작을 바꾸지 않는다.
func (s *Service) RecordClick(ctx context.Context, userID, postID, category, source, kind string) error {
	if userID == "" {
		return errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if postID == "" {
		return errs.New(errs.Validation, "게시물을 지정해 주세요")
	}
	if !validCategory[category] {
		return errs.New(errs.Validation, "알 수 없는 장비 분류입니다: %s", category)
	}
	if source != "auto" {
		source = "user"
	}
	if kind != "deeplink" {
		kind = "search"
	}

	recent, err := s.repo.RecentClickExists(ctx, userID, postID, category, s.now().Add(-dedupeWindow))
	if err != nil {
		return err
	}
	if recent {
		return nil // 시간창 안의 반복 — 조용히 넘어간다
	}
	return s.repo.CreateClick(ctx, s.newID(), userID, postID, category, source, kind)
}

// ParseConfig는 환경변수 두 개를 설정으로 옮긴다.
//
// enabled는 **"true" 정확 일치**로만 켠다. 'yes'·'1'·'TRUE'는 전부 꺼짐이다 —
// 광고 노출 스위치는 켜려는 의도가 명확할 때만 켜져야 한다(미등록 매체 노출은 제재 대상).
func ParseConfig(enabledRaw, linksRaw string) Config {
	cfg := Config{Enabled: enabledRaw == "true"}
	cfg.Links = parseLinks(linksRaw)
	if cfg.Enabled && len(cfg.Links) == 0 {
		slog.Warn("장비 제휴가 켜져 있지만 링크가 없습니다 — 전 카테고리가 검색 URL로 폴백합니다")
	}
	return cfg
}

// 카테고리→딥링크 JSON을 **8종 화이트리스트로 재구성**한다.
// 원문을 그대로 돌려주지 않는 이유: env에 섞인 임의 키(파트너 태그·메모·오타)가 화면으로 새 나가지 않게.
func parseLinks(raw string) map[string]string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil // 미설정 = 정상 상태
	}
	var bag map[string]any
	if err := json.Unmarshal([]byte(raw), &bag); err != nil {
		// 던지지 않고 꺼짐으로 수렴하되, 로그에는 반드시 남긴다.
		slog.Error("장비 제휴 링크 파싱 실패 — 링크 없이 동작합니다(검색 폴백)", "err", err)
		return nil
	}
	out := map[string]string{}
	for _, c := range Categories {
		v, ok := bag[c]
		if !ok {
			continue
		}
		url, ok := v.(string)
		if !ok {
			continue
		}
		url = strings.TrimSpace(url)
		if url == "" || len(url) > maxLinkLen {
			continue
		}
		// 값은 여기서 끝이다. 파싱·재조립·파라미터 추가 어떤 가공도 하지 않는다 —
		// 링크를 손대는 행위 자체가 제재 대상이고, 호스트 검증은 화면 쪽 도메인이 한다.
		out[c] = url
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
