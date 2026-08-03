// @plm SRS-019  저장소 포트 — 바이트가 어디에 놓이는가 (ADR-016)
//
// ─────────────────────────────────────────────────────────────────────────────
// 기본은 **로컬 디스크**다. 클라우드(R2·S3·호환 스토리지)는 이 포트의 다른 구현일 뿐이고,
// 바꿔 끼워도 **주소는 변하지 않는다**(`/media/file/<key>`) — 서버가 프록시로 서브하기 때문이다.
// 그래서 저장소를 옮겨도 이미 올라간 글의 본문을 손댈 일이 없다.
//
// ── 왜 키를 저장소가 만드나 ─────────────────────────────────────────────────
// 파일 이름이 곧 권한이다(capability URL) — 무작위 16바이트라 추측할 수 없다.
// 이름 짓기를 service로 올리면 저장소마다 다른 규칙이 생기고, 그 순간 "추측 불가"가 깨진다.
//
// ── 없는 파일은 오류가 아니라 상태다 ────────────────────────────────────────
// Exists가 false면 호출부는 **404**로 답한다. 헤더를 먼저 쓰고 스트림이 실패하면
// 깨진 200이 캐시에 박힌다(옛 서버가 겪고 고친 순서 — 그 순서를 그대로 지킨다).
// ─────────────────────────────────────────────────────────────────────────────
package media

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"io"
)

// StoredObject는 저장 결과다. url은 **상대경로** — 호스트에 매이지 않는다.
type StoredObject struct {
	Key   string
	URL   string
	Bytes int64
}

type Storage interface {
	// 어떤 저장소인지 — 운영 메타·로그에만 쓴다.
	Name() string
	Save(ctx context.Context, data []byte, contentType string) (StoredObject, error)
	Exists(ctx context.Context, key string) (bool, error)
	// 호출부가 닫는다.
	Open(ctx context.Context, key string) (io.ReadCloser, error)
}

// 확장자는 **저장할 때 정해 둔다.** 나중에 content type을 잃어버려도 파일만 보고 알 수 있고,
// R2 콘솔이나 CDN에서 사람이 열어볼 때도 제 모양으로 뜬다.
var extByType = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
	"image/gif":  "gif",
}

func newKey(contentType string) (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	ext, ok := extByType[contentType]
	if !ok {
		ext = "bin"
	}
	return hex.EncodeToString(buf) + "." + ext, nil
}

// 저장소가 무엇이든 주소는 하나로 정한다 — 이 함수가 그 유일한 규칙이다.
func urlForKey(key string) string {
	return "/media/file/" + key
}
