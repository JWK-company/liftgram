// @plm SRS-019  스토리 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것:
//
//	· 스토리는 **24시간** 산다. 만료는 지우는 것이 아니라 **안 보이는 것**이다.
//	· 사진 주소는 **내가 올린 우리 사진**이어야 한다(남의 서버 그림·남의 사진 금지).
//	· 자동 스캔에 걸린 사진은 올라가되 **보이지 않는다**(pending) — 거절이 아니라 보류다.
//	· 트레이의 첫 칸은 언제나 나다 — **내 그룹을 맨 앞으로** 올린다.
//
// 누가 봤는지는 여기서 다루지 않는다. 그건 기기에 남는다(계약 주석 참고).
// ─────────────────────────────────────────────────────────────────────────────
package story

import (
	"context"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// TTL은 app·옛 서버와 같은 24시간이다. 이 값이 바뀌면 두 구현이 다른 스토리를 보여 준다.
const TTL = 24 * time.Hour

type Author struct {
	ID          string
	DisplayName string
	AvatarURL   string
}

type Story struct {
	ID        string
	AuthorID  string
	MediaURL  string
	Caption   string
	CreatedAt time.Time
	ExpiresAt time.Time
}

type Group struct {
	Author  Author
	Stories []Story
}

type Repo interface {
	// status는 approved 또는 pending. 저장소는 그 값을 그대로 넣는다(판단은 여기서 끝났다).
	Create(ctx context.Context, s Story, status string) (Story, error)
	// 살아 있는 것만, (사람, 오래된 것 먼저) 순서로.
	ListActive(ctx context.Context, viewerID string) ([]Story, map[string]Author, error)
}

// MediaChecker는 media 패키지가 채워 준다. 이 도메인은 사진이 어디 저장되는지 모른다.
type MediaChecker interface {
	// 이 사람이 올린 우리 사진인가. flagged면 보류로 들어간다.
	CheckOwned(ctx context.Context, url, ownerID string) (flagged bool, err error)
}

type Service struct {
	repo  Repo
	media MediaChecker
	newID func() string
	// 시계를 주입받는다 — 만료를 테스트하려면 시간을 움직일 수 있어야 한다.
	now func() time.Time
}

func NewService(repo Repo, checker MediaChecker, newID func() string, now func() time.Time) *Service {
	if now == nil {
		now = time.Now
	}
	return &Service{repo: repo, media: checker, newID: newID, now: now}
}

// Create는 스토리를 만들고, **아직 보이지 않는지**(pending)를 함께 알려 준다.
func (s *Service) Create(ctx context.Context, authorID, mediaURL, caption string) (Story, bool, error) {
	if authorID == "" {
		return Story{}, false, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	mediaURL = strings.TrimSpace(mediaURL)
	if mediaURL == "" {
		return Story{}, false, errs.New(errs.Validation, "사진을 올려 주세요")
	}
	flagged, err := s.media.CheckOwned(ctx, mediaURL, authorID)
	if err != nil {
		return Story{}, false, err
	}

	status := "approved"
	if flagged {
		// 거절하지 않는다 — 사람이 확인할 때까지 안 보일 뿐이다(ADR-017).
		status = "pending"
	}
	now := s.now()
	created, err := s.repo.Create(ctx, Story{
		ID:        s.newID(),
		AuthorID:  authorID,
		MediaURL:  mediaURL,
		Caption:   strings.TrimSpace(caption),
		CreatedAt: now,
		ExpiresAt: now.Add(TTL),
	}, status)
	if err != nil {
		return Story{}, false, err
	}
	return created, flagged, nil
}

// ListActive는 트레이가 그릴 그룹들을 준다. **내 그룹이 맨 앞**이고, 나머지는 최신 컷이 새로운 순서다.
func (s *Service) ListActive(ctx context.Context, viewerID string) ([]Group, error) {
	if viewerID == "" {
		return nil, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	stories, authors, err := s.repo.ListActive(ctx, viewerID)
	if err != nil {
		return nil, err
	}

	// 사람별로 묶는다. 저장소가 (사람, 오래된 것 먼저)로 주므로 그룹 안 순서는 그대로 쓴다.
	byAuthor := map[string]*Group{}
	order := []string{}
	for _, st := range stories {
		g, ok := byAuthor[st.AuthorID]
		if !ok {
			g = &Group{Author: authors[st.AuthorID]}
			byAuthor[st.AuthorID] = g
			order = append(order, st.AuthorID)
		}
		g.Stories = append(g.Stories, st)
	}

	out := make([]Group, 0, len(order))
	for _, id := range order {
		out = append(out, *byAuthor[id])
	}
	// 새 컷이 있는 사람이 앞으로 — 트레이는 왼쪽부터 본다.
	sortByNewest(out)
	// 그리고 나는 언제나 첫 칸이다.
	for i := range out {
		if out[i].Author.ID == viewerID {
			me := out[i]
			copy(out[1:i+1], out[0:i])
			out[0] = me
			break
		}
	}
	return out, nil
}

func sortByNewest(groups []Group) {
	// 그룹 수가 많아야 수십이다 — 단순 삽입 정렬이면 충분하고, 같은 시각의 순서가 흔들리지 않는다.
	for i := 1; i < len(groups); i++ {
		for j := i; j > 0 && newest(groups[j]).After(newest(groups[j-1])); j-- {
			groups[j], groups[j-1] = groups[j-1], groups[j]
		}
	}
}

func newest(g Group) time.Time {
	if len(g.Stories) == 0 {
		return time.Time{}
	}
	// 그룹 안은 오래된 것이 먼저라 마지막이 최신이다.
	return g.Stories[len(g.Stories)-1].CreatedAt
}
