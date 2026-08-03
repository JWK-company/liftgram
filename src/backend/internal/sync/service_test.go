// @plm SRS-006  동기 규칙 테스트
//
// 여기서 지키는 것 — 전부 "조용히 데이터를 잃지 않는가"에 관한 것이다:
//
//	· 커서가 **읽지 않은 것을 뛰어넘지 않는다**(이 파일의 핵심)
//	· 클라이언트 살림(`_status`·`_changed`)이 오가지 않는다 — 남으면 그 기기의 동기가 멈춘다
//	· 되돌려 줄 수 없는 레코드는 받지 않는다(id 없음·객체 아님)
//	· 삭제는 서버가 모르는 레코드에도 남는다
package sync

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeRepo struct {
	now      time.Time
	records  []Record
	upserted []Record
	deleted  []Record
	listedAt [2]time.Time
	failWith error
}

func (f *fakeRepo) Now(context.Context) (time.Time, error) {
	if f.failWith != nil {
		return time.Time{}, f.failWith
	}
	return f.now, nil
}

func (f *fakeRepo) List(_ context.Context, _ string, since, until time.Time) ([]Record, error) {
	if f.failWith != nil {
		return nil, f.failWith
	}
	f.listedAt = [2]time.Time{since, until}
	var out []Record
	for _, r := range f.records {
		out = append(out, r)
	}
	return out, nil
}

func (f *fakeRepo) Apply(_ context.Context, _ string, upserts, deletes []Record) error {
	if f.failWith != nil {
		return f.failWith
	}
	f.upserted = append(f.upserted, upserts...)
	f.deleted = append(f.deleted, deletes...)
	return nil
}

func newSvc(r *fakeRepo) *Service {
	n := 0
	return NewService(r, func() string {
		n++
		return "row-" + string(rune('a'+n))
	})
}

func codeOf(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아니다: %v", err)
	}
	return de.Code
}

func TestPull_로그인이_필요하다(t *testing.T) {
	_, err := newSvc(&fakeRepo{}).Pull(context.Background(), "", 0)
	if codeOf(t, err) != errs.Unauthorized {
		t.Fatalf("신원 없는 pull은 401이어야 한다")
	}
}

// 이 테스트가 이 파일의 이유다 — 커서가 조회 상한보다 **뒤에** 있어야 한다.
func TestPull_커서는_읽은_지점보다_뒤로_물린다(t *testing.T) {
	now := time.UnixMilli(1_700_000_000_000)
	repo := &fakeRepo{now: now}
	res, err := newSvc(repo).Pull(context.Background(), "u1", 0)
	if err != nil {
		t.Fatal(err)
	}

	if !repo.listedAt[1].Equal(now) {
		t.Fatalf("상한은 DB의 지금이어야 한다: %v", repo.listedAt[1])
	}
	// 커밋이 늦어 아직 안 보이던 레코드를 다음 회차가 줍도록, 돌려주는 커서는 상한보다 앞이다.
	if res.Timestamp >= now.UnixMilli() {
		t.Fatalf("커서가 상한을 앞질렀다 — 그 사이 레코드는 영영 오지 않는다: %d ≥ %d",
			res.Timestamp, now.UnixMilli())
	}
	if got := now.UnixMilli() - res.Timestamp; got != cursorOverlap.Milliseconds() {
		t.Fatalf("물린 폭이 다르다: %dms", got)
	}
}

func TestPull_미래에서_온_커서는_처음부터_다시(t *testing.T) {
	now := time.UnixMilli(1_700_000_000_000)
	repo := &fakeRepo{now: now}
	// 기기 시계가 하루 앞서 있다. 그대로 믿으면 그 사이 변경이 전부 누락된다.
	_, err := newSvc(repo).Pull(context.Background(), "u1", now.Add(24*time.Hour).UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	if repo.listedAt[0].UnixMilli() != 0 {
		t.Fatalf("미래 커서는 0으로 되돌려야 한다: %v", repo.listedAt[0])
	}
}

func TestPull_살아있는_것은_updated_지운_것은_deleted(t *testing.T) {
	repo := &fakeRepo{
		now: time.UnixMilli(1_700_000_000_000),
		records: []Record{
			{Collection: "workouts", RecordID: "w1", Payload: []byte(`{"id":"w1","state":"completed"}`)},
			{Collection: "workouts", RecordID: "w2", Deleted: true},
			{Collection: "routines", RecordID: "r1", Payload: []byte(`{"id":"r1"}`)},
		},
	}
	res, err := newSvc(repo).Pull(context.Background(), "u1", 0)
	if err != nil {
		t.Fatal(err)
	}
	// created는 쓰지 않는다 — 받는 쪽이 없으면 만들고 있으면 덮는다.
	wk := res.Changes["workouts"]
	if len(wk.Created) != 0 || len(wk.Updated) != 1 || len(wk.Deleted) != 1 {
		t.Fatalf("created 0 · updated 1 · deleted 1이어야 한다: %+v", wk)
	}
	if wk.Deleted[0] != "w2" {
		t.Fatalf("지운 것은 id만 간다: %+v", wk.Deleted)
	}
	if len(res.Changes["routines"].Updated) != 1 {
		t.Fatalf("다른 컬렉션이 섞였다: %+v", res.Changes)
	}
}

func TestPull_저장된_오염을_치유한다(t *testing.T) {
	// 옛 클라이언트가 살림 필드째 올려 저장된 레코드. 그대로 돌려주면 **받는 기기의 동기가 멈춘다**.
	repo := &fakeRepo{
		now: time.UnixMilli(1_700_000_000_000),
		records: []Record{{
			Collection: "routines", RecordID: "r1",
			Payload: []byte(`{"id":"r1","name":"가슴","_status":"created","_changed":"name"}`),
		}},
	}
	res, err := newSvc(repo).Pull(context.Background(), "u1", 0)
	if err != nil {
		t.Fatal(err)
	}
	got := res.Changes["routines"].Updated[0]
	if strings.Contains(got, "_status") || strings.Contains(got, "_changed") {
		t.Fatalf("내부 필드가 새어 나갔다: %s", got)
	}
	if !strings.Contains(got, `"name":"가슴"`) {
		t.Fatalf("본래 필드가 사라졌다: %s", got)
	}
}

func TestPull_깨진_레코드는_손대지_않는다(t *testing.T) {
	// 어떤 이유로든 JSON이 아닌 것이 저장돼 있다. 여기서 버리면 **사용자 데이터가 사라진다**.
	repo := &fakeRepo{
		now:     time.UnixMilli(1_700_000_000_000),
		records: []Record{{Collection: "x", RecordID: "1", Payload: []byte(`not json`)}},
	}
	res, err := newSvc(repo).Pull(context.Background(), "u1", 0)
	if err != nil {
		t.Fatal(err)
	}
	if res.Changes["x"].Updated[0] != "not json" {
		t.Fatalf("원본이 바뀌었다: %+v", res.Changes["x"])
	}
}

func TestPush_로그인이_필요하다(t *testing.T) {
	err := newSvc(&fakeRepo{}).Push(context.Background(), "", map[string]TableChanges{})
	if codeOf(t, err) != errs.Unauthorized {
		t.Fatalf("신원 없는 push는 401이어야 한다")
	}
}

func TestPush_created와_updated를_가르지_않는다(t *testing.T) {
	repo := &fakeRepo{}
	err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{
		"routines": {
			Created: []string{`{"id":"r1","name":"새것"}`},
			Updated: []string{`{"id":"r2","name":"고친것"}`},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	// 서버에는 "있으면 덮고 없으면 만든다" 하나뿐이다.
	if len(repo.upserted) != 2 {
		t.Fatalf("둘 다 upsert로 가야 한다: %+v", repo.upserted)
	}
}

func TestPush_내부_필드를_저장하지_않는다(t *testing.T) {
	repo := &fakeRepo{}
	err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{
		"routines": {Updated: []string{`{"id":"r1","name":"가슴","_status":"updated","_changed":"name"}`}},
	})
	if err != nil {
		t.Fatal(err)
	}
	stored := string(repo.upserted[0].Payload)
	if strings.Contains(stored, "_status") || strings.Contains(stored, "_changed") {
		t.Fatalf("살림 필드가 저장됐다 — 다음 pull에서 되돌아가 동기를 멈춘다: %s", stored)
	}
	var obj map[string]any
	if err := json.Unmarshal([]byte(stored), &obj); err != nil || obj["name"] != "가슴" {
		t.Fatalf("본래 필드가 사라졌다: %s", stored)
	}
}

func TestPush_되돌려줄_수_없는_레코드는_거절한다(t *testing.T) {
	cases := map[string]string{
		"객체가 아니다":   `"그냥 문자열"`,
		"id가 없다":    `{"name":"이름만"}`,
		"id가 빈 문자열": `{"id":""}`,
		"id가 숫자다":   `{"id":123}`,
		"JSON이 아니다": `{broken`,
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			repo := &fakeRepo{}
			err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{
				"routines": {Updated: []string{raw}},
			})
			if codeOf(t, err) != errs.Validation {
				t.Fatalf("거절해야 한다: %v", err)
			}
			if len(repo.upserted) != 0 {
				t.Fatalf("하나라도 저장되면 안 된다: %+v", repo.upserted)
			}
		})
	}
}

func TestPush_삭제는_서버가_모르는_레코드에도_남긴다(t *testing.T) {
	repo := &fakeRepo{}
	err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{
		"workouts": {Deleted: []string{"never-seen"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	// 한 기기에만 있던 레코드를 지웠다 — 다른 기기가 그 사실을 알아야 한다.
	if len(repo.deleted) != 1 || repo.deleted[0].RecordID != "never-seen" {
		t.Fatalf("삭제 표시가 남지 않았다: %+v", repo.deleted)
	}
}

func TestPush_빈_변화분은_저장소를_건드리지_않는다(t *testing.T) {
	repo := &fakeRepo{failWith: errors.New("여기 오면 안 된다")}
	if err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{
		"routines": {},
	}); err != nil {
		t.Fatalf("빈 push는 성공해야 한다: %v", err)
	}
}

func TestPush_한계를_넘으면_아무것도_반영하지_않는다(t *testing.T) {
	big := make([]string, maxRecordsPerPush+1)
	for i := range big {
		big[i] = `{"id":"x"}`
	}
	repo := &fakeRepo{}
	err := newSvc(repo).Push(context.Background(), "u1", map[string]TableChanges{"x": {Updated: big}})
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("한 번에 너무 많으면 거절해야 한다: %v", err)
	}
	if len(repo.upserted) != 0 {
		t.Fatalf("절반만 반영되면 안 된다: %d건", len(repo.upserted))
	}
}

func TestPush_지나치게_큰_레코드는_거절한다(t *testing.T) {
	huge := `{"id":"x","note":"` + strings.Repeat("가", maxRecordBytes) + `"}`
	err := newSvc(&fakeRepo{}).Push(context.Background(), "u1", map[string]TableChanges{
		"routines": {Updated: []string{huge}},
	})
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("거절해야 한다: %v", err)
	}
}

func TestPush_컬렉션_이름_검사(t *testing.T) {
	for name, coll := range map[string]string{
		"빈 이름":    "",
		"너무 긴 이름": strings.Repeat("a", maxCollectionLen+1),
	} {
		t.Run(name, func(t *testing.T) {
			err := newSvc(&fakeRepo{}).Push(context.Background(), "u1", map[string]TableChanges{
				coll: {Updated: []string{`{"id":"x"}`}},
			})
			if codeOf(t, err) != errs.Validation {
				t.Fatalf("거절해야 한다: %v", err)
			}
		})
	}
}
