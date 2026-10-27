// @plm SRS-080  기간 성과 요약 — 회원이 담당 트레이너에게 보낸다 (ADR-041 · SAD-024)
//
// ─────────────────────────────────────────────────────────────────────────────
// 요약은 **회원 기기가 계산한다**(core periodSummary — ADR-040). 서버가 하는 일은 넷뿐이다:
//
//	① 보낼 수 있는 사이인지(회원 → 이 트레이너 active ∧ logView · 차단 아님)를 **저장 전에** 본다
//	② 스냅샷을 해석하지 않고 보관한다(객체인지·schemaVersion 이 맞는지·jsonb 가 받는 글자인지만 본다)
//	③ 1:1 DM 에 SUMMARY 메시지를 **한 번만** 넣는다 — 같은 client_id 의 재전송·동시 요청·전송 뒤 실패에도
//	④ 열 때마다 가드를 다시 본다 — 받은 트레이너에 묶고, 보낼 때의 동의(consent_at)와 같을 때만 연다
//
// ── 저장–전달 멱등(S-5) ─────────────────────────────────────────────────────
// 저장(Insert)과 DM 전달은 한 트랜잭션이 아니다(다른 저장소·다른 서비스). 그래서 message_id 칸이
// "전달했나"를 기록한다. 흐름:
//
//	가드·차단 → 검사 → Insert 또는 기존 행 → message_id 가 비었으면 DM(메시지 id 는 요약에서 결정적)
//	→ `SET message_id WHERE message_id IS NULL`(한 번만) → **그 기록이 실제로 일어났을 때만** 알림·감사
//
// DM 이 실패하면 행은 message_id NULL 로 남고, 기기가 같은 client_id 로 다시 보내면 그때 간다.
// 동시에 두 번 와도 메시지 id 가 같아 messages 기본 키가 둘째를 막는다.
//
// ── 알려진 한계(기존 부채 · SRS-048) ───────────────────────────────────────
// assertActiveGrant 는 status·scope 만 본다(구독 여부는 보지 않는다). 차단은 assertCoachingAccess 가 함께 본다(CS-3).
// ─────────────────────────────────────────────────────────────────────────────
package coaching

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
	"github.com/JWK-company/liftgram/src/backend/internal/jsonguard"
)

// 감사 action — snake_case(기존 report_view 와 같은 규약 · 화면 i18n `coaching.action.<action>`이 점을
// 중첩 경로로 읽기 때문 · S-9). 0012 주석의 목록은 0017 주석이 이어 적는다.
const (
	ActionSummarySend = "summary_send" // 회원이 보냄 — 첫 실제 전달 때만
	ActionSummaryView = "summary_view" // 받은 트레이너가 열람(회원 본인이 열 때는 남기지 않는다)
	ActionRecordsView = "records_view" // 트레이너가 원본 레코드 열람(detail = 실제 내준 기간·행 수)
)

const (
	// 서버가 받는 SummaryV1 판. 새 판은 여기 한 줄 + core 의 parse 를 함께 늘린다.
	summarySchemaV1 = 1
	// 스냅샷 상한 — 계약(buf.validate max_bytes)과 같은 값을 service 도 지킨다(계약 밖 호출 방어).
	maxSnapshotBytes = 64 << 10
	// 기간 상한. 1년 + 여유. 넘으면 전 이력을 끌어가는 통로가 된다(S-2).
	maxPeriod = 400 * 24 * time.Hour
	// 기기 시계 어긋남 허용 — 끝이 "지금 + 1일"을 넘으면 거부.
	futureSlack = 24 * time.Hour
	// 회원당 하루 전송 상한 — 트레이너 DM·알림 도배 방지(S-19).
	maxSummariesPerDay = 20
	// 보낸 요약 목록 한 페이지.
	sentSummariesPageSize = 50
	// 스냅샷 숫자 |값| 상한(CS-1) — kg·횟수·epoch ms(≈1.8e12)뿐이라 1e15 면 넉넉하다. 글자 모양 상한은 jsonguard.
	maxSnapshotNumber = 1e15
	// 같은 요약을 같은 트레이너가 다시 열면 감사는 하루 한 번만(CS-7).
	summaryViewAuditWindow = 24 * time.Hour
)

// InsertOutcome은 InsertProgressSummary 의 결과다.
type InsertOutcome int

const (
	InsertDone    InsertOutcome = iota + 1 // 새 행을 넣었다
	InsertExists                           // 같은 (회원, client_id)가 이미 있다 — 행은 돌려주지 않는다
	InsertOverCap                          // 하루 상한에 걸려 넣지 않았다
)

// 지원하는 스냅샷 판.
var supportedSummarySchemas = map[int]bool{summarySchemaV1: true}

// SummaryMessenger는 dm 이 채워 준다 — **이 메서드 하나뿐**이다(S-14). 범용 "아무 종류나 보내기"를
// 받지 않으므로 코칭이 텍스트·사진을 남의 이름으로 보낼 길이 없다.
type SummaryMessenger interface {
	SendSummaryNotice(ctx context.Context, memberID, trainerID, summaryID string) (messageID string, created bool, err error)
}

// Notifier는 알림 패키지를 모르는 좁은 포트다(피드와 같은 모양 — main.go 의 notifyAdapter).
type Notifier interface {
	Notify(ctx context.Context, userID, actorID, kind, postID string)
}

// 알림 종류 이름 — notification.KindCoachingSummary 와 같은 문자열이어야 한다(테스트가 본다).
const notifyKindCoachingSummary = "coaching_summary"

// ProgressSummary는 저장된 요약 한 행이다.
type ProgressSummary struct {
	ID             string
	MemberID       string
	TrainerID      string
	GrantConsentAt time.Time
	PeriodStart    time.Time
	PeriodEnd      time.Time
	SchemaVersion  int
	Snapshot       []byte
	ClientID       string
	// 빈 문자열 = 아직 DM 이 안 갔다.
	MessageID string
	CreatedAt time.Time
}

// SentSummary는 보낸 요약 목록의 한 줄(스냅샷 없음).
type SentSummary struct {
	ID            string
	TrainerID     string
	PeriodStart   time.Time
	PeriodEnd     time.Time
	SchemaVersion int
	Delivered     bool
	CreatedAt     time.Time
}

// SummaryCursor는 목록 커서 — 마지막으로 받은 (created_at, id).
type SummaryCursor struct {
	CreatedAt time.Time
	ID        string
}

// SendSummaryInput은 회원이 보낸 요청 그대로다(기간은 epoch ms).
type SendSummaryInput struct {
	TrainerID     string
	PeriodStartMs int64
	PeriodEndMs   int64
	SchemaVersion int
	SnapshotJSON  string
	ClientID      string
}

// SummaryRepo는 progress_summaries 저장소다(Repo 에 함께 들어 있다).
type SummaryRepo interface {
	// InsertProgressSummary는 **한 트랜잭션에서** 회원 잠금 → since 뒤 개수 < maxPerDay 확인 → 넣기다(CS-5).
	// 스냅샷을 DB 에서 다시 받지 않는다(CS-1) — 돌려주는 행의 스냅샷은 넣은 값이다.
	InsertProgressSummary(ctx context.Context, s ProgressSummary, since time.Time, maxPerDay int) (ProgressSummary, InsertOutcome, error)
	// GetProgressSummaryByMemberClient는 스냅샷을 싣지 않는다 — snapshot 과 같은지는 SQL 이 jsonb 로 판정해
	// sameSnapshot 으로 돌려준다(CS-1: 저장된 jsonb 를 글로 펼쳐 읽지 않는다).
	GetProgressSummaryByMemberClient(ctx context.Context, memberID, clientID string, snapshot []byte) (row ProgressSummary, sameSnapshot bool, err error)
	GetProgressSummary(ctx context.Context, id string) (ProgressSummary, error)
	// SetProgressSummaryMessageID는 message_id 가 비었을 때만 쓴다. 썼으면 true.
	SetProgressSummaryMessageID(ctx context.Context, id, messageID string) (bool, error)
	ListSentSummaries(ctx context.Context, memberID string, cursor *SummaryCursor, limit int) ([]SentSummary, error)
}

// WithSummaryDelivery는 요약 전달에 필요한 DM·알림을 끼운다(main.go 조립). 없으면 보내기는 Unavailable.
func (s *Service) WithSummaryDelivery(m SummaryMessenger, n Notifier) *Service {
	s.messenger, s.notifier = m, n
	return s
}

// SendProgressSummary는 회원(viewer)이 담당 트레이너에게 요약을 보낸다. 돌려주는 값 = 요약 id.
func (s *Service) SendProgressSummary(ctx context.Context, viewerID string, in SendSummaryInput) (string, error) {
	if err := requireIdentity(viewerID); err != nil {
		return "", err
	}
	if s.messenger == nil {
		return "", errs.New(errs.Unavailable, "summary delivery not configured")
	}
	if in.TrainerID == "" || in.TrainerID == viewerID {
		return "", errs.New(errs.Validation, "trainer required")
	}
	if !supportedSummarySchemas[in.SchemaVersion] {
		return "", errs.New(errs.Validation, "unsupported schema_version %d", in.SchemaVersion)
	}
	if !isUUID(in.ClientID) {
		return "", errs.New(errs.Validation, "client_id must be a uuid")
	}
	start, end, err := checkPeriod(in.PeriodStartMs, in.PeriodEndMs, s.now())
	if err != nil {
		return "", err
	}
	if err := checkSnapshot([]byte(in.SnapshotJSON), in.SchemaVersion); err != nil {
		return "", err
	}

	// ① 가드와 차단을 **저장 전에**(S-5) — 보낼 수 없는 사이면 고아 행을 만들지 않는다.
	g, err := s.assertCoachingAccess(ctx, in.TrainerID, viewerID, ScopeLogView)
	if err != nil {
		return "", err
	}

	want := ProgressSummary{
		MemberID: viewerID, TrainerID: in.TrainerID, GrantConsentAt: g.ConsentAt,
		PeriodStart: start, PeriodEnd: end, SchemaVersion: in.SchemaVersion,
		Snapshot: []byte(in.SnapshotJSON), ClientID: in.ClientID,
	}

	// ② 같은 client_id 면 기존 행 — 내용이 다르면 조용히 옛 id 를 돌려주지 않고 Conflict.
	row, same, err := s.repo.GetProgressSummaryByMemberClient(ctx, viewerID, in.ClientID, want.Snapshot)
	switch {
	case err == nil:
		if err := checkExistingSummary(g, row, want, same); err != nil {
			return "", err
		}
	case isNotFound(err):
		want.ID = s.newID()
		inserted, outcome, err := s.repo.InsertProgressSummary(ctx, want, s.now().Add(-24*time.Hour), maxSummariesPerDay)
		if err != nil {
			return "", err
		}
		if outcome == InsertDone {
			row = inserted
			break
		}
		// 동시에 같은 client_id 가 먼저 들어갔다(또는 그 행 덕에 상한에 닿았다) — 그 행을 쓴다.
		row, same, err = s.repo.GetProgressSummaryByMemberClient(ctx, viewerID, in.ClientID, want.Snapshot)
		if err != nil {
			if isNotFound(err) && outcome == InsertOverCap {
				return "", errs.New(errs.ResourceExhausted, "too many summaries today (max %d)", maxSummariesPerDay)
			}
			return "", err
		}
		if err := checkExistingSummary(g, row, want, same); err != nil {
			return "", err
		}
	default:
		return "", err
	}

	// ③ 이미 전달했으면 끝(재전송) — 알림·감사도 다시 남기지 않는다.
	if row.MessageID != "" {
		return row.ID, nil
	}
	if err := s.deliverSummary(ctx, g, row); err != nil {
		return "", err
	}
	return row.ID, nil
}

// deliverSummary는 DM → message_id 기록(한 번만) → 그 기록이 실제로 일어났을 때만 알림·감사.
func (s *Service) deliverSummary(ctx context.Context, g Grant, row ProgressSummary) error {
	messageID, _, err := s.messenger.SendSummaryNotice(ctx, row.MemberID, row.TrainerID, row.ID)
	if err != nil {
		// 행은 message_id NULL 로 남는다 — 같은 client_id 의 재전송이 다시 시도한다.
		return err
	}
	recorded, err := s.repo.SetProgressSummaryMessageID(ctx, row.ID, messageID)
	if err != nil {
		return err
	}
	if !recorded {
		return nil // 동시에 온 다른 요청이 먼저 기록했다 — 알림·감사는 그쪽이 남겼다
	}
	if s.notifier != nil {
		// post_id 는 비운다(S-16) — 옛 앱이 글 화면 404 로 가지 않게.
		s.notifier.Notify(ctx, row.TrainerID, row.MemberID, notifyKindCoachingSummary, "")
	}
	detail, _ := json.Marshal(map[string]any{
		"summaryId":   row.ID,
		"periodStart": row.PeriodStart.UnixMilli(),
		"periodEnd":   row.PeriodEnd.UnixMilli(),
	})
	s.audit(ctx, g.ID, row.MemberID, ActionSummarySend, detail)
	return nil
}

// GetProgressSummary는 요약 하나를 연다.
//
//	· 그 요약의 회원 → 언제나
//	· 받은 트레이너 → 지금 active ∧ logView ∧ 보낼 때의 동의(consent_at)와 같을 때만(S-1·S-13).
//	  당사자인데 관계가 끝났거나 다시 맺은 관계면 Forbidden(=PermissionDenied · 화면 「코칭이 끝나 볼 수 없어요」)
//	· 그 밖의 사람 → NotFound — 있는지 없는지도 알리지 않는다(S-17)
func (s *Service) GetProgressSummary(ctx context.Context, viewerID, id string) (ProgressSummary, error) {
	if err := requireIdentity(viewerID); err != nil {
		return ProgressSummary{}, err
	}
	row, err := s.repo.GetProgressSummary(ctx, id)
	if err != nil {
		if isNotFound(err) {
			return ProgressSummary{}, errs.New(errs.NotFound, "summary not found")
		}
		return ProgressSummary{}, err
	}
	switch viewerID {
	case row.MemberID:
		return row, nil
	case row.TrainerID:
		// 차단도 본다(CS-3) — 회원이 트레이너를 차단하면 예전 요약도 그 순간 닫힌다.
		g, err := s.assertCoachingAccess(ctx, viewerID, row.MemberID, ScopeLogView)
		if err != nil {
			return ProgressSummary{}, err // Forbidden — 당사자라 "끝났다"는 말해도 된다
		}
		// timestamptz 끼리 비교(같은 행의 같은 값) — 문자열·ms 로 깎아 비교하지 않는다.
		if !g.ConsentAt.Equal(row.GrantConsentAt) {
			return ProgressSummary{}, errs.New(errs.Forbidden, "summary belongs to an earlier coaching relation")
		}
		detail, _ := json.Marshal(map[string]any{"summaryId": row.ID})
		// 같은 요약을 되풀이해 열면 하루 한 번만 남긴다(CS-7) — 다른 요약 열람은 따로 남는다.
		s.auditOnce(ctx, g.ID, viewerID, ActionSummaryView, detail, summaryViewAuditWindow, true)
		return row, nil
	}
	return ProgressSummary{}, errs.New(errs.NotFound, "summary not found")
}

// ListSentSummaries는 내가(회원) 보낸 요약을 최근 것부터 50개씩. nextCursor 가 비면 끝이다.
func (s *Service) ListSentSummaries(ctx context.Context, viewerID, cursor string) ([]SentSummary, string, error) {
	if err := requireIdentity(viewerID); err != nil {
		return nil, "", err
	}
	var cur *SummaryCursor
	if cursor != "" {
		c, err := parseSummaryCursor(cursor)
		if err != nil {
			return nil, "", err
		}
		cur = &c
	}
	rows, err := s.repo.ListSentSummaries(ctx, viewerID, cur, sentSummariesPageSize+1)
	if err != nil {
		return nil, "", err
	}
	next := ""
	if len(rows) > sentSummariesPageSize {
		rows = rows[:sentSummariesPageSize]
		last := rows[len(rows)-1]
		next = formatSummaryCursor(SummaryCursor{CreatedAt: last.CreatedAt, ID: last.ID})
	}
	return rows, next, nil
}

// ── 검사 ─────────────────────────────────────────────────────────────────────

// checkPeriod는 [start, end)가 쓸 수 있는 기간인지 본다: start < end · 길이 ≤ 400일 · end ≤ now+1일.
func checkPeriod(startMs, endMs int64, now time.Time) (time.Time, time.Time, error) {
	if startMs <= 0 || endMs <= 0 {
		return time.Time{}, time.Time{}, errs.New(errs.Validation, "period required")
	}
	if startMs >= endMs {
		return time.Time{}, time.Time{}, errs.New(errs.Validation, "period_start must be before period_end")
	}
	start, end := time.UnixMilli(startMs), time.UnixMilli(endMs)
	if end.Sub(start) > maxPeriod {
		return time.Time{}, time.Time{}, errs.New(errs.Validation, "period too long (max 400 days)")
	}
	if end.After(now.Add(futureSlack)) {
		return time.Time{}, time.Time{}, errs.New(errs.Validation, "period_end is in the future")
	}
	return start, end, nil
}

// checkSnapshot은 스냅샷을 **해석하지 않고** 받을 수 있는 모양인지만 본다(S-6):
// 크기 · 올바른 JSON · 최상위 객체 · 최상위 schemaVersion == 요청 값 · `\u0000` 없음(Postgres jsonb 가 거부 → 500 방지)
// · 숫자 글자 모양과 |값| ≤ 1e15(jsonb 가 글로 펼칠 때 커지는 숫자 — CS-1) · 짝 없는 서로게이트 없음(PG 거부 → 500 · CS-2).
func checkSnapshot(b []byte, schemaVersion int) error {
	if len(b) > maxSnapshotBytes {
		return errs.New(errs.Validation, "snapshot too large (max %d bytes)", maxSnapshotBytes)
	}
	if !json.Valid(b) {
		return errs.New(errs.Validation, "snapshot must be valid JSON")
	}
	if err := jsonguard.Check(b, jsonguard.Options{MaxAbs: maxSnapshotNumber, RejectLoneSurrogates: true}); err != nil {
		return errs.New(errs.Validation, "snapshot rejected: %v", err)
	}
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return errs.New(errs.Validation, "snapshot must be valid JSON")
	}
	obj, ok := v.(map[string]any)
	if !ok {
		return errs.New(errs.Validation, "snapshot must be a JSON object")
	}
	if hasNUL(v) {
		return errs.New(errs.Validation, "snapshot must not contain \\u0000")
	}
	n, ok := obj["schemaVersion"].(json.Number)
	if !ok || n.String() != strconv.Itoa(schemaVersion) {
		return errs.New(errs.Validation, "snapshot schemaVersion must equal schema_version")
	}
	return nil
}

// hasNUL은 키·문자열 어디든 NUL 이 있는지 본다(이스케이프 `\u0000`은 디코드하면 NUL 이 된다).
func hasNUL(v any) bool {
	switch t := v.(type) {
	case string:
		return strings.ContainsRune(t, 0)
	case map[string]any:
		for k, x := range t {
			if strings.ContainsRune(k, 0) || hasNUL(x) {
				return true
			}
		}
	case []any:
		for _, x := range t {
			if hasNUL(x) {
				return true
			}
		}
	}
	return false
}

// sameSummary는 같은 client_id 재전송이 **같은 요약**인지 본다 — 트레이너·기간·판·스냅샷 내용.
// 스냅샷 내용 비교는 저장소가 jsonb 동등으로 했다(sameSnapshot) — 키 순서·공백이 달라도 같다.
func sameSummary(a, b ProgressSummary, sameSnapshot bool) bool {
	return a.TrainerID == b.TrainerID &&
		a.PeriodStart.UnixMilli() == b.PeriodStart.UnixMilli() &&
		a.PeriodEnd.UnixMilli() == b.PeriodEnd.UnixMilli() &&
		a.SchemaVersion == b.SchemaVersion &&
		sameSnapshot
}

// checkExistingSummary는 같은 client_id 로 이미 있는 행을 이어 쓸 수 있는지 본다.
//
//	· 내용이 다르면 Conflict
//	· 그 행이 **지금 관계가 아닌** 옛 동의(consent_at)로 만들어졌으면 Forbidden(CS-6) — 오프라인 대기열이 해지·재계약
//	  뒤에 옛 요약을 다시 내밀어 새 관계에 전달·알림·감사가 남지 않게. 기기는 영구 실패로 버린다.
func checkExistingSummary(g Grant, row, want ProgressSummary, sameSnapshot bool) error {
	if !sameSummary(row, want, sameSnapshot) {
		return errs.New(errs.Conflict, "client_id already used for a different summary")
	}
	if !g.ConsentAt.Equal(row.GrantConsentAt) {
		return errs.New(errs.Forbidden, "summary belongs to an earlier coaching relation")
	}
	return nil
}

func isUUID(s string) bool {
	// 8-4-4-4-12 16진수. 계약(buf.validate uuid)과 같은 판정을 service 도 한다.
	if len(s) != 36 {
		return false
	}
	for i, r := range s {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			if !strings.ContainsRune("0123456789abcdefABCDEF", r) {
				return false
			}
		}
	}
	return true
}

// 커서 = "<created_at unix 마이크로초>:<id>". timestamptz 정밀도(µs)를 잃지 않는다 — ms 로 깎으면 같은 ms 의
// 다른 행을 건너뛰거나 두 번 준다.
func formatSummaryCursor(c SummaryCursor) string {
	return fmt.Sprintf("%d:%s", c.CreatedAt.UnixMicro(), c.ID)
}

func parseSummaryCursor(s string) (SummaryCursor, error) {
	micro, id, ok := strings.Cut(s, ":")
	n, err := strconv.ParseInt(micro, 10, 64)
	if !ok || err != nil || id == "" || n <= 0 {
		return SummaryCursor{}, errs.New(errs.Validation, "invalid cursor")
	}
	return SummaryCursor{CreatedAt: time.UnixMicro(n), ID: id}, nil
}
