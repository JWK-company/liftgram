// @plm SRS-019  "이 사진 주소를 실어도 되는가" — 글과 스토리가 함께 쓰는 판정
//
// ─────────────────────────────────────────────────────────────────────────────
// 사진은 먼저 올리고 그 **주소를 글에 싣는다**. 그러면 주소를 손으로 지어낼 수 있다는 뜻이다:
//   · `https://evil.example/x.png`  — 남의 서버 그림을 우리 피드에 띄운다(추적·기만)
//   · `/media/file/<남의 키>`       — 남이 올린 사진을 내 글에 붙인다
// 둘 다 막는다. 주소는 **우리 경로**여야 하고, **올린 사람이 나**여야 한다.
//
// 이 판정을 media 패키지에 두는 이유: 소유자를 아는 곳이 여기뿐이다. 글·스토리는
// 자기 쪽에 좁은 포트(인터페이스)만 두고 이 구현을 받아 쓴다 — 서로를 import하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
package media

import (
	"context"
	"regexp"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// `^`와 `$`로 양끝을 묶는다 — 앵커가 없으면 `https://evil/x?u=/media/file/abc.png` 같은 것이 통과한다.
var mediaPathRe = regexp.MustCompile(`^/media/file/([A-Za-z0-9._-]+)$`)

type Ownership struct {
	repo Repo
}

func NewOwnership(repo Repo) *Ownership { return &Ownership{repo: repo} }

// CheckOwned는 주소가 **이 사람이 올린 우리 사진**인지 본다.
//
// 돌려주는 flagged는 "자동 스캔에 걸린 사진"이라는 뜻이다 — 글·스토리는 그때 pending으로 들어간다
// (거절하지 않는다. 사람이 확인할 때까지 안 보일 뿐이다).
func (o *Ownership) CheckOwned(ctx context.Context, url, ownerID string) (bool, error) {
	m := mediaPathRe.FindStringSubmatch(url)
	if m == nil {
		return false, errs.New(errs.Validation, "사진 주소가 올바르지 않습니다")
	}
	asset, err := o.repo.GetByKey(ctx, m[1])
	if err != nil {
		// 없는 사진과 남의 사진을 **같은 말로** 답한다 — 어느 키가 존재하는지 알려 주지 않는다.
		return false, errs.New(errs.Validation, "사진을 찾을 수 없습니다")
	}
	if asset.OwnerID != ownerID {
		return false, errs.New(errs.Validation, "사진을 찾을 수 없습니다")
	}
	return asset.Flagged, nil
}
