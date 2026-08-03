// @plm SRS-009  도메인 모듈 제너레이터 — 레퍼런스와 같은 모양을 한 번에 만든다
//
// ─────────────────────────────────────────────────────────────────────────────
// 사용:  make gen NAME=order SRS=SRS-014     (요구 번호를 알면 함께 준다 — 권장)
//        make gen NAME=order                 (번호를 모르면 placeholder로 두되, verify가 채우라고 막는다)
//
// 만드는 것 — 계약(proto) · SQL · Go 한 벌이다(ADR-011):
//   proto/<name>/v1/<name>.proto                 계약 — 여기가 single source of truth
//   database/queries/<name>.sql      SQL만 (sqlc가 Go를 생성한다)
//   backend/internal/<name>/service.go          규칙만 — connect도 proto도 pgx도 모른다
//   backend/internal/<name>/service_test.go     가짜 저장소 주입 — DB·서버 없이 도는 테스트
//   backend/internal/<name>/repo.go             sqlc 생성물 → 도메인 타입 변환
//   backend/internal/<name>/handler.go          Connect 핸들러(unary)
//   database/migrations/NNNN_create_<name>s.sql  테이블
// 고치는 것:
//   backend/cmd/server/main.go                  composition root에 네 줄(이미 있으면 건너뜀)
//
// 생성 직후 이 순서로 하면 그대로 동작한다:
//   make proto && make sqlc && make migrate && make verify
//
// 생성물은 카운터 모듈과 **같은 경계**를 따른다 — 그게 이 제너레이터의 목적이다.
// 화면이 필요하면 이어서 `make gen-page NAME=<이름> MODULE=<복수형>`.
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const raw = process.argv[2];
if (!raw) {
  console.error("이름을 주세요.  예: make gen NAME=order");
  process.exit(1);
}
const name = raw.trim().toLowerCase();
if (!/^[a-z][a-z0-9]*$/.test(name)) {
  console.error(`'${raw}' 는 쓸 수 없습니다 — 소문자 영문·숫자만(단수형 권장). 예: order, invoice`);
  process.exit(1);
}
const Name = name[0].toUpperCase() + name.slice(1); // Order
// 요구 번호 — 있으면 @plm 주석에 바로 박는다. 없으면 placeholder를 남기고, make verify가 그것을 잡는다.
// (placeholder를 방치하면 codescan이 이 코드를 추적하지 못해 G3 게이트에 구멍이 생긴다)
const srs = (process.argv[3] ?? process.env.SRS ?? "").trim();
if (srs && !/^[A-Z]{2,6}-\d{3}$/.test(srs)) {
  console.error(`'${srs}' 는 요구 번호 형식이 아닙니다 — 예: SRS-014`);
  process.exit(1);
}
const PLM = srs || "<SRS-코드>";
const plural = `${name}s`; // orders
const root = process.cwd();
const API = "backend";
const DB = "database"; // 사람이 쓰는 SQL(마이그레이션·쿼리)이 사는 곳
const made = [];
const skipped = [];

async function write(rel, body) {
  const abs = path.join(root, rel);
  if (existsSync(abs)) {
    skipped.push(rel);
    return;
  }
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, body);
  made.push(rel);
}

// ── 1. 계약(proto) — 여기가 single source of truth이다 ────────────────────────────────────
await write(
  `proto/${name}/v1/${name}.proto`,
  `// @plm ${PLM}  ${Name} 계약 — frontend와 backend가 함께 보는 single source of truth
//
// buf가 이 한 장에서 두 벌을 생성한다(make proto):
//     backend/gen/…            Go 타입 + Connect 핸들러 인터페이스
//     contracts/gen/…  TypeScript 타입 + 브라우저 클라이언트
// 검증 규칙도 여기 선언한다(protovalidate) — 서버는 인터셉터가 자동으로 적용한다.
syntax = "proto3";

package ${name}.v1;

import "buf/validate/validate.proto";
import "google/protobuf/timestamp.proto";

option go_package = "github.com/JWK-company/liftgram/src/backend/gen/${name}/v1;${name}v1";

message ${Name} {
  string id = 1;
  string name = 2;
  string status = 3;
  google.protobuf.Timestamp updated_at = 4;
}

message Get${Name}Request {
  // 이름은 URL과 propagation 메시지에 그대로 실린다 — 그래서 좁게 잡는다.
  string name = 1 [(buf.validate.field).string = {
    min_len: 1,
    max_len: 64,
    pattern: "^[A-Za-z0-9._-]+$"
  }];
}
message Get${Name}Response { ${Name} ${name} = 1; }

message List${Name}sRequest {
  string cursor = 1 [(buf.validate.field).string = {max_len: 64}];
  // 잘못된 값은 조용히 고치지 않고 거절한다.
  int32 limit = 2 [(buf.validate.field).int32 = {gte: 0, lte: 50}];
}
message ${Name}Summary {
  string name = 1;
  string status = 2;
}
message List${Name}sResponse {
  repeated ${Name}Summary items = 1;
  string next_cursor = 2;
}

message Advance${Name}Request {
  string name = 1 [(buf.validate.field).string = {
    min_len: 1,
    max_len: 64,
    pattern: "^[A-Za-z0-9._-]+$"
  }];
  string status = 2 [(buf.validate.field).string = {min_len: 1, max_len: 32}];
}
message Advance${Name}Response { ${Name} ${name} = 1; }

service ${Name}Service {
  // 단건 조회 — 없으면 만들어 준다(첫 진입에서 404를 보지 않게 하는 의도적 선택).
  rpc Get${Name}(Get${Name}Request) returns (Get${Name}Response) {}
  rpc List${Name}s(List${Name}sRequest) returns (List${Name}sResponse) {}
  // 상태 전이. 규칙(허용되지 않는 전이 거절·커밋 뒤 propagation)은 서버의 service가 지킨다.
  rpc Advance${Name}(Advance${Name}Request) returns (Advance${Name}Response) {}
}
`,
);

// ── 2. 마이그레이션 ──────────────────────────────────────────────────────────
const migDir = path.join(root, DB, "migrations");
const nextNum = String(readdirSync(migDir).filter((f) => f.endsWith(".sql")).length).padStart(4, "0");
await write(
  `${DB}/migrations/${nextNum}_create_${plural}.sql`,
  `-- @plm ${PLM}  ${plural} 테이블
--
-- 규칙: 재실행해도 결과가 같도록 IF NOT EXISTS 를 쓴다.
-- 한 번 적용된 파일은 고치지 않는다 — 새 파일을 만든다(이미 적용한 환경이 따라오지 못한다).
-- 이 디렉터리는 sqlc가 **schema의 source of truth**으로도 읽는다(sqlc.yaml) — 정의가 두 곳에 생기지 않는다.

CREATE TABLE IF NOT EXISTS ${plural} (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 논리 식별자 — URL과 propagation 메시지에서 이 값을 쓴다(커서 정렬 키라 unique).
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft',
  updated_at timestamptz NOT NULL DEFAULT now()
);
`,
);

// ── 3. SQL 쿼리(sqlc 입력) ───────────────────────────────────────────────────
await write(
  `${DB}/queries/${name}.sql`,
  `-- @plm ${PLM}  ${Name} 쿼리 — 여기 있는 것은 SQL뿐이다
--
-- 규칙(무엇이 허용되는가)은 internal/${name}/service.go가 안다.
-- 예외는 원자성을 위해 SQL 안에 들어가야 하는 것뿐이다.

-- name: Get${Name}ByName :one
SELECT id, name, status, updated_at FROM ${plural} WHERE name = $1;

-- name: Ensure${Name} :exec
INSERT INTO ${plural} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING;

-- 상태 전이는 한 문장으로 — 읽고-쓰기 사이에 다른 요청이 끼어들 틈을 만들지 않는다.
-- name: Set${Name}Status :one
UPDATE ${plural} SET status = @status, updated_at = now() WHERE name = @name
RETURNING id, name, status, updated_at;

-- 커서 페이지네이션 — 정렬 키(name)가 unique여야 커서가 흔들리지 않는다.
-- name: List${Name}sAfter :many
SELECT name, status FROM ${plural}
WHERE (@cursor::text = '' OR name > @cursor::text)
ORDER BY name
LIMIT @lim;
`,
);

// ── 4. 도메인 규칙 ───────────────────────────────────────────────────────────
await write(
  `${API}/internal/${name}/service.go`,
  `// @plm ${PLM}  ${Name} 규칙 — Connect도 proto도 HTTP도 import하지 않는다 (레이어 경계)
//
// 이 파일의 책임: **도메인 규칙**. "무엇이 허용되고 무엇이 어긋난 상태인가"만 안다.
// 의존은 생성자 인자로만 들어온다 — 그래서 RPC·WebSocket·배치 어디서든 같은 함수를 부를 수 있고,
// 테스트는 DB도 서버도 없이 돈다(service_test.go).
//
// 이 경계를 지키는 것이 이 템플릿의 핵심이다. 여기에 connect.Request가 등장하는 순간
// 규칙을 테스트하려면 서버를 띄워야 하고, 규칙이 전송 방식에 묶인다.
package ${name}

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// 목록 한 페이지의 상한. 요청이 더 크게 달라고 해도 여기서 잘린다.
const maxLimit = 50

// ${Name}은 도메인이 다루는 모양이다. proto의 메시지가 아니라 **우리 타입**이다 —
// 계약이 바뀌어도 규칙은 그대로 두기 위해서다(변환은 handler.go가 한다).
type ${Name} struct {
	ID        string
	Name      string
	Status    string
	UpdatedAt time.Time
}

type Summary struct {
	Name   string
	Status string
}

// Repo는 이 도메인이 저장소에 요구하는 것 전부다.
// 인터페이스를 **쓰는 쪽(여기)** 에 두는 것이 Go의 관례다 — 테스트에서 가짜를 끼우기 쉽다.
type Repo interface {
	GetByName(ctx context.Context, name string) (${Name}, error)
	Ensure(ctx context.Context, name string) error
	SetStatus(ctx context.Context, name, status string) (${Name}, error)
	ListAfter(ctx context.Context, cursor string, limit int32) ([]Summary, error)
}

// Bus는 "바뀌었다"는 사실을 프로세스 밖으로 옮긴다. 값이 아니라 이름만 나간다.
type Bus interface {
	Publish(ctx context.Context, name string) error
}

type Service struct {
	repo Repo
	bus  Bus
}

func NewService(repo Repo, bus Bus) *Service {
	return &Service{repo: repo, bus: bus}
}

func (s *Service) Get(ctx context.Context, name string) (${Name}, error) {
	row, err := s.repo.GetByName(ctx, name)
	if errors.Is(err, pgx.ErrNoRows) {
		return ${Name}{}, errs.New(errs.NotFound, "${name} '%s' 없음", name)
	}
	if err != nil {
		return ${Name}{}, err
	}
	return row, nil
}

// GetOrCreate는 없으면 만들어 준다 — 화면 첫 진입에서 404를 보지 않게 하는 **의도적 선택**이다.
// (도메인에 따라 이게 틀린 선택일 수 있다. 그때는 여기만 고친다)
func (s *Service) GetOrCreate(ctx context.Context, name string) (${Name}, error) {
	if err := s.repo.Ensure(ctx, name); err != nil {
		return ${Name}{}, err
	}
	return s.Get(ctx, name)
}

// Advance는 이 도메인의 규칙이 모이는 자리다.
// 허용되지 않는 전이를 여기서 막는다 — 이 규칙이 이 모듈의 존재 이유다.
func (s *Service) Advance(ctx context.Context, name, next string) (${Name}, error) {
	cur, err := s.GetOrCreate(ctx, name)
	if err != nil {
		return ${Name}{}, err
	}
	if cur.Status == next {
		return ${Name}{}, errs.New(errs.Conflict, "이미 %s 상태입니다", next)
	}
	row, err := s.repo.SetStatus(ctx, name, next)
	if errors.Is(err, pgx.ErrNoRows) {
		return ${Name}{}, errs.New(errs.NotFound, "${name} '%s' 없음", name)
	}
	if err != nil {
		return ${Name}{}, err
	}
	// propagation은 커밋 뒤에. 값이 아니라 이름만 나간다 —
	// 받는 쪽이 최신값을 다시 읽으므로 메시지 순서가 뒤바뀌어도 낡은 값이 남지 않는다.
	_ = s.bus.Publish(ctx, name)
	return row, nil
}

// List는 커서 페이지네이션이다. limit+1개를 읽어 "다음 페이지가 있는지"를
// 추가 쿼리 없이 판단한다(초과분은 잘라 버린다).
func (s *Service) List(ctx context.Context, cursor string, limit int32) ([]Summary, string, error) {
	take := limit
	if take <= 0 {
		take = 20
	}
	if take > maxLimit {
		take = maxLimit
	}
	rows, err := s.repo.ListAfter(ctx, cursor, take+1)
	if err != nil {
		return nil, "", err
	}
	if int32(len(rows)) > take {
		items := rows[:take]
		return items, items[len(items)-1].Name, nil
	}
	return rows, "", nil
}
`,
);

// ── 5. 규칙 테스트 ───────────────────────────────────────────────────────────
await write(
  `${API}/internal/${name}/service_test.go`,
  `// @plm ${PLM}  ${Name} 규칙 테스트 — 가짜 저장소 주입, DB도 서버도 없이 돈다
//
// 여기서 검증할 것: 규칙(허용/금지·propagation 발생 여부·커서).
// 검증하지 않을 것: SQL이 맞는지(smoke test의 몫) · 상태 코드(핸들러·인터셉터의 몫).
package ${name}

import (
	"context"
	"testing"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeRepo struct {
	status string
	rows   []Summary
}

func (f *fakeRepo) GetByName(_ context.Context, name string) (${Name}, error) {
	return ${Name}{ID: "x", Name: name, Status: f.status}, nil
}
func (f *fakeRepo) Ensure(_ context.Context, _ string) error { return nil }
func (f *fakeRepo) SetStatus(_ context.Context, name, status string) (${Name}, error) {
	f.status = status
	return ${Name}{ID: "x", Name: name, Status: status}, nil
}
func (f *fakeRepo) ListAfter(_ context.Context, _ string, limit int32) ([]Summary, error) {
	if int32(len(f.rows)) > limit {
		return f.rows[:limit], nil
	}
	return f.rows, nil
}

type fakeBus struct{ published []string }

func (b *fakeBus) Publish(_ context.Context, name string) error {
	b.published = append(b.published, name)
	return nil
}

func TestAdvancePublishes(t *testing.T) {
	repo := &fakeRepo{status: "draft"}
	bus := &fakeBus{}
	svc := NewService(repo, bus)

	row, err := svc.Advance(context.Background(), "sample", "submitted")
	if err != nil {
		t.Fatalf("예상치 못한 오류: %v", err)
	}
	if row.Status != "submitted" {
		t.Fatalf("상태가 submitted여야 하는데 %q", row.Status)
	}
	// propagation은 **값이 아니라 이름만** 나간다.
	if len(bus.published) != 1 || bus.published[0] != "sample" {
		t.Fatalf("propagation이 이름 하나여야 하는데 %v", bus.published)
	}
}

func TestAdvanceRejectsSameStatus(t *testing.T) {
	svc := NewService(&fakeRepo{status: "submitted"}, &fakeBus{})
	_, err := svc.Advance(context.Background(), "sample", "submitted")
	if err == nil {
		t.Fatal("같은 상태로의 전이는 거절해야 한다")
	}
	de, ok := err.(*errs.DomainError)
	if !ok || de.Code != errs.Conflict {
		t.Fatalf("conflict 도메인 오류여야 하는데 %#v", err)
	}
}

func TestListCapsLimitAndReturnsCursor(t *testing.T) {
	repo := &fakeRepo{rows: []Summary{{Name: "a"}, {Name: "b"}, {Name: "c"}}}
	svc := NewService(repo, &fakeBus{})

	items, next, err := svc.List(context.Background(), "", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || next != "b" {
		t.Fatalf("2건 + 커서 \\"b\\" 여야 하는데 %d건 %q", len(items), next)
	}

	repo.rows = make([]Summary, 100)
	items, _, _ = svc.List(context.Background(), "", 999)
	if len(items) > maxLimit {
		t.Fatalf("상한 %d를 넘었다: %d", maxLimit, len(items))
	}
}
`,
);

// ── 6. 저장소 어댑터 ─────────────────────────────────────────────────────────
await write(
  `${API}/internal/${name}/repo.go`,
  `// @plm ${PLM}  ${Name} 저장소 — 저장소와의 대화만 한다
//
// SQL 자체는 database/queries/${name}.sql 에 있고 Go 코드는 생성물이다(make sqlc).
// 그래서 규칙이 SQL 옆에 스며들 자리가 없다 — 규칙은 service.go에만 있다.
package ${name}

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/JWK-company/liftgram/src/backend/internal/db/sqlcgen"
)

type pgRepo struct {
	q *sqlcgen.Queries
}

func NewRepo(pool *pgxpool.Pool) Repo {
	return &pgRepo{q: sqlcgen.New(pool)}
}

func (r *pgRepo) GetByName(ctx context.Context, name string) (${Name}, error) {
	row, err := r.q.Get${Name}ByName(ctx, name)
	if err != nil {
		return ${Name}{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) Ensure(ctx context.Context, name string) error {
	return r.q.Ensure${Name}(ctx, name)
}

func (r *pgRepo) SetStatus(ctx context.Context, name, status string) (${Name}, error) {
	row, err := r.q.Set${Name}Status(ctx, sqlcgen.Set${Name}StatusParams{Name: name, Status: status})
	if err != nil {
		return ${Name}{}, err
	}
	return toDomain(row), nil
}

func (r *pgRepo) ListAfter(ctx context.Context, cursor string, limit int32) ([]Summary, error) {
	rows, err := r.q.List${Name}sAfter(ctx, sqlcgen.List${Name}sAfterParams{Cursor: cursor, Lim: limit})
	if err != nil {
		return nil, err
	}
	out := make([]Summary, 0, len(rows))
	for _, x := range rows {
		out = append(out, Summary{Name: x.Name, Status: x.Status})
	}
	return out, nil
}

// 생성물의 타입 → 도메인 타입. 이 변환이 있어서 스키마가 바뀌어도
// service.go가 sqlc 생성물의 모양에 묶이지 않는다.
func toDomain(x sqlcgen.${Name} ) ${Name} {
	return ${Name}{
		ID:        x.ID.String(),
		Name:      x.Name,
		Status:    x.Status,
		UpdatedAt: x.UpdatedAt.Time,
	}
}
`,
);

// ── 7. Connect 핸들러 ────────────────────────────────────────────────────────
await write(
  `${API}/internal/${name}/handler.go`,
  `// @plm ${PLM}  ${Name} RPC — proto ↔ 도메인 변환과 서비스 호출만 한다
//
// 검증은 여기 없다 — 규칙을 .proto에 선언했고(protovalidate) 인터셉터가 자동으로 적용한다.
// 오류도 여기서 상태 코드로 바꾸지 않는다 — 도메인 오류를 그대로 돌려주면
// middleware가 Connect 코드로 옮긴다(매핑이 한 곳에 있어야 채널마다 달라지지 않는다).
package ${name}

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	${name}v1 "github.com/JWK-company/liftgram/src/backend/gen/${name}/v1"
	"github.com/JWK-company/liftgram/src/backend/gen/${name}/v1/${name}v1connect"
)

type Handler struct {
	${name}v1connect.Unimplemented${Name}ServiceHandler
	svc *Service
}

func NewHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Get${Name}(ctx context.Context, req *connect.Request[${name}v1.Get${Name}Request]) (*connect.Response[${name}v1.Get${Name}Response], error) {
	row, err := h.svc.GetOrCreate(ctx, req.Msg.GetName())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&${name}v1.Get${Name}Response{${Name}: toProto(row)}), nil
}

func (h *Handler) List${Name}s(ctx context.Context, req *connect.Request[${name}v1.List${Name}sRequest]) (*connect.Response[${name}v1.List${Name}sResponse], error) {
	items, next, err := h.svc.List(ctx, req.Msg.GetCursor(), req.Msg.GetLimit())
	if err != nil {
		return nil, err
	}
	out := make([]*${name}v1.${Name}Summary, 0, len(items))
	for _, it := range items {
		out = append(out, &${name}v1.${Name}Summary{Name: it.Name, Status: it.Status})
	}
	return connect.NewResponse(&${name}v1.List${Name}sResponse{Items: out, NextCursor: next}), nil
}

func (h *Handler) Advance${Name}(ctx context.Context, req *connect.Request[${name}v1.Advance${Name}Request]) (*connect.Response[${name}v1.Advance${Name}Response], error) {
	row, err := h.svc.Advance(ctx, req.Msg.GetName(), req.Msg.GetStatus())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&${name}v1.Advance${Name}Response{${Name}: toProto(row)}), nil
}

// 도메인 타입과 계약 타입을 잇는 유일한 자리. 여기 말고 다른 곳에서 proto 타입을 쓰지 않는다.
func toProto(x ${Name}) *${name}v1.${Name} {
	return &${name}v1.${Name}{
		Id:        x.ID,
		Name:      x.Name,
		Status:    x.Status,
		UpdatedAt: timestamppb.New(x.UpdatedAt),
	}
}
`,
);

// ── 8. composition root에 네 줄 ─────────────────────────────────────────────────────
const mainPath = path.join(root, API, "cmd/server/main.go");
let mainSrc = await readFile(mainPath, "utf8");
const wired = new RegExp(`${name}v1connect\\.New${Name}ServiceHandler`).test(mainSrc);
if (!wired) {
  // 끼워 넣을 자리는 **표식**으로 찾는다. 예전에는 레퍼런스 도메인(카운터)의 코드 한 줄을
  // 앵커로 삼았는데, 그 도메인을 걷어내자 정규식이 아무것도 못 찾아 **조용히 조립을 빠뜨렸다**.
  // 표식이 없으면 만들지 않고 알린다 — 빌드가 깨지는 편이 조용히 안 붙는 것보다 낫다.
  const IMPORT_ANCHOR = /(\n\t"github\.com\/JWK-company\/liftgram\/src\/backend\/internal\/realtime"\n)/;
  const DOMAIN_ANCHOR = /(\n\t\/\/ GEN-ANCHOR:domains\n)/;

  if (!IMPORT_ANCHOR.test(mainSrc) || !DOMAIN_ANCHOR.test(mainSrc)) {
    console.error(
      `\n  ✗ ${API}/cmd/server/main.go 에서 표식을 찾지 못했습니다` +
        `\n    (import 앵커: internal/realtime · 조립 앵커: // GEN-ANCHOR:domains)` +
        `\n    표식을 되돌리거나 scripts/gen-module.mjs 를 함께 고치세요.\n`,
    );
    process.exit(1);
  }

  const importLine = `\t${name}v1connect "github.com/JWK-company/liftgram/src/backend/gen/${name}/v1/${name}v1connect"\n\t"github.com/JWK-company/liftgram/src/backend/internal/${name}"`;
  mainSrc = mainSrc.replace(IMPORT_ANCHOR, `$1\n${importLine}\n`);
  mainSrc = mainSrc.replace(
    DOMAIN_ANCHOR,
    `$1\n\t// ── ${Name} ──\n` +
      `\t${name}Repo := ${name}.NewRepo(pool)\n` +
      `\t${name}Svc := ${name}.NewService(${name}Repo, bus)\n` +
      `\t${name}Path, ${name}HTTP := ${name}v1connect.New${Name}ServiceHandler(${name}.NewHandler(${name}Svc), opts)\n` +
      `\tmount(mux, ${name}Path, ${name}HTTP)\n`,
  );
  await writeFile(mainPath, mainSrc);
  made.push(`${API}/cmd/server/main.go (${Name}Service 등록)`);
} else {
  skipped.push(`${API}/cmd/server/main.go (${Name}Service 이미 등록됨)`);
}

// ── 결과 ─────────────────────────────────────────────────────────────────────
console.log(`\n  ${Name} 모듈 생성`);
for (const f of made) console.log(`    + ${f}`);
for (const f of skipped) console.log(`    · 건너뜀: ${f}`);
console.log(`
  다음 순서:
    1) make proto        계약 → Go·TS 생성물
    2) make sqlc         SQL → 타입 안전한 Go
    3) make migrate      테이블 반영${
      srs
        ? ""
        : `
    4) 생성된 파일의 @plm <SRS-코드> 를 실제 요구 번호로 바꾼다
       (다음부터는 make gen NAME=${name} SRS=SRS-014 처럼 함께 주면 이 단계가 없어진다)`
    }
    ${srs ? "4" : "5"}) make verify       lint·타입·테스트·문서
    ${srs ? "5" : "6"}) 호출해 보기:
       curl -X POST localhost:3000/api/${name}.v1.${Name}Service/Advance${Name} \\
         -H 'content-type: application/json' -d '{"name":"sample","status":"submitted"}'
       (브라우저와 마찬가지로 **web(:3000)을 통해** 부른다 — api는 내부 전용이다)
`);
if (!srs)
  console.log("  ⚠ 요구 번호를 안 넣었습니다 — make verify 가 placeholder를 잡아 실패합니다(의도된 동작).\n");
