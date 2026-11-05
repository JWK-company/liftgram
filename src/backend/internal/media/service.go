// @plm SRS-019  미디어 규칙 — 무엇을 받고, 무엇을 서브하는가
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것:
//
//	· 받는 형식은 **사진 넷**뿐이다(jpeg·png·webp·gif). 그 밖은 거절한다.
//	· 선언한 형식과 **실제 바이트가 다르면** 거절한다 — content type은 보내는 쪽이 부르는 이름일 뿐이다.
//	· 내려간(flagged) 파일은 **바이트도 서브하지 않는다.** "내려갔다"가 참이려면 파일도 안 보여야 한다.
//	· 없는 파일은 오류가 아니라 **없음**이다(404).
//
// 스캐너는 기본이 noop다(항상 통과). 실제 스캐너를 끼우면 위반 파일이 flagged로 들어오고,
// 그 뒤로는 이 파일의 규칙이 알아서 가린다 — 서브 경로를 다시 손댈 일이 없다(ADR-017).
// ─────────────────────────────────────────────────────────────────────────────
package media

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

var allowed = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/webp": true,
	"image/gif":  true,
}

type Asset struct {
	ID          string
	OwnerID     string
	Key         string
	URL         string
	ContentType string
	Kind        string
	Bytes       int64
	Flagged     bool
	// 검사기가 답하지 못해 나중에 다시 볼 사진.
	ScanPending bool
	CreatedAt   time.Time
}

type Repo interface {
	Create(ctx context.Context, a Asset) (Asset, error)
	GetByKey(ctx context.Context, key string) (Asset, error)
	ListScanPending(ctx context.Context, limit int32) ([]Asset, error)
	BumpScanAttempts(ctx context.Context, id string) error
	ApplyRescan(ctx context.Context, a Asset, flagged bool) error
}

// ScanResult는 자동 스캔의 답이다. 기본 스캐너는 항상 통과시킨다.
type ScanResult struct {
	Flagged bool
	Reason  string
}

type Scanner interface {
	Scan(ctx context.Context, data []byte, contentType string) (ScanResult, error)
}

// NoopScanner — 아무것도 걸러내지 않는다. 자리를 비워 두면 나중에 스캐너를 끼울 곳이
// 서비스 안으로 흩어진다(옛 서버도 같은 이유로 noop 구현을 뒀다).
type NoopScanner struct{}

func (NoopScanner) Scan(context.Context, []byte, string) (ScanResult, error) {
	return ScanResult{}, nil
}

type Service struct {
	repo    Repo
	storage Storage
	scanner Scanner
	newID   func() string
}

func NewService(repo Repo, storage Storage, scanner Scanner, newID func() string) *Service {
	if scanner == nil {
		scanner = NoopScanner{}
	}
	return &Service{repo: repo, storage: storage, scanner: scanner, newID: newID}
}

func (s *Service) StorageName() string { return s.storage.Name() }

func (s *Service) Upload(ctx context.Context, ownerID string, data []byte, contentType string) (Asset, error) {
	if ownerID == "" {
		return Asset{}, errs.New(errs.Unauthorized, "로그인이 필요합니다")
	}
	if len(data) == 0 {
		return Asset{}, errs.New(errs.Validation, "파일이 비어 있습니다")
	}

	// 보내는 쪽이 뭐라고 부르든, **바이트가 말하는 것**을 믿는다.
	// 여기서 확인하지 않으면 `image/png`라고 적힌 HTML이 그대로 저장되고 그대로 서브된다.
	contentType = normalizeType(contentType)
	sniffed := normalizeType(http.DetectContentType(data))
	if !allowed[sniffed] {
		return Asset{}, errs.New(errs.Validation, "지원하지 않는 형식입니다: %s", sniffed)
	}
	if contentType != "" && contentType != sniffed {
		return Asset{}, errs.New(errs.Validation, "파일 형식이 선언과 다릅니다")
	}
	contentType = sniffed

	stored, err := s.storage.Save(ctx, data, contentType)
	if err != nil {
		return Asset{}, err
	}
	// 스캔이 실패해도 업로드는 성공시킨다 — 통과시키는 쪽이 아니라 **판단을 미루는** 쪽이다
	// (모더레이션 큐가 나중에 본다). 스캐너 장애로 사진을 못 올리게 만들 이유는 없다.
	scan, scanErr := s.scanner.Scan(ctx, data, contentType)
	if errors.Is(scanErr, ErrUnscannable) {
		// 다시 봐도 같다 — 공개하지 않고 사람에게 넘긴다.
		scan, scanErr = ScanResult{Flagged: true, Reason: "unscannable"}, nil
	}
	if scanErr != nil {
		scan = ScanResult{}
		slog.Warn("[media] 사진 검사 실패 — 나중에 다시 본다", "err", scanErr)
	}

	asset := Asset{
		ID:          s.newID(),
		OwnerID:     ownerID,
		Key:         stored.Key,
		URL:         stored.URL,
		ContentType: contentType,
		Kind:        "image",
		Bytes:       stored.Bytes,
		Flagged:     scan.Flagged,
		ScanPending: scanErr != nil,
	}
	if scan.Flagged && scan.Reason == "" {
		scan.Reason = "auto_scan"
	}
	created, err := s.repo.Create(ctx, asset)
	if err != nil {
		return Asset{}, err
	}
	return created, nil
}

// RescanPending은 검사하지 못한 사진을 다시 본다. 검사기가 또 실패하면 다음 회차로 미룬다.
func (s *Service) RescanPending(ctx context.Context, limit int32) (int, error) {
	assets, err := s.repo.ListScanPending(ctx, limit)
	if err != nil {
		return 0, err
	}
	done := 0
	var firstErr error
	for _, a := range assets {
		data, err := s.readAll(ctx, a.Key)
		if errors.Is(err, os.ErrNotExist) {
			// 파일이 없으면 다시 볼 것도 없다.
			if err := s.repo.ApplyRescan(ctx, a, false); err != nil {
				return done, err
			}
			continue
		}
		var scan ScanResult
		if err == nil {
			scan, err = s.scanner.Scan(ctx, data, a.ContentType)
			if errors.Is(err, ErrUnscannable) {
				scan, err = ScanResult{Flagged: true, Reason: "unscannable"}, nil
			}
		}
		if err != nil {
			// [원본] return done, err — 실패하는 한 장이 뒤의 사진을 영영 막았다.
			// [개선] 표시를 남기고 넘어간다. 실패가 많은 사진은 다음 회차에 뒤로 간다.
			firstErr = errors.Join(firstErr, err)
			if err := s.repo.BumpScanAttempts(ctx, a.ID); err != nil {
				return done, err
			}
			continue
		}
		if err := s.repo.ApplyRescan(ctx, a, scan.Flagged); err != nil {
			return done, err
		}
		done++
	}
	return done, firstErr
}

// RescanLoop는 ctx가 끝날 때까지 주기마다 RescanPending을 돈다.
func (s *Service) RescanLoop(ctx context.Context, every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if _, err := s.RescanPending(ctx, 50); err != nil {
				slog.Warn("[media] 사진 재검사 실패", "err", err)
			}
		}
	}
}

func (s *Service) readAll(ctx context.Context, key string) ([]byte, error) {
	body, err := s.storage.Open(ctx, key)
	if err != nil {
		return nil, err
	}
	defer func() { _ = body.Close() }()
	return io.ReadAll(body)
}

// ReadForReview는 검토자에게 줄 바이트다. 막힌 사진도 읽는다 — 권한은 부르는 쪽(moderation)이 본다.
func (s *Service) ReadForReview(ctx context.Context, key string) (string, []byte, error) {
	asset, err := s.repo.GetByKey(ctx, key)
	if err != nil {
		return "", nil, err
	}
	data, err := s.readAll(ctx, key)
	if err != nil {
		return "", nil, errs.New(errs.NotFound, "파일을 찾을 수 없습니다")
	}
	return asset.ContentType, data, nil
}

// Serve는 서브해도 되는지 판단하고, 되면 열어 준다. 호출부가 닫는다.
//
// 순서가 중요하다: **스트림을 확보한 뒤에** 헤더를 쓴다(호출부). 헤더를 먼저 쓰고 스트림이
// 실패하면 깨진 200이 캐시에 1년 동안 박힌다 — 옛 서버가 겪고 고친 순서다.
func (s *Service) Serve(ctx context.Context, key string) (Asset, io.ReadCloser, error) {
	asset, err := s.repo.GetByKey(ctx, key)
	if err != nil {
		return Asset{}, nil, err
	}
	// 내려간 파일은 **없는 것처럼** 답한다.
	if asset.Flagged {
		return Asset{}, nil, errs.New(errs.NotFound, "파일을 찾을 수 없습니다")
	}
	ok, err := s.storage.Exists(ctx, key)
	if err != nil {
		return Asset{}, nil, err
	}
	if !ok {
		return Asset{}, nil, errs.New(errs.NotFound, "파일을 찾을 수 없습니다")
	}
	body, err := s.storage.Open(ctx, key)
	if err != nil {
		return Asset{}, nil, errs.New(errs.NotFound, "파일을 찾을 수 없습니다")
	}
	return asset, body, nil
}

// `image/jpeg; charset=utf-8` 처럼 딸려 오는 것들을 떼고 소문자로 맞춘다.
func normalizeType(ct string) string {
	if i := strings.IndexByte(ct, ';'); i >= 0 {
		ct = ct[:i]
	}
	return strings.ToLower(strings.TrimSpace(ct))
}
