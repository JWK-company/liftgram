// @plm SRS-001  WebSocket 게이트웨이 — 양방향 채널의 종단
//
// ─────────────────────────────────────────────────────────────────────────────
// 왜 Connect가 아니라 raw WebSocket인가:
//
//	Connect의 **양방향 스트리밍은 HTTP/2가 필요**하고, 브라우저는 fetch로 전이중을 못 한다
//	(Connect 공식 문서: bidirectional streaming requires HTTP/2). 그래서 "한 연결로 구독과
//	조작을 모두" 하려면 WebSocket이 유일한 길이다. 받기만 하면 되는 화면은 WatchCatalog
//	서버 스트리밍을 쓰는 편이 낫다 — 그쪽은 타입이 있다.
//
// 규칙은 여기 없다. 메시지를 파싱해 **같은 service를 부른다** —
// 그래서 RPC로 부르든 소켓으로 부르든 정규화·idempotency·propagation이 똑같이 적용된다.
// "WS만 규칙이 다른" 사고를 구조적으로 막는다.
//
// 프레임은 텍스트(JSON)다. 브라우저가 event.data를 문자열로 받게 하기 위해서다 —
// 바이너리로 보내면 화면에서 Blob이 되어 JSON.parse가 터진다(실측으로 겪은 함정).
// ─────────────────────────────────────────────────────────────────────────────
package exercise

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/coder/websocket"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	// 30초마다 살아 있는지 확인한다. 응답이 없으면 끊는다.
	pingInterval = 30 * time.Second
	pingTimeout  = 10 * time.Second
)

// 클라이언트 → 서버
type wsCommand struct {
	Type string `json:"type"` // subscribe | createCustom
	// createCustom일 때만 쓴다.
	NameKo           string   `json:"nameKo,omitempty"`
	PrimaryMuscles   []string `json:"primaryMuscles,omitempty"`
	SecondaryMuscles []string `json:"secondaryMuscles,omitempty"`
	Equipment        string   `json:"equipment,omitempty"`
	Kind             string   `json:"kind,omitempty"`
	LoadMode         string   `json:"loadMode,omitempty"`
	IdempotencyKey   string   `json:"idempotencyKey,omitempty"`
}

// 서버 → 클라이언트. 스트림과 같은 어휘를 쓴다(snapshot/delta/error).
type wsMessage struct {
	Type     string      `json:"type"`
	Revision *wsRevision `json:"revision,omitempty"`
	Exercise *wsExercise `json:"exercise,omitempty"`
	Detail   string      `json:"detail,omitempty"`
}

type wsRevision struct {
	Count     int64  `json:"count"`
	UpdatedAt string `json:"updatedAt"`
}

type wsExercise struct {
	ID       string `json:"id"`
	NameKo   string `json:"nameKo"`
	IsCustom bool   `json:"isCustom"`
}

// WSHandler는 /ws 업그레이드를 받는다. frontend의 커스텀 서버가 여기로 터널링한다.
func (h *Handler) WSHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 브라우저는 frontend(같은 출처)에만 붙고 frontend가 여기로 넘긴다 —
		// backend는 내부 전용이라 Origin 검사를 여기서 하지 않는다(경계는 frontend가 지킨다).
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{InsecureSkipVerify: true})
		if err != nil {
			return
		}
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()
		defer conn.Close(websocket.StatusNormalClosure, "")

		send := func(m wsMessage) error {
			blob, err := json.Marshal(m)
			if err != nil {
				return err
			}
			// MessageText — 브라우저가 문자열로 받게 한다(위 주석 참고).
			return conn.Write(ctx, websocket.MessageText, blob)
		}

		var unsub func()
		defer func() {
			if unsub != nil {
				unsub()
			}
		}()

		changed := make(chan struct{}, 8)

		// 살아 있는지 확인하는 한 갈래. 응답이 없으면 컨텍스트를 닫아 읽기 루프도 끝낸다.
		go func() {
			t := time.NewTicker(pingInterval)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
					pctx, pcancel := context.WithTimeout(ctx, pingTimeout)
					err := conn.Ping(pctx)
					pcancel()
					if err != nil {
						cancel()
						return
					}
				}
			}
		}()

		// propagation을 받아 델타를 보내는 한 갈래.
		go func() {
			for {
				select {
				case <-ctx.Done():
					return
				case <-changed:
					rev, err := h.svc.Revision(ctx)
					if err != nil {
						continue // 조회 실패는 다음 알림에서 만회한다 — 연결을 끊지 않는다
					}
					_ = send(wsMessage{Type: "delta", Revision: toWSRevision(rev)})
				}
			}
		}()

		for {
			_, data, err := conn.Read(ctx)
			if err != nil {
				return // 클라이언트가 끊었거나 ping이 실패했다
			}
			var cmd wsCommand
			if err := json.Unmarshal(data, &cmd); err != nil || cmd.Type == "" {
				// 깨진 메시지에도 연결은 유지한다 — 한 번의 오타로 화면이 죽지 않게.
				_ = send(wsMessage{Type: "error", Detail: "메시지 형식이 올바르지 않습니다"})
				continue
			}

			switch cmd.Type {
			case "subscribe":
				// ── 순서가 중요하다: **구독 먼저, 스냅샷 나중.** ─────────────────
				// 반대로 하면 그 틈에 일어난 변경이 영원히 유실된다(WatchCatalog와 같은 이유).
				if unsub != nil {
					unsub()
				}
				unsub = h.bus.Subscribe(func(topic string) {
					if topic != CatalogTopic {
						return
					}
					select {
					case changed <- struct{}{}:
					default:
					}
				})
				rev, err := h.svc.Revision(ctx)
				if err != nil {
					_ = send(wsMessage{Type: "error", Detail: userMessage(err)})
					continue
				}
				_ = send(wsMessage{Type: "snapshot", Revision: toWSRevision(rev)})

			case "createCustom":
				// 규칙은 service가 판정한다. 여기서 값을 만들지 않는다.
				created, _, err := h.svc.CreateCustom(ctx, NewCustom{
					NameKo:           cmd.NameKo,
					PrimaryMuscles:   toMuscles(cmd.PrimaryMuscles),
					SecondaryMuscles: toMuscles(cmd.SecondaryMuscles),
					Equipment:        Equipment(cmd.Equipment),
					Kind:             Kind(cmd.Kind),
					LoadMode:         LoadMode(cmd.LoadMode),
				}, cmd.IdempotencyKey)
				if err != nil {
					_ = send(wsMessage{Type: "error", Detail: userMessage(err)})
					continue
				}
				// 개정 번호는 propagation을 타고 위 goroutine이 델타로 보낸다 —
				// 그래서 이 소켓과 다른 탭·다른 인스턴스가 **같은 경로로** 같은 값을 받는다.
				// 여기서는 "무엇이 만들어졌는지"만 돌려준다(만든 사람만 알면 되는 사실).
				_ = send(wsMessage{Type: "created", Exercise: &wsExercise{
					ID: created.ID, NameKo: created.NameKo, IsCustom: created.IsCustom,
				}})

			default:
				_ = send(wsMessage{Type: "error", Detail: "알 수 없는 동작입니다"})
			}
		}
	}
}

func toWSRevision(r Revision) *wsRevision {
	return &wsRevision{Count: r.Count, UpdatedAt: r.UpdatedAt.UTC().Format(time.RFC3339Nano)}
}

// 사용자에게 보여도 되는 문구만 내보낸다.
// 도메인 오류(검증·없음·충돌)는 사용자가 고칠 수 있는 정보라 그대로 전한다.
// 그 밖의 오류는 내부 사정이므로 로그에만 남기고 화면에는 일반 문구를 준다.
func userMessage(err error) string {
	var de *errs.DomainError
	if errors.As(err, &de) {
		return de.Message
	}
	slog.Warn("ws 처리 실패", "err", err.Error())
	return "요청을 처리하지 못했습니다"
}
