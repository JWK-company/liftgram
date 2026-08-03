// @plm SRS-001  운동 카탈로그 규칙 — Connect도 proto도 pgx도 import하지 않는다 (레이어 경계)
//
// ─────────────────────────────────────────────────────────────────────────────
// 이 파일의 책임: **도메인 규칙**. "무엇이 허용되고 무엇이 어긋난 상태인가"만 안다.
//
// 의존은 생성자 인자로만 들어온다 — 그래서 RPC·WebSocket·배치 어디서든 같은 함수를 부를 수 있고,
// 테스트는 DB도 서버도 없이 돈다(service_test.go — 가짜 Repo 주입).
//
// 저장소 오류(행 없음·unique 충돌)를 여기서 해석하지 않는다. repo.go가 도메인 오류로 옮겨 주므로
// 이 파일은 pgx를 모른다 — CLAUDE.md가 약속한 경계 그대로다.
// ─────────────────────────────────────────────────────────────────────────────
package exercise

import (
	"context"
	"encoding/json"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

const (
	// 목록 한 페이지의 상한. 요청이 더 크게 달라고 해도 여기서 잘린다.
	maxLimit     = 50
	defaultLimit = 20

	// 카탈로그가 바뀐 사실을 싣는 propagation 주제. 값이 아니라 **주제 이름만** 나간다 —
	// 받는 쪽이 개정 번호를 다시 읽으므로 메시지 순서가 뒤바뀌어도 낡은 목록이 남지 않는다.
	CatalogTopic = "catalog"

	// 커스텀 종목 하나가 가질 수 있는 근육군 수. 계약(proto)에도 같은 상한이 있고,
	// 여기 한 번 더 두는 이유는 RPC가 아닌 경로(배치·이관)로 들어와도 규칙이 지켜지게 하기 위해서다.
	maxPrimaryMuscles   = 4
	maxSecondaryMuscles = 6
)

// ── 도메인 어휘 ──────────────────────────────────────────────────────────────
// 계약(proto)은 enum, 저장소는 text, 도메인은 이 문자열 타입이다. 세 층의 값이 **문자 그대로 같아서**
// 변환이 단순하고, app/의 로컬 스키마와도 표현이 같아 이행 중 대조가 쉽다.

type Equipment string

const (
	EquipmentBarbell    Equipment = "barbell"
	EquipmentDumbbell   Equipment = "dumbbell"
	EquipmentMachine    Equipment = "machine"
	EquipmentCable      Equipment = "cable"
	EquipmentBodyweight Equipment = "bodyweight"
	EquipmentKettlebell Equipment = "kettlebell"
	EquipmentBand       Equipment = "band"
	EquipmentSmith      Equipment = "smith"
	EquipmentOther      Equipment = "other"
)

type Muscle string

const (
	MuscleChest      Muscle = "chest"
	MuscleBack       Muscle = "back"
	MuscleShoulders  Muscle = "shoulders"
	MuscleBiceps     Muscle = "biceps"
	MuscleTriceps    Muscle = "triceps"
	MuscleForearms   Muscle = "forearms"
	MuscleQuads      Muscle = "quads"
	MuscleHamstrings Muscle = "hamstrings"
	MuscleGlutes     Muscle = "glutes"
	MuscleCalves     Muscle = "calves"
	MuscleAbs        Muscle = "abs"
	MuscleTraps      Muscle = "traps"
	MuscleFullBody   Muscle = "fullBody"
	MuscleOther      Muscle = "other"
)

// 종목 종류 — 근력(무게×횟수) vs 유산소(시간·거리).
type Kind string

const (
	KindStrength Kind = "strength"
	KindCardio   Kind = "cardio"
)

// 하중 모드 — 볼륨 계산에서 세트 무게가 갖는 의미.
type LoadMode string

const (
	LoadModeExternal   LoadMode = "external"
	LoadModeAssisted   LoadMode = "assisted"
	LoadModeBodyweight LoadMode = "bodyweight"
)

// Exercise는 도메인이 다루는 모양이다. proto의 메시지가 아니라 **우리 타입**이다 —
// 계약이 바뀌어도 규칙은 그대로 두기 위해서다(변환은 handler.go가 한다).
type Exercise struct {
	ID               string
	NameKo           string
	NameEn           string // "" = 없음(커스텀 종목)
	PrimaryMuscles   []Muscle
	SecondaryMuscles []Muscle
	Equipment        Equipment
	Kind             Kind
	LoadMode         LoadMode
	SubstituteIDs    []string
	ImageURL         string
	IsCustom         bool
	UpdatedAt        time.Time
}

// Summary는 목록이 보는 것. 상세 전용 필드를 빼서 336종을 실어도 가볍다.
type Summary struct {
	ID             string
	NameKo         string
	NameEn         string
	Equipment      Equipment
	PrimaryMuscles []Muscle
	Kind           Kind
	IsCustom       bool
}

// Revision은 카탈로그의 현재 상태를 한 줄로 요약한 것이다. 두 값이 같으면 다시 읽을 필요가 없다.
type Revision struct {
	Count     int64
	UpdatedAt time.Time
}

// ListFilter의 빈 값은 "필터 없음"이다.
type ListFilter struct {
	Cursor    string
	Limit     int32
	Query     string
	Equipment Equipment
	Muscle    Muscle
}

// NewCustom은 사용자가 만든 종목의 입력이다.
type NewCustom struct {
	NameKo           string
	PrimaryMuscles   []Muscle
	SecondaryMuscles []Muscle
	Equipment        Equipment
	Kind             Kind
	LoadMode         LoadMode
}

// Repo는 이 도메인이 저장소에 요구하는 것 전부다.
// 인터페이스를 **쓰는 쪽(여기)** 에 두는 것이 Go의 관례다 — 테스트에서 가짜를 끼우기 쉽다.
type Repo interface {
	// GetByID는 없으면 errs.NotFound를 돌려준다(저장소 오류를 도메인 오류로 옮기는 것은 repo의 일이다).
	GetByID(ctx context.Context, id string) (Exercise, error)
	ListAfter(ctx context.Context, f ListFilter) ([]Summary, error)
	// PullAfter는 배포용이라 요약이 아니라 종목 전부를 돌려준다.
	PullAfter(ctx context.Context, cursor string, limit int32) ([]Exercise, error)
	// CreateCustom은 이름이 이미 있으면 errs.Conflict를 돌려준다.
	CreateCustom(ctx context.Context, id string, in NewCustom) (Exercise, error)
	// Archive는 감춘 행 수를 돌려준다. 0이면 없거나 이미 감춰졌거나 시드다.
	Archive(ctx context.Context, id string) (int64, error)
	Revision(ctx context.Context) (Revision, error)
}

// Bus는 "바뀌었다"는 사실을 프로세스 밖으로 옮긴다. 값이 아니라 주제 이름만 나간다.
type Bus interface {
	Publish(ctx context.Context, name string) error
}

// Idempotency는 같은 키의 재전송을 한 번만 반영하기 위한 기억 장치다.
type Idempotency interface {
	Seen(ctx context.Context, key string) (string, bool, error)
	Remember(ctx context.Context, key, value string) error
}

// IDGen은 커스텀 종목의 id를 만든다. 주입받는 이유는 테스트를 결정적으로 만들기 위해서다.
type IDGen func() string

type Service struct {
	repo  Repo
	bus   Bus
	idem  Idempotency
	newID IDGen
}

func NewService(repo Repo, bus Bus, idem Idempotency, newID IDGen) *Service {
	return &Service{repo: repo, bus: bus, idem: idem, newID: newID}
}

// Get은 있는 것만 돌려준다. 카운터와 달리 "없으면 만들어 준다"가 성립하지 않는다 —
// 카탈로그는 큐레이션된 자료라 빈 종목을 만들어 내면 그게 곧 오염이다.
func (s *Service) Get(ctx context.Context, id string) (Exercise, error) {
	return s.repo.GetByID(ctx, id)
}

// List는 커서 페이지네이션이다. limit+1개를 읽어 "다음 페이지가 있는지"를
// 추가 쿼리 없이 판단한다(초과분은 잘라 버린다).
func (s *Service) List(ctx context.Context, f ListFilter) ([]Summary, string, error) {
	take := f.Limit
	if take <= 0 {
		take = defaultLimit
	}
	if take > maxLimit {
		take = maxLimit
	}

	q := f
	q.Query = strings.TrimSpace(f.Query)
	q.Limit = take + 1

	rows, err := s.repo.ListAfter(ctx, q)
	if err != nil {
		return nil, "", err
	}
	if int32(len(rows)) > take {
		items := rows[:take]
		// 커서는 정렬 키(name_ko)를 그대로 싣는다 — unique라 다음 페이지가 겹치거나 건너뛰지 않는다.
		return items, items[len(items)-1].NameKo, nil
	}
	return rows, "", nil
}

// 배포로 한 번에 내려보낼 수 있는 최대 개수. 목록(50)보다 크다 — 336종을 몇 번에 끝내기 위해서다.
const maxPullLimit = 500

// Pull은 기기가 로컬 저장소를 세울 때 쓰는 배포 경로다.
//
// 개정 번호를 **함께** 돌려준다. 받는 쪽이 그 값을 저장해 두었다가 다음에 견주면
// 바뀌지 않은 카탈로그를 다시 내려받지 않는다(ADR-002 — 읽기 정본은 로컬이고 서버는 배포 채널).
func (s *Service) Pull(ctx context.Context, cursor string, limit int32) ([]Exercise, string, Revision, error) {
	take := limit
	if take <= 0 {
		take = maxPullLimit
	}
	if take > maxPullLimit {
		take = maxPullLimit
	}

	rows, err := s.repo.PullAfter(ctx, cursor, take+1)
	if err != nil {
		return nil, "", Revision{}, err
	}

	// 개정 번호는 **목록을 읽기 전에** 정해져야 옳지만, 한 트랜잭션이 아니므로 그 사이에
	// 카탈로그가 바뀔 수 있다. 그때는 다음 페이지에서 개정 번호가 달라지므로,
	// 받는 쪽이 "페이지마다 개정 번호가 같은가"로 알아채고 처음부터 다시 받으면 된다.
	rev, err := s.repo.Revision(ctx)
	if err != nil {
		return nil, "", Revision{}, err
	}

	if int32(len(rows)) > take {
		items := rows[:take]
		return items, items[len(items)-1].NameKo, rev, nil
	}
	return rows, "", rev, nil
}

// Revision은 구독자가 "다시 읽어야 하는가"를 판단할 근거다.
func (s *Service) Revision(ctx context.Context) (Revision, error) {
	return s.repo.Revision(ctx)
}

// CreateCustom은 이 도메인의 쓰기 규칙이 모이는 자리다.
//
//	정규화       이름 공백 정리 · 근육군 중복 제거 · 보조근에서 주동근 제외
//	idempotency  같은 키로 다시 오면 저장소를 건드리지 않고 이전 결과를 돌려준다(propagation도 하지 않는다 — 이미 그때 했다)
//	propagation  **커밋 뒤에만** 한다. 순서가 뒤집히면 구독자가 옛 카탈로그를 읽는다
//
// 주의(이행 중 한계): 지금은 커스텀 종목에 소유자가 없다 — 만든 종목이 카탈로그 전체에 보인다.
// 계정(SRS-006)이 이 스택으로 넘어오면 owner_user_id를 더하고 이름 유일성을 소유자별로 좁힌다.
func (s *Service) CreateCustom(ctx context.Context, in NewCustom, idemKey string) (ex Exercise, replayed bool, err error) {
	norm, err := normalize(in)
	if err != nil {
		return Exercise{}, false, err
	}

	cacheKey := "custom:" + norm.NameKo + ":" + idemKey
	if idemKey != "" {
		if raw, ok, err := s.idem.Seen(ctx, cacheKey); err == nil && ok {
			var cached Exercise
			if json.Unmarshal([]byte(raw), &cached) == nil {
				return cached, true, nil
			}
		}
	}

	created, err := s.repo.CreateCustom(ctx, s.newID(), norm)
	if err != nil {
		return Exercise{}, false, err
	}

	if idemKey != "" {
		if blob, err := json.Marshal(created); err == nil {
			_ = s.idem.Remember(ctx, cacheKey, string(blob))
		}
	}

	if err := s.bus.Publish(ctx, CatalogTopic); err != nil {
		// propagation 실패가 이미 커밋된 변경을 되돌리지는 않는다.
		// 화면은 다음 알림이나 재연결 스냅샷으로 따라잡는다.
		return created, false, nil
	}
	return created, false, nil
}

// ArchiveCustom은 사용자가 만든 종목을 감춘다.
//
// 기본 카탈로그(시드)는 감출 수 없다 — 336종은 모두가 공유하는 자료라 한 사람의 정리가
// 다른 사람의 목록을 바꾸면 안 된다. 지우지 않고 감추는 이유는 그 종목으로 남긴 기록이
// 가리킬 곳을 잃지 않게 하기 위해서다.
func (s *Service) ArchiveCustom(ctx context.Context, id string) error {
	ex, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err // 없으면 NotFound가 그대로 올라온다
	}
	if !ex.IsCustom {
		return errs.New(errs.Validation, "기본 카탈로그 종목은 치울 수 없습니다")
	}

	n, err := s.repo.Archive(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		// 조회와 갱신 사이에 다른 요청이 먼저 감췄다. 결과가 같으므로 성공으로 본다 —
		// 다만 아무것도 바뀌지 않았으니 알리지는 않는다.
		return nil
	}

	if err := s.bus.Publish(ctx, CatalogTopic); err != nil {
		return nil // propagation 실패가 이미 커밋된 변경을 되돌리지는 않는다
	}
	return nil
}

// normalize는 저장 전에 입력을 다듬고, 다듬어도 성립하지 않는 것만 거절한다.
// 모양 검사(길이·개수)는 계약이 이미 했다 — 여기 있는 것은 **계약이 표현할 수 없는 규칙**이다.
func normalize(in NewCustom) (NewCustom, error) {
	out := in
	out.NameKo = strings.TrimSpace(in.NameKo)
	if out.NameKo == "" {
		// 계약의 min_len=1은 공백 한 칸을 통과시킨다. 이름이 공백뿐인 종목은 목록에서 찾을 수 없다.
		return NewCustom{}, errs.New(errs.Validation, "종목 이름이 비어 있습니다")
	}
	if in.Equipment == "" {
		return NewCustom{}, errs.New(errs.Validation, "기구를 지정해야 합니다")
	}

	out.PrimaryMuscles = dedupeMuscles(in.PrimaryMuscles)
	if len(out.PrimaryMuscles) == 0 {
		return NewCustom{}, errs.New(errs.Validation, "주동근을 하나 이상 지정해야 합니다")
	}
	if len(out.PrimaryMuscles) > maxPrimaryMuscles {
		return NewCustom{}, errs.New(errs.Validation, "주동근은 최대 %d개입니다", maxPrimaryMuscles)
	}

	// 보조근에서 주동근을 뺀다 — 같은 근육이 양쪽에 있으면 볼륨이 두 번 세어진다.
	primary := make(map[Muscle]bool, len(out.PrimaryMuscles))
	for _, m := range out.PrimaryMuscles {
		primary[m] = true
	}
	secondary := make([]Muscle, 0, len(in.SecondaryMuscles))
	for _, m := range dedupeMuscles(in.SecondaryMuscles) {
		if !primary[m] {
			secondary = append(secondary, m)
		}
	}
	if len(secondary) > maxSecondaryMuscles {
		return NewCustom{}, errs.New(errs.Validation, "보조근은 최대 %d개입니다", maxSecondaryMuscles)
	}
	out.SecondaryMuscles = secondary

	if out.Kind == "" {
		out.Kind = KindStrength
	}
	if out.LoadMode == "" {
		out.LoadMode = LoadModeExternal
	}
	return out, nil
}

func dedupeMuscles(in []Muscle) []Muscle {
	seen := make(map[Muscle]bool, len(in))
	out := make([]Muscle, 0, len(in))
	for _, m := range in {
		if m == "" || seen[m] {
			continue
		}
		seen[m] = true
		out = append(out, m)
	}
	return out
}
