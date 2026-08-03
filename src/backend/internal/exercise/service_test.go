// @plm SRS-001  운동 카탈로그 규칙 테스트 — 가짜 저장소 주입, DB도 서버도 없이 돈다
//
// 여기서 검증하는 것은 **service.go의 규칙**뿐이다. SQL이 맞는지·RPC가 붙는지는
// 각각 마이그레이션과 smoke test가 본다. 층마다 보는 것이 달라야 실패 지점이 좁아진다.
package exercise

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜들 ───────────────────────────────────────────────────────────────────

type fakeRepo struct {
	items       []Summary
	byID        map[string]Exercise
	created     []NewCustom
	createdID   []string
	createErr   error
	archived    []string
	archiveRows int64
	rev         Revision
	lastList    ListFilter
	full        []Exercise
	lastPull    ListFilter
}

func (f *fakeRepo) GetByID(_ context.Context, id string) (Exercise, error) {
	if ex, ok := f.byID[id]; ok {
		return ex, nil
	}
	return Exercise{}, errs.New(errs.NotFound, "종목 '%s' 없음", id)
}

func (f *fakeRepo) ListAfter(_ context.Context, filter ListFilter) ([]Summary, error) {
	f.lastList = filter
	if int(filter.Limit) < len(f.items) {
		return f.items[:filter.Limit], nil
	}
	return f.items, nil
}

func (f *fakeRepo) CreateCustom(_ context.Context, id string, in NewCustom) (Exercise, error) {
	if f.createErr != nil {
		return Exercise{}, f.createErr
	}
	f.created = append(f.created, in)
	f.createdID = append(f.createdID, id)
	return Exercise{
		ID: id, NameKo: in.NameKo, PrimaryMuscles: in.PrimaryMuscles,
		SecondaryMuscles: in.SecondaryMuscles, Equipment: in.Equipment,
		Kind: in.Kind, LoadMode: in.LoadMode, IsCustom: true,
		UpdatedAt: time.Unix(0, 0).UTC(),
	}, nil
}

func (f *fakeRepo) PullAfter(_ context.Context, cursor string, limit int32) ([]Exercise, error) {
	f.lastPull = ListFilter{Cursor: cursor, Limit: limit}
	if int(limit) < len(f.full) {
		return f.full[:limit], nil
	}
	return f.full, nil
}

func (f *fakeRepo) Archive(_ context.Context, id string) (int64, error) {
	f.archived = append(f.archived, id)
	return f.archiveRows, nil
}

func (f *fakeRepo) Revision(_ context.Context) (Revision, error) { return f.rev, nil }

type fakeBus struct{ published []string }

func (b *fakeBus) Publish(_ context.Context, name string) error {
	b.published = append(b.published, name)
	return nil
}

type fakeIdem struct{ store map[string]string }

func (i *fakeIdem) Seen(_ context.Context, key string) (string, bool, error) {
	v, ok := i.store[key]
	return v, ok, nil
}

func (i *fakeIdem) Remember(_ context.Context, key, value string) error {
	if i.store == nil {
		i.store = map[string]string{}
	}
	i.store[key] = value
	return nil
}

func newSvc(repo *fakeRepo) (*Service, *fakeBus, *fakeIdem) {
	bus := &fakeBus{}
	idem := &fakeIdem{store: map[string]string{}}
	n := 0
	return NewService(repo, bus, idem, func() string {
		n++
		return "custom-" + string(rune('0'+n))
	}), bus, idem
}

func summaries(n int) []Summary {
	out := make([]Summary, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, Summary{ID: string(rune('a' + i)), NameKo: string(rune('가' + i))})
	}
	return out
}

// ── 목록 ─────────────────────────────────────────────────────────────────────

func TestList_기본_상한과_커서(t *testing.T) {
	// 21개를 준비하고 limit 20을 요청하면, 서비스는 21개를 읽어 20개만 돌려주고
	// 마지막 항목의 이름을 다음 커서로 준다("다음 페이지가 있다"를 추가 쿼리 없이 판단).
	repo := &fakeRepo{items: summaries(21)}
	svc, _, _ := newSvc(repo)

	items, next, err := svc.List(context.Background(), ListFilter{})
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if len(items) != defaultLimit {
		t.Fatalf("기본 상한이 %d여야 하는데 %d개", defaultLimit, len(items))
	}
	if repo.lastList.Limit != defaultLimit+1 {
		t.Fatalf("저장소에 limit+1(%d)을 물어야 하는데 %d", defaultLimit+1, repo.lastList.Limit)
	}
	if next != items[len(items)-1].NameKo {
		t.Fatalf("커서는 마지막 항목의 name_ko여야 하는데 %q", next)
	}
}

func TestList_마지막_페이지는_커서가_비어야_한다(t *testing.T) {
	repo := &fakeRepo{items: summaries(5)}
	svc, _, _ := newSvc(repo)

	items, next, err := svc.List(context.Background(), ListFilter{Limit: 10})
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if len(items) != 5 {
		t.Fatalf("5개여야 하는데 %d개", len(items))
	}
	if next != "" {
		t.Fatalf("다음 페이지가 없으면 커서가 비어야 하는데 %q", next)
	}
}

func TestList_상한을_넘는_요청은_잘린다(t *testing.T) {
	repo := &fakeRepo{items: summaries(100)}
	svc, _, _ := newSvc(repo)

	if _, _, err := svc.List(context.Background(), ListFilter{Limit: 999}); err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if repo.lastList.Limit != maxLimit+1 {
		t.Fatalf("상한 %d로 잘려야 하는데 %d", maxLimit, repo.lastList.Limit-1)
	}
}

func TestList_검색어_공백은_다듬어_넘긴다(t *testing.T) {
	repo := &fakeRepo{items: summaries(1)}
	svc, _, _ := newSvc(repo)

	if _, _, err := svc.List(context.Background(), ListFilter{Query: "  벤치  "}); err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if repo.lastList.Query != "벤치" {
		t.Fatalf("검색어를 다듬어 넘겨야 하는데 %q", repo.lastList.Query)
	}
}

// ── 단건 조회 ────────────────────────────────────────────────────────────────

func TestGet_없는_종목은_NotFound(t *testing.T) {
	svc, _, _ := newSvc(&fakeRepo{byID: map[string]Exercise{}})

	_, err := svc.Get(context.Background(), "seed-없는것")

	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.NotFound {
		t.Fatalf("NotFound 도메인 오류여야 하는데 %v", err)
	}
}

// ── 커스텀 종목 생성 ─────────────────────────────────────────────────────────

func TestCreateCustom_정규화(t *testing.T) {
	// 이름의 공백은 다듬고, 근육군 중복은 없애고, 보조근에서 주동근을 뺀다.
	// (같은 근육이 양쪽에 있으면 나중에 볼륨이 두 번 세어진다)
	repo := &fakeRepo{}
	svc, _, _ := newSvc(repo)

	_, _, err := svc.CreateCustom(context.Background(), NewCustom{
		NameKo:           "  내 컬  ",
		PrimaryMuscles:   []Muscle{MuscleBiceps, MuscleBiceps},
		SecondaryMuscles: []Muscle{MuscleBiceps, MuscleForearms, MuscleForearms},
		Equipment:        EquipmentDumbbell,
	}, "")
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}

	got := repo.created[0]
	if got.NameKo != "내 컬" {
		t.Fatalf("이름 공백을 다듬어야 하는데 %q", got.NameKo)
	}
	if len(got.PrimaryMuscles) != 1 {
		t.Fatalf("주동근 중복을 없애야 하는데 %v", got.PrimaryMuscles)
	}
	if len(got.SecondaryMuscles) != 1 || got.SecondaryMuscles[0] != MuscleForearms {
		t.Fatalf("보조근에서 주동근을 빼야 하는데 %v", got.SecondaryMuscles)
	}
	// 레거시 기본값 — 지정하지 않으면 근력·외부하중이다.
	if got.Kind != KindStrength || got.LoadMode != LoadModeExternal {
		t.Fatalf("기본값이 근력·외부하중이어야 하는데 %q %q", got.Kind, got.LoadMode)
	}
}

func TestCreateCustom_공백뿐인_이름은_거절(t *testing.T) {
	// 계약의 min_len=1은 공백 한 칸을 통과시킨다 — 규칙이 한 겹 더 있어야 하는 이유다.
	svc, _, _ := newSvc(&fakeRepo{})

	_, _, err := svc.CreateCustom(context.Background(), NewCustom{
		NameKo: "   ", PrimaryMuscles: []Muscle{MuscleBiceps}, Equipment: EquipmentDumbbell,
	}, "")

	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.Validation {
		t.Fatalf("Validation 도메인 오류여야 하는데 %v", err)
	}
}

func TestCreateCustom_주동근이_없으면_거절(t *testing.T) {
	svc, _, _ := newSvc(&fakeRepo{})

	_, _, err := svc.CreateCustom(context.Background(), NewCustom{
		NameKo: "내 종목", PrimaryMuscles: []Muscle{}, Equipment: EquipmentDumbbell,
	}, "")

	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.Validation {
		t.Fatalf("Validation 도메인 오류여야 하는데 %v", err)
	}
}

func TestCreateCustom_기구가_없으면_거절(t *testing.T) {
	svc, _, _ := newSvc(&fakeRepo{})

	_, _, err := svc.CreateCustom(context.Background(), NewCustom{
		NameKo: "내 종목", PrimaryMuscles: []Muscle{MuscleBiceps},
	}, "")

	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.Validation {
		t.Fatalf("Validation 도메인 오류여야 하는데 %v", err)
	}
}

func TestCreateCustom_같은_키의_재전송은_한_번만_반영된다(t *testing.T) {
	repo := &fakeRepo{}
	svc, bus, _ := newSvc(repo)
	in := NewCustom{NameKo: "내 컬", PrimaryMuscles: []Muscle{MuscleBiceps}, Equipment: EquipmentDumbbell}

	first, replayed1, err := svc.CreateCustom(context.Background(), in, "key-1")
	if err != nil || replayed1 {
		t.Fatalf("첫 호출은 실제 반영이어야 한다 (err=%v replayed=%v)", err, replayed1)
	}
	second, replayed2, err := svc.CreateCustom(context.Background(), in, "key-1")
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}

	if !replayed2 {
		t.Fatal("두 번째 호출은 replayed여야 한다")
	}
	if len(repo.created) != 1 {
		t.Fatalf("저장소는 한 번만 불려야 하는데 %d번", len(repo.created))
	}
	if second.ID != first.ID {
		t.Fatalf("이전 결과를 그대로 돌려줘야 하는데 %q != %q", second.ID, first.ID)
	}
	// 재전송은 propagation도 하지 않는다 — 이미 그때 했다.
	if len(bus.published) != 1 {
		t.Fatalf("propagation은 한 번뿐이어야 하는데 %d번", len(bus.published))
	}
}

func TestCreateCustom_커밋_뒤에_카탈로그_주제로_알린다(t *testing.T) {
	svc, bus, _ := newSvc(&fakeRepo{})

	if _, _, err := svc.CreateCustom(context.Background(), NewCustom{
		NameKo: "내 컬", PrimaryMuscles: []Muscle{MuscleBiceps}, Equipment: EquipmentDumbbell,
	}, ""); err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}

	if len(bus.published) != 1 || bus.published[0] != CatalogTopic {
		t.Fatalf("카탈로그 주제로 한 번 알려야 하는데 %v", bus.published)
	}
}

// ── 배포(Pull) ───────────────────────────────────────────────────────────────

func fulls(n int) []Exercise {
	out := make([]Exercise, 0, n)
	for i := 0; i < n; i++ {
		out = append(out, Exercise{ID: string(rune('a' + i)), NameKo: string(rune('가' + i))})
	}
	return out
}

func TestPull_기본은_상한까지_주고_커서를_붙인다(t *testing.T) {
	repo := &fakeRepo{full: fulls(maxPullLimit + 1), rev: Revision{Count: 336}}
	svc, _, _ := newSvc(repo)

	items, next, rev, err := svc.Pull(context.Background(), "", 0)
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if len(items) != maxPullLimit {
		t.Fatalf("상한 %d개여야 하는데 %d개", maxPullLimit, len(items))
	}
	if next != items[len(items)-1].NameKo {
		t.Fatalf("커서는 마지막 항목의 name_ko여야 하는데 %q", next)
	}
	// 받는 쪽이 저장해 두고 다음에 견줄 값 — 없으면 매번 전량을 다시 내려받게 된다.
	if rev.Count != 336 {
		t.Fatalf("개정 번호를 함께 줘야 하는데 %+v", rev)
	}
}

func TestPull_상한을_넘는_요청은_잘린다(t *testing.T) {
	repo := &fakeRepo{full: fulls(10)}
	svc, _, _ := newSvc(repo)

	if _, _, _, err := svc.Pull(context.Background(), "", 9999); err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if repo.lastPull.Limit != maxPullLimit+1 {
		t.Fatalf("상한 %d로 잘려야 하는데 %d", maxPullLimit, repo.lastPull.Limit-1)
	}
}

func TestPull_마지막_페이지는_커서가_비어야_한다(t *testing.T) {
	repo := &fakeRepo{full: fulls(3)}
	svc, _, _ := newSvc(repo)

	items, next, _, err := svc.Pull(context.Background(), "", 10)
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if len(items) != 3 || next != "" {
		t.Fatalf("3개·빈 커서여야 하는데 %d개 커서=%q", len(items), next)
	}
}

// ── 보관 ─────────────────────────────────────────────────────────────────────

func TestArchive_시드_종목은_치울_수_없다(t *testing.T) {
	// 336종은 모두가 공유하는 자료다 — 한 사람의 정리가 다른 사람의 목록을 바꾸면 안 된다.
	repo := &fakeRepo{byID: map[string]Exercise{
		"seed-barbell-bench-press": {ID: "seed-barbell-bench-press", IsCustom: false},
	}}
	svc, bus, _ := newSvc(repo)

	err := svc.ArchiveCustom(context.Background(), "seed-barbell-bench-press")

	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.Validation {
		t.Fatalf("Validation 도메인 오류여야 하는데 %v", err)
	}
	if len(repo.archived) != 0 {
		t.Fatalf("저장소를 건드리지 않아야 하는데 %v", repo.archived)
	}
	if len(bus.published) != 0 {
		t.Fatalf("바뀐 것이 없으면 알리지 않아야 하는데 %v", bus.published)
	}
}

func TestArchive_커스텀_종목은_감추고_알린다(t *testing.T) {
	repo := &fakeRepo{
		byID:        map[string]Exercise{"custom-1": {ID: "custom-1", IsCustom: true}},
		archiveRows: 1,
	}
	svc, bus, _ := newSvc(repo)

	if err := svc.ArchiveCustom(context.Background(), "custom-1"); err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if len(repo.archived) != 1 || repo.archived[0] != "custom-1" {
		t.Fatalf("그 종목을 감춰야 하는데 %v", repo.archived)
	}
	if len(bus.published) != 1 || bus.published[0] != CatalogTopic {
		t.Fatalf("카탈로그 주제로 알려야 하는데 %v", bus.published)
	}
}

func TestArchive_이미_감춰졌으면_알리지_않는다(t *testing.T) {
	// 조회와 갱신 사이에 다른 요청이 먼저 감춘 경우. 결과가 같으니 성공이되, 바뀐 것이 없으니 알리지 않는다.
	repo := &fakeRepo{
		byID:        map[string]Exercise{"custom-1": {ID: "custom-1", IsCustom: true}},
		archiveRows: 0,
	}
	svc, bus, _ := newSvc(repo)

	if err := svc.ArchiveCustom(context.Background(), "custom-1"); err != nil {
		t.Fatalf("결과가 같으므로 성공이어야 하는데 %v", err)
	}
	if len(bus.published) != 0 {
		t.Fatalf("바뀐 것이 없으면 알리지 않아야 하는데 %v", bus.published)
	}
}

func TestArchive_없는_종목은_NotFound(t *testing.T) {
	svc, _, _ := newSvc(&fakeRepo{byID: map[string]Exercise{}})

	err := svc.ArchiveCustom(context.Background(), "custom-없음")

	var de *errs.DomainError
	if !errors.As(err, &de) || de.Code != errs.NotFound {
		t.Fatalf("NotFound 도메인 오류여야 하는데 %v", err)
	}
}

func TestCreateCustom_저장_실패면_알리지_않는다(t *testing.T) {
	// propagation은 **커밋 뒤에만** 한다. 실패한 변경을 알리면 구독자가 헛되이 다시 읽는다.
	repo := &fakeRepo{createErr: errs.New(errs.Conflict, "이미 있음")}
	svc, bus, _ := newSvc(repo)

	_, _, err := svc.CreateCustom(context.Background(), NewCustom{
		NameKo: "바벨 벤치프레스", PrimaryMuscles: []Muscle{MuscleChest}, Equipment: EquipmentBarbell,
	}, "")

	if err == nil {
		t.Fatal("저장소 오류가 그대로 올라와야 한다")
	}
	if len(bus.published) != 0 {
		t.Fatalf("실패했으면 알리지 않아야 하는데 %v", bus.published)
	}
}
