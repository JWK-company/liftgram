// @plm SRS-006  오프라인 동기 규칙 — 기기와 서버를 맞춘다 (ADR-002 · SAD-004)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일이 아는 것은 셋뿐이다:
//
//	① **커서를 뛰어넘지 않는다** — 받지 못한 변경이 영영 누락되면, 사용자는 그 사실조차 모른다
//	② **레코드를 해석하지 않는다** — 속을 모르되, 되돌려 줄 수 있는 모양인지는 확인한다
//	③ **내부 필드를 걸러낸다** — 클라이언트 살림(`_status`·`_changed`)이 서버에 남으면 동기가 멈춘다
//
// ── ① 커서 이야기(이 파일에서 가장 중요한 부분) ────────────────────────────
// 흔한 구현은 pull에서 "지금"을 찍어 돌려주고, 다음 pull이 그 뒤로 바뀐 것을 받는다.
// 여기에 조용한 누락이 있다:
//
//	t0  A 트랜잭션이 updated_at = t0으로 레코드를 쓴다 (아직 커밋 전)
//	t1  pull이 "지금 = t1"을 찍고 조회한다 → A는 아직 안 보인다
//	t2  A가 커밋된다 (updated_at은 여전히 t0)
//	    다음 pull은 t1 뒤를 묻는다 → **A는 영원히 안 온다**
//
// 그래서 돌려주는 커서를 조회 상한보다 `overlap`만큼 **뒤로** 물린다. 그 폭 안의 레코드는
// 다음 회차에 다시 온다 — 동기는 멱등(같은 것을 두 번 받아도 결과가 같다)이라 손해가 없고,
// 잃어버리는 쪽은 되돌릴 수 없다. **다시 받는 비용 < 잃는 비용**이 이 선택의 전부다.
//
// ── 시계는 하나만 쓴다 ──────────────────────────────────────────────────────
// `updated_at`은 DB가 찍는다. 그러니 커서도 DB에게 물어본다 — 애플리케이션 시계와 DB 시계가
// 몇 밀리초만 어긋나도 그 틈의 레코드가 사라진다(컨테이너 둘이면 흔한 일이다).
// ─────────────────────────────────────────────────────────────────────────────
package sync

import (
	"context"
	"encoding/json"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	// 돌려주는 커서를 조회 상한에서 이만큼 물린다. 커밋이 늦어 놓친 레코드를 다음 회차가 줍는다.
	// 1초는 넉넉하다 — 이보다 오래 열려 있는 쓰기 트랜잭션이면 그건 별개의 문제다.
	cursorOverlap = time.Second

	// 레코드 하나의 크기 상한. 오프라인 앱의 레코드는 수 KB를 넘지 않는다 —
	// 이보다 크면 버그이거나 남의 저장소를 우리 것으로 쓰려는 시도다.
	maxRecordBytes = 256 << 10
	// 한 번의 push에 담을 수 있는 레코드 수. 넘으면 나눠 보내면 된다(클라이언트가 알아서 한다).
	maxRecordsPerPush = 5000
	// 컬렉션 이름 길이 상한. 서버는 이름의 목록을 모르지만 길이는 안다.
	maxCollectionLen = 64
)

// 클라이언트 살림. 서버에 남으면 다음 pull에서 되돌아가 클라이언트의 동기를 **멈춰 세운다**
// (WatermelonDB가 "raw record must not contain _status" 진단으로 죽는다).
// 그래서 들어올 때 걸러내고, 나갈 때 한 번 더 걸러낸다 — 이미 오염된 데이터를 치유하기 위해서다.
var internalFields = []string{"_status", "_changed"}

// Record는 서버가 보관하는 한 건이다. payload의 속은 모른다.
type Record struct {
	Collection string
	RecordID   string
	Payload    []byte
	Deleted    bool
}

// TableChanges는 한 컬렉션의 변화분이다.
type TableChanges struct {
	Created []string
	Updated []string
	Deleted []string
}

type Repo interface {
	// Now는 **DB의 시각**이다. 커서와 updated_at이 같은 시계에서 나와야 한다.
	Now(ctx context.Context) (time.Time, error)
	List(ctx context.Context, userID string, since, until time.Time) ([]Record, error)
	// Apply는 한 트랜잭션이다 — 절반만 반영되면 클라이언트가 무엇을 다시 보내야 할지 알 수 없다.
	Apply(ctx context.Context, userID string, upserts []Record, deletes []Record) error
}

type Service struct {
	repo Repo
	// 새 행의 기본키를 만든다. 레코드 id는 클라이언트 것이라 따로 필요하다.
	newID func() string
}

func NewService(repo Repo, newID func() string) *Service {
	return &Service{repo: repo, newID: newID}
}

// PullResult는 화면이 아니라 **클라이언트 동기 엔진**이 받는 값이다.
type PullResult struct {
	Changes map[string]TableChanges
	// 다음 요청에 그대로 넣을 값(epoch ms).
	Timestamp int64
}

// Pull은 마지막으로 받은 시각 이후의 변화분을 돌려준다.
//
// 살아 있는 레코드는 전부 `Updated`로 간다 — 받는 쪽이 없으면 만들고 있으면 덮기 때문에,
// created와 updated를 가르려다 "이미 있다" 오류만 난다(WatermelonDB 권장 형태).
func (s *Service) Pull(ctx context.Context, userID string, lastPulledAt int64) (PullResult, error) {
	if userID == "" {
		return PullResult{}, errs.New(errs.Unauthorized, "login required")
	}
	if lastPulledAt < 0 {
		return PullResult{}, errs.New(errs.Validation, "lastPulledAt must not be negative")
	}

	until, err := s.repo.Now(ctx)
	if err != nil {
		return PullResult{}, err
	}
	since := time.UnixMilli(lastPulledAt)

	// 커서가 미래에서 왔다(기기 시계가 어긋났거나 값이 조작됐다). 그대로 믿으면 그 사이 변경이
	// 전부 누락된다 — **처음부터 다시 받는 편**이 안전하다. 동기는 멱등이라 비용은 시간뿐이다.
	if since.After(until) {
		since = time.UnixMilli(0)
	}

	recs, err := s.repo.List(ctx, userID, since, until)
	if err != nil {
		return PullResult{}, err
	}

	changes := make(map[string]TableChanges, 8)
	for _, r := range recs {
		t := changes[r.Collection]
		if r.Deleted {
			t.Deleted = append(t.Deleted, r.RecordID)
		} else {
			// 나가는 길에도 내부 필드를 지운다 — 예전에 오염된 채 저장된 레코드를 여기서 치유한다.
			t.Updated = append(t.Updated, string(stripInternal(r.Payload)))
		}
		changes[r.Collection] = t
	}

	return PullResult{
		Changes: changes,
		// 상한이 아니라 **overlap만큼 물린 값**을 준다. 위 주석의 누락을 막는 유일한 장치다.
		Timestamp: until.Add(-cursorOverlap).UnixMilli(),
	}, nil
}

// Push는 기기의 변화분을 반영한다. 한 번의 호출은 전부 반영되거나 아무것도 반영되지 않는다 —
// 절반만 남으면 클라이언트는 무엇을 다시 보내야 하는지 알 방법이 없다.
func (s *Service) Push(ctx context.Context, userID string, changes map[string]TableChanges) error {
	if userID == "" {
		return errs.New(errs.Unauthorized, "login required")
	}

	var upserts, deletes []Record
	total := 0
	for collection, t := range changes {
		if err := validateCollection(collection); err != nil {
			return err
		}
		total += len(t.Created) + len(t.Updated) + len(t.Deleted)
		if total > maxRecordsPerPush {
			return errs.New(errs.Validation, "too many records in one push (max %d)", maxRecordsPerPush)
		}

		// created와 updated를 가르지 않는다 — 서버에는 "있으면 덮고 없으면 만든다" 하나뿐이다.
		for _, raw := range append(append([]string{}, t.Created...), t.Updated...) {
			id, payload, err := parseRecord(raw)
			if err != nil {
				return err
			}
			upserts = append(upserts, Record{
				Collection: collection, RecordID: id, Payload: payload,
			})
		}
		for _, id := range t.Deleted {
			if id == "" {
				return errs.New(errs.Validation, "deleted record id must not be empty")
			}
			deletes = append(deletes, Record{Collection: collection, RecordID: id, Deleted: true})
		}
	}

	if len(upserts) == 0 && len(deletes) == 0 {
		return nil
	}
	return s.repo.Apply(ctx, userID, upserts, deletes)
}

// NewID는 저장소가 새 행의 기본키를 만들 때 쓴다.
func (s *Service) NewID() string { return s.newID() }

// ── 검사 ─────────────────────────────────────────────────────────────────────

func validateCollection(name string) error {
	if name == "" {
		return errs.New(errs.Validation, "collection name must not be empty")
	}
	if len(name) > maxCollectionLen {
		return errs.New(errs.Validation, "collection name too long")
	}
	return nil
}

// parseRecord는 레코드를 **되돌려 줄 수 있는 모양인지**만 확인한다. 컬럼은 보지 않는다.
//
// 확인하는 것: ① JSON 객체인가 ② `id`(빈 문자열이 아닌 문자열)가 있는가 ③ 너무 크지 않은가.
// id가 없으면 무엇을 덮어야 할지 알 수 없고, 객체가 아니면 다른 기기가 받아도 쓸 수 없다.
func parseRecord(raw string) (string, []byte, error) {
	if len(raw) > maxRecordBytes {
		return "", nil, errs.New(errs.Validation, "record too large")
	}
	var obj map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &obj); err != nil {
		return "", nil, errs.New(errs.Validation, "record must be a JSON object")
	}
	rawID, ok := obj["id"]
	if !ok {
		return "", nil, errs.New(errs.Validation, "record must have an id")
	}
	var id string
	if err := json.Unmarshal(rawID, &id); err != nil || id == "" {
		return "", nil, errs.New(errs.Validation, "record id must be a non-empty string")
	}

	// 들어오는 길에 클라이언트 살림을 지운다. 남겨 두면 다음 pull에서 되돌아가 그 기기의 동기를 멈춘다.
	for _, f := range internalFields {
		delete(obj, f)
	}
	cleaned, err := json.Marshal(obj)
	if err != nil {
		return "", nil, errs.New(errs.Validation, "record could not be re-encoded")
	}
	return id, cleaned, nil
}

// stripInternal은 이미 저장된 레코드에서 내부 필드를 걷어낸다(옛 오염 치유).
// 깨진 JSON이면 손대지 않고 그대로 둔다 — 여기서 버리면 사용자 데이터가 사라진다.
func stripInternal(payload []byte) []byte {
	var obj map[string]json.RawMessage
	if err := json.Unmarshal(payload, &obj); err != nil {
		return payload
	}
	dirty := false
	for _, f := range internalFields {
		if _, ok := obj[f]; ok {
			delete(obj, f)
			dirty = true
		}
	}
	if !dirty {
		return payload
	}
	cleaned, err := json.Marshal(obj)
	if err != nil {
		return payload
	}
	return cleaned
}
