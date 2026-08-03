// @plm SRS-001  운동 카탈로그 RPC · 서버 스트리밍
//
// ─────────────────────────────────────────────────────────────────────────────
// 핸들러가 하는 일은 셋뿐이다: **proto ↔ 도메인 변환 · 서비스 호출 · 스트림 관리.**
// 규칙이나 SQL을 여기 쓰지 않는다. if가 늘기 시작하면 service.go로 옮긴다.
//
// 검증은 여기 없다 — 규칙을 .proto에 선언했고(protovalidate) 인터셉터가 자동으로 적용한다.
// 오류도 여기서 상태 코드로 바꾸지 않는다 — 도메인 오류를 그대로 돌려주면
// middleware/errors.go가 Connect 코드로 옮긴다(매핑이 한 곳에 있어야 채널마다 달라지지 않는다).
// ─────────────────────────────────────────────────────────────────────────────
package exercise

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	exercisev1 "github.com/JWK-company/liftgram/src/backend/gen/exercise/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/exercise/v1/exercisev1connect"
)

// 유휴 연결이 중간 프록시(보통 30~60초)에서 끊기지 않게 하는 주기.
const heartbeatInterval = 15 * time.Second

// Watcher는 스트림이 필요로 하는 것 — 구독.
type Watcher interface {
	Subscribe(fn func(name string)) (cancel func())
}

type Handler struct {
	exercisev1connect.UnimplementedExerciseServiceHandler
	svc *Service
	bus Watcher
}

func NewHandler(svc *Service, bus Watcher) *Handler {
	return &Handler{svc: svc, bus: bus}
}

func (h *Handler) GetExercise(ctx context.Context, req *connect.Request[exercisev1.GetExerciseRequest]) (*connect.Response[exercisev1.GetExerciseResponse], error) {
	ex, err := h.svc.Get(ctx, req.Msg.GetId())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&exercisev1.GetExerciseResponse{Exercise: toProto(ex)}), nil
}

func (h *Handler) ListExercises(ctx context.Context, req *connect.Request[exercisev1.ListExercisesRequest]) (*connect.Response[exercisev1.ListExercisesResponse], error) {
	items, next, err := h.svc.List(ctx, ListFilter{
		Cursor:    req.Msg.GetCursor(),
		Limit:     req.Msg.GetLimit(),
		Query:     req.Msg.GetQuery(),
		Equipment: fromProtoEquipment(req.Msg.GetEquipment()),
		Muscle:    fromProtoMuscle(req.Msg.GetMuscle()),
	})
	if err != nil {
		return nil, err
	}
	out := make([]*exercisev1.ExerciseSummary, 0, len(items))
	for _, it := range items {
		out = append(out, &exercisev1.ExerciseSummary{
			Id:             it.ID,
			NameKo:         it.NameKo,
			NameEn:         it.NameEn,
			Equipment:      toProtoEquipment(it.Equipment),
			PrimaryMuscles: toProtoMuscles(it.PrimaryMuscles),
			Kind:           toProtoKind(it.Kind),
			IsCustom:       it.IsCustom,
		})
	}
	return connect.NewResponse(&exercisev1.ListExercisesResponse{Items: out, NextCursor: next}), nil
}

func (h *Handler) PullCatalog(ctx context.Context, req *connect.Request[exercisev1.PullCatalogRequest]) (*connect.Response[exercisev1.PullCatalogResponse], error) {
	items, next, rev, err := h.svc.Pull(ctx, req.Msg.GetCursor(), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*exercisev1.Exercise, 0, len(items))
	for _, it := range items {
		out = append(out, toProto(it))
	}
	return connect.NewResponse(&exercisev1.PullCatalogResponse{
		Items:      out,
		NextCursor: next,
		Revision:   toProtoRevision(rev),
	}), nil
}

func (h *Handler) CreateCustomExercise(ctx context.Context, req *connect.Request[exercisev1.CreateCustomExerciseRequest]) (*connect.Response[exercisev1.CreateCustomExerciseResponse], error) {
	ex, replayed, err := h.svc.CreateCustom(ctx, NewCustom{
		NameKo:           req.Msg.GetNameKo(),
		PrimaryMuscles:   fromProtoMuscles(req.Msg.GetPrimaryMuscles()),
		SecondaryMuscles: fromProtoMuscles(req.Msg.GetSecondaryMuscles()),
		Equipment:        fromProtoEquipment(req.Msg.GetEquipment()),
		Kind:             fromProtoKind(req.Msg.GetKind()),
		LoadMode:         fromProtoLoadMode(req.Msg.GetLoadMode()),
	}, req.Msg.GetIdempotencyKey())
	if err != nil {
		return nil, err
	}
	res := connect.NewResponse(&exercisev1.CreateCustomExerciseResponse{Exercise: toProto(ex), Replayed: replayed})
	// 헤더로도 알려 준다 — 프록시 로그나 curl로 확인할 때 본문을 파싱하지 않아도 되게.
	res.Header().Set("X-Idempotent-Replay", boolStr(replayed))
	return res, nil
}

func (h *Handler) ArchiveCustomExercise(ctx context.Context, req *connect.Request[exercisev1.ArchiveCustomExerciseRequest]) (*connect.Response[exercisev1.ArchiveCustomExerciseResponse], error) {
	if err := h.svc.ArchiveCustom(ctx, req.Msg.GetId()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&exercisev1.ArchiveCustomExerciseResponse{}), nil
}

// WatchCatalog는 붙자마자 스냅샷 하나를 보내고, 이후 변경마다 델타를 보낸다.
// 재연결하면 다시 스냅샷부터 — 끊긴 사이의 변화가 저절로 메워지므로 이벤트 재생이 필요 없다.
func (h *Handler) WatchCatalog(ctx context.Context, _ *connect.Request[exercisev1.WatchCatalogRequest], stream *connect.ServerStream[exercisev1.WatchCatalogResponse]) error {
	// ── 순서가 중요하다: **구독 먼저, 스냅샷 나중.** ───────────────────────────
	// 반대로 하면 스냅샷을 보낸 뒤 구독을 걸기까지의 틈에 일어난 변경이 **영원히 유실된다**
	// (그 뒤로 아무 일도 없으면 화면은 낡은 값에 멈춘 채 "connected"로 남는다).
	// 이 순서라면 그 틈의 변경은 구독이 잡아 delta로 나가고, 스냅샷과 겹치더라도
	// 받는 쪽이 최신값을 다시 읽으므로 값이 어긋나지 않는다.
	//
	// 채널에 여유를 두는 이유: 전송이 늦어도 발행 쪽을 막지 않기 위해서다. 가득 차면 버린다 —
	// 다음 알림이나 재연결 스냅샷이 덮으므로 정확성이 깨지지 않는다.
	changed := make(chan struct{}, 8)
	cancel := h.bus.Subscribe(func(topic string) {
		if topic != CatalogTopic {
			return // 다른 주제의 변경은 이 스트림과 무관
		}
		select {
		case changed <- struct{}{}:
		default:
		}
	})
	defer cancel() // 해제를 잊으면 연결이 끊긴 뒤에도 구독자가 남는다

	// 구독이 걸린 뒤의 스냅샷 — 이 한 번이 "구독 이전"의 모든 변화를 덮는다.
	snap, err := h.svc.Revision(ctx)
	if err != nil {
		return err
	}
	last := snap
	if err := stream.Send(&exercisev1.WatchCatalogResponse{
		Kind:     exercisev1.WatchCatalogResponse_KIND_SNAPSHOT,
		Revision: toProtoRevision(snap),
	}); err != nil {
		return err
	}

	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			// 클라이언트가 끊었다. 정상 종료다.
			return nil
		case <-changed:
			rev, err := h.svc.Revision(ctx)
			if err != nil {
				continue // 조회 실패는 다음 알림에서 만회한다 — 스트림을 끊지 않는다
			}
			last = rev
			if err := stream.Send(&exercisev1.WatchCatalogResponse{
				Kind:     exercisev1.WatchCatalogResponse_KIND_DELTA,
				Revision: toProtoRevision(rev),
			}); err != nil {
				return err
			}
		case <-ticker.C:
			// 하트비트는 직전 개정 번호를 그대로 싣는다 — 받는 쪽이 "값이 사라졌다"고 오해하지 않게.
			if err := stream.Send(&exercisev1.WatchCatalogResponse{
				Kind:     exercisev1.WatchCatalogResponse_KIND_HEARTBEAT,
				Revision: toProtoRevision(last),
			}); err != nil {
				return err
			}
		}
	}
}

// ── 변환 ─────────────────────────────────────────────────────────────────────
// 도메인 타입과 계약 타입을 잇는 유일한 자리. 여기 말고 다른 곳에서 proto 타입을 쓰지 않는다.
//
// 두 어휘가 문자 그대로 같아서(barbell ↔ EQUIPMENT_BARBELL) 표로 옮기면 끝난다.
// enum 값을 늘리면 여기 표가 컴파일은 통과하되 UNSPECIFIED로 떨어지므로, 아래 표를 함께 늘린다.

var equipmentToProto = map[Equipment]exercisev1.Equipment{
	EquipmentBarbell:    exercisev1.Equipment_EQUIPMENT_BARBELL,
	EquipmentDumbbell:   exercisev1.Equipment_EQUIPMENT_DUMBBELL,
	EquipmentMachine:    exercisev1.Equipment_EQUIPMENT_MACHINE,
	EquipmentCable:      exercisev1.Equipment_EQUIPMENT_CABLE,
	EquipmentBodyweight: exercisev1.Equipment_EQUIPMENT_BODYWEIGHT,
	EquipmentKettlebell: exercisev1.Equipment_EQUIPMENT_KETTLEBELL,
	EquipmentBand:       exercisev1.Equipment_EQUIPMENT_BAND,
	EquipmentSmith:      exercisev1.Equipment_EQUIPMENT_SMITH,
	EquipmentOther:      exercisev1.Equipment_EQUIPMENT_OTHER,
}

var muscleToProto = map[Muscle]exercisev1.Muscle{
	MuscleChest:      exercisev1.Muscle_MUSCLE_CHEST,
	MuscleBack:       exercisev1.Muscle_MUSCLE_BACK,
	MuscleShoulders:  exercisev1.Muscle_MUSCLE_SHOULDERS,
	MuscleBiceps:     exercisev1.Muscle_MUSCLE_BICEPS,
	MuscleTriceps:    exercisev1.Muscle_MUSCLE_TRICEPS,
	MuscleForearms:   exercisev1.Muscle_MUSCLE_FOREARMS,
	MuscleQuads:      exercisev1.Muscle_MUSCLE_QUADS,
	MuscleHamstrings: exercisev1.Muscle_MUSCLE_HAMSTRINGS,
	MuscleGlutes:     exercisev1.Muscle_MUSCLE_GLUTES,
	MuscleCalves:     exercisev1.Muscle_MUSCLE_CALVES,
	MuscleAbs:        exercisev1.Muscle_MUSCLE_ABS,
	MuscleTraps:      exercisev1.Muscle_MUSCLE_TRAPS,
	MuscleFullBody:   exercisev1.Muscle_MUSCLE_FULL_BODY,
	MuscleOther:      exercisev1.Muscle_MUSCLE_OTHER,
}

var (
	equipmentFromProto = invert(equipmentToProto)
	muscleFromProto    = invert(muscleToProto)
)

func invert[D comparable, P comparable](m map[D]P) map[P]D {
	out := make(map[P]D, len(m))
	for d, p := range m {
		out[p] = d
	}
	return out
}

func toProto(e Exercise) *exercisev1.Exercise {
	return &exercisev1.Exercise{
		Id:               e.ID,
		NameKo:           e.NameKo,
		NameEn:           e.NameEn,
		PrimaryMuscles:   toProtoMuscles(e.PrimaryMuscles),
		SecondaryMuscles: toProtoMuscles(e.SecondaryMuscles),
		Equipment:        toProtoEquipment(e.Equipment),
		Kind:             toProtoKind(e.Kind),
		LoadMode:         toProtoLoadMode(e.LoadMode),
		SubstituteIds:    e.SubstituteIDs,
		ImageUrl:         e.ImageURL,
		IsCustom:         e.IsCustom,
		UpdatedAt:        timestamppb.New(e.UpdatedAt),
	}
}

func toProtoRevision(r Revision) *exercisev1.CatalogRevision {
	return &exercisev1.CatalogRevision{Count: r.Count, UpdatedAt: timestamppb.New(r.UpdatedAt)}
}

func toProtoEquipment(e Equipment) exercisev1.Equipment { return equipmentToProto[e] }

func fromProtoEquipment(e exercisev1.Equipment) Equipment { return equipmentFromProto[e] }

func toProtoMuscles(in []Muscle) []exercisev1.Muscle {
	out := make([]exercisev1.Muscle, 0, len(in))
	for _, m := range in {
		out = append(out, muscleToProto[m])
	}
	return out
}

func fromProtoMuscles(in []exercisev1.Muscle) []Muscle {
	out := make([]Muscle, 0, len(in))
	for _, m := range in {
		if d, ok := muscleFromProto[m]; ok {
			out = append(out, d)
		}
	}
	return out
}

func fromProtoMuscle(m exercisev1.Muscle) Muscle { return muscleFromProto[m] }

func toProtoKind(k Kind) exercisev1.ExerciseKind {
	if k == KindCardio {
		return exercisev1.ExerciseKind_EXERCISE_KIND_CARDIO
	}
	return exercisev1.ExerciseKind_EXERCISE_KIND_STRENGTH
}

func fromProtoKind(k exercisev1.ExerciseKind) Kind {
	if k == exercisev1.ExerciseKind_EXERCISE_KIND_CARDIO {
		return KindCardio
	}
	// UNSPECIFIED는 근력으로 본다 — 본문에 종류를 적지 않고 부르는 것을 허용하기 위한 기본값이다.
	return KindStrength
}

func toProtoLoadMode(l LoadMode) exercisev1.LoadMode {
	switch l {
	case LoadModeAssisted:
		return exercisev1.LoadMode_LOAD_MODE_ASSISTED
	case LoadModeBodyweight:
		return exercisev1.LoadMode_LOAD_MODE_BODYWEIGHT
	default:
		return exercisev1.LoadMode_LOAD_MODE_EXTERNAL
	}
}

func fromProtoLoadMode(l exercisev1.LoadMode) LoadMode {
	switch l {
	case exercisev1.LoadMode_LOAD_MODE_ASSISTED:
		return LoadModeAssisted
	case exercisev1.LoadMode_LOAD_MODE_BODYWEIGHT:
		return LoadModeBodyweight
	default:
		return LoadModeExternal
	}
}

func boolStr(b bool) string {
	if b {
		return "true"
	}
	return "false"
}
