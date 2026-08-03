// @plm SRS-019  미디어 노출 — 올리기는 RPC, 보기는 평범한 HTTP
//
// 이 두 갈래가 **같은 service를 부른다.** 규칙(형식·모더레이션·존재 확인)은 한 곳에만 있다.
package media

import (
	"context"
	"io"
	"net/http"
	"strings"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	mediav1 "github.com/JWK-company/liftgram/src/backend/gen/media/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/media/v1/mediav1connect"
	"github.com/JWK-company/liftgram/src/backend/internal/auth"
)

type Handler struct {
	mediav1connect.UnimplementedMediaServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) UploadImage(ctx context.Context, req *connect.Request[mediav1.UploadImageRequest]) (*connect.Response[mediav1.UploadImageResponse], error) {
	// 로그인하지 않았으면 빈 문자열 — service가 거절한다(판단은 한 곳).
	ownerID, _ := auth.UserIDFrom(ctx)
	asset, err := h.svc.Upload(ctx, ownerID, req.Msg.GetData(), req.Msg.GetContentType())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&mediav1.UploadImageResponse{Media: toProto(asset)}), nil
}

func toProto(a Asset) *mediav1.Media {
	return &mediav1.Media{
		Id:          a.ID,
		Url:         a.URL,
		Kind:        mediav1.MediaKind_MEDIA_KIND_IMAGE,
		ContentType: a.ContentType,
		Bytes:       a.Bytes,
		CreatedAt:   timestamppb.New(a.CreatedAt),
	}
}

// FileHandler는 `GET /media/file/{key}`다.
//
// ── 왜 여기만 RPC가 아닌가 ──────────────────────────────────────────────────
// `<img src>`는 Connect를 말하지 못한다. 브라우저가 그냥 GET으로 가져갈 수 있어야 한다.
//
// ── 왜 로그인을 요구하지 않나 ───────────────────────────────────────────────
// 키가 무작위라 **주소를 아는 것이 곧 권한이다**(capability URL). 로그인을 요구하면
// `<img>`가 토큰을 실을 방법이 없어 화면마다 우회로가 생긴다(옛 서버와 같은 판단).
// 대신 내려간 파일은 service가 404로 막는다.
func (h *Handler) FileHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		key := strings.TrimPrefix(r.URL.Path, "/media/file/")
		if key == "" || strings.Contains(key, "/") {
			http.NotFound(w, r)
			return
		}

		asset, body, err := h.svc.Serve(r.Context(), key)
		if err != nil {
			// 없는 파일도 내려간 파일도 똑같이 404다 — 어느 쪽인지 알려 주지 않는다.
			http.NotFound(w, r)
			return
		}
		defer func() { _ = body.Close() }()

		// 헤더는 **스트림을 확보한 뒤에** 쓴다. 먼저 쓰면 실패한 응답이 200으로 캐시된다.
		w.Header().Set("Content-Type", asset.ContentType)
		// 키가 내용에 1:1로 묶여 있으므로(한 번 쓰고 안 바꾼다) 영구 캐시가 안전하다.
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.Method == http.MethodHead {
			return
		}
		_, _ = io.Copy(w, body)
	})
}
