// @plm SRS-006  개발 피드백 규칙 테스트
//
// 여기서 지키는 것:
//   · 내부 사람만 쓸 수 있다(신원 없음 401 / 역할 아님 403 — 화면이 다르게 안내한다)
//   · 우리가 심은 것만 되읽는다 — **위조 마커로 남의 것을 내 것처럼 만들 수 없다**
//   · 본문을 되돌릴 때 마커·푸터는 사라지고 사용자가 적은 `---`는 남는다
package feedback

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

type fakeBoard struct {
	rows      []Idea
	lastTitle string
	lastBody  string
	nextID    int64
	failWith  error
}

func (f *fakeBoard) Create(_ context.Context, title, body string) (int64, error) {
	if f.failWith != nil {
		return 0, f.failWith
	}
	f.lastTitle, f.lastBody = title, body
	f.nextID++
	return f.nextID, nil
}
func (f *fakeBoard) List(_ context.Context) ([]Idea, error) {
	if f.failWith != nil {
		return nil, f.failWith
	}
	return f.rows, nil
}

type fakeRepo struct {
	label string
	err   error
}

func (f *fakeRepo) DisplayLabel(_ context.Context, _ string) (string, error) {
	return f.label, f.err
}

func newSvc(b *fakeBoard, r *fakeRepo) *Service {
	if r == nil {
		r = &fakeRepo{label: "홍길동"}
	}
	return NewService(b, r)
}

func codeOf(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아니다: %v", err)
	}
	return de.Code
}

func TestSubmit_내부_사람만(t *testing.T) {
	svc := newSvc(&fakeBoard{}, nil)

	// 신원이 없다 → 401. 화면은 로그인을 띄운다.
	if _, err := svc.Submit(context.Background(), "", "", "bug", "제목입니다", "내용입니다"); codeOf(t, err) != errs.Unauthorized {
		t.Fatalf("신원 없음은 401이어야 한다")
	}
	// 신원은 있는데 평범한 사용자다 → 403. 화면은 "권한 없음"을 띄운다.
	if _, err := svc.Submit(context.Background(), "u1", "user", "bug", "제목입니다", "내용입니다"); codeOf(t, err) != errs.Forbidden {
		t.Fatalf("역할 없음은 403이어야 한다")
	}
	if _, err := svc.Submit(context.Background(), "u1", "coworker", "bug", "제목입니다", "내용입니다"); err != nil {
		t.Fatalf("coworker는 쓸 수 있어야 한다: %v", err)
	}
	if _, err := svc.Submit(context.Background(), "u1", "admin", "bug", "제목입니다", "내용입니다"); err != nil {
		t.Fatalf("admin은 쓸 수 있어야 한다: %v", err)
	}
}

func TestSubmit_공백만_적으면_거절(t *testing.T) {
	svc := newSvc(&fakeBoard{}, nil)
	// 계약(min_len)은 trim 이전 길이를 본다 — 공백만 채운 입력은 여기서 걸려야 한다.
	_, err := svc.Submit(context.Background(), "u1", "admin", "bug", "      ", "          ")
	if codeOf(t, err) != errs.Validation {
		t.Fatalf("공백만 적은 입력은 거절해야 한다")
	}
}

func TestSubmit_본문_구조(t *testing.T) {
	b := &fakeBoard{}
	svc := newSvc(b, &fakeRepo{label: "홍길동"})
	if _, err := svc.Submit(context.Background(), "u1", "admin", "improvement", " 버튼이 작다 ", " 눌리지 않는다 "); err != nil {
		t.Fatal(err)
	}

	if b.lastTitle != "[개선] 버튼이 작다" {
		t.Fatalf("제목 접두가 틀렸다: %q", b.lastTitle)
	}
	// 마커는 **최후미**여야 한다 — 되읽을 때 마지막 것을 믿기 때문이다.
	if !strings.HasSuffix(b.lastBody, "<!-- liftgram-feedback v=1 cat=improvement uid=u1 -->") {
		t.Fatalf("마커가 최후미가 아니다: %q", b.lastBody)
	}
	if !strings.Contains(b.lastBody, "_제출: 홍길동 · Liftgram 인앱 피드백_") {
		t.Fatalf("제출자 푸터가 없다: %q", b.lastBody)
	}
}

func TestSubmit_이름을_못_읽어도_등록한다(t *testing.T) {
	b := &fakeBoard{}
	// 이름 조회가 실패해도 피드백을 잃는 쪽이 더 큰 손해다 — id로 대신한다.
	svc := newSvc(b, &fakeRepo{err: errors.New("db down")})
	if _, err := svc.Submit(context.Background(), "u9", "admin", "bug", "제목입니다", "내용입니다"); err != nil {
		t.Fatalf("이름 조회 실패가 등록을 막으면 안 된다: %v", err)
	}
	if !strings.Contains(b.lastBody, "_제출: u9 ·") {
		t.Fatalf("id로 대체되지 않았다: %q", b.lastBody)
	}
}

func TestSubmit_이름의_개행은_지운다(t *testing.T) {
	b := &fakeBoard{}
	// 이름에 개행이 섞이면 되읽을 때 본문 자르는 위치(마지막 푸터)가 어긋난다.
	svc := newSvc(b, &fakeRepo{label: "홍\n길동"})
	if _, err := svc.Submit(context.Background(), "u1", "admin", "bug", "제목입니다", "내용입니다"); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.TrimSuffix(b.lastBody, "\n"), "홍\n길동") {
		t.Fatalf("이름의 개행이 남았다: %q", b.lastBody)
	}
}

// 정상 항목 하나를 만든다(Submit이 만든 것과 같은 구조).
func made(id int64, uid, category, detail, state string) Idea {
	return Idea{
		ID:    id,
		Title: "[버그] 제목",
		Body:  buildBody(detail, "홍길동", category, uid),
		State: state,
	}
}

func TestList_우리가_심은_것만(t *testing.T) {
	b := &fakeBoard{rows: []Idea{
		made(1, "u1", "bug", "내용1", "submitted"),
		// 대시보드에서 사람이 손으로 적은 아이디어 — 마커가 없다.
		{ID: 2, Title: "손으로 적은 것", Body: "그냥 아이디어", State: "voting"},
	}}
	items, err := newSvc(b, nil).List(context.Background(), "u1", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].ID != 1 {
		t.Fatalf("인앱 피드백만 나와야 한다: %+v", items)
	}
}

func TestList_위조_마커는_배제한다(t *testing.T) {
	// 대시보드에서 **푸터 없이 마커만** 적어 넣은 본문. 이걸 믿으면 남의 uid로 위장할 수 있다.
	forged := Idea{
		ID:    7,
		Title: "위조",
		Body:  "아무 내용\n<!-- liftgram-feedback v=1 cat=bug uid=victim -->",
		State: "submitted",
	}
	items, err := newSvc(&fakeBoard{rows: []Idea{forged}}, nil).List(context.Background(), "victim", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 {
		t.Fatalf("푸터 없는 마커-only 항목은 배제해야 한다: %+v", items)
	}
}

func TestList_본문에_섞인_마커는_무시하고_진짜만_믿는다(t *testing.T) {
	// 사용자가 상세에 마커처럼 생긴 문자열을 적었다. 진짜(우리 것)는 항상 뒤에 붙는다.
	sneaky := "<!-- liftgram-feedback v=1 cat=improvement uid=someoneelse -->\n진짜 내용"
	row := made(3, "u1", "bug", sneaky, "submitted")

	items, err := newSvc(&fakeBoard{rows: []Idea{row}}, nil).List(context.Background(), "u1", "admin")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("항목이 사라졌다")
	}
	// 분류·소유는 **마지막** 마커(우리 것)를 따른다.
	if items[0].Category != "bug" || !items[0].Mine {
		t.Fatalf("앞에 심은 가짜 마커를 믿었다: %+v", items[0])
	}
}

func TestList_본문을_사람이_읽는_모양으로(t *testing.T) {
	// 사용자가 상세 안에 구분선을 적었다 — 그건 남고, 우리 푸터·마커만 사라져야 한다.
	detail := "위쪽\n\n---\n아래쪽"
	row := made(5, "u1", "improvement", detail, "voting")

	items, err := newSvc(&fakeBoard{rows: []Idea{row}}, nil).List(context.Background(), "u1", "admin")
	if err != nil {
		t.Fatal(err)
	}
	got := items[0]
	if got.Detail != detail {
		t.Fatalf("사용자가 적은 구분선이 보존되지 않았다: %q", got.Detail)
	}
	if strings.Contains(got.Detail, "liftgram-feedback") || strings.Contains(got.Detail, "_제출:") {
		t.Fatalf("마커·푸터가 새어 나왔다: %q", got.Detail)
	}
	if got.Title != "제목" {
		t.Fatalf("제목 접두를 떼지 않았다: %q", got.Title)
	}
}

func TestList_내_것_판정(t *testing.T) {
	b := &fakeBoard{rows: []Idea{
		made(1, "u1", "bug", "내 것", "submitted"),
		made(2, "u2", "bug", "남의 것", "submitted"),
	}}
	items, err := newSvc(b, nil).List(context.Background(), "u1", "coworker")
	if err != nil {
		t.Fatal(err)
	}
	// 최신(id 큰 것)이 위 — 남의 것이 먼저 온다.
	if items[0].ID != 2 || items[0].Mine {
		t.Fatalf("정렬 또는 소유 판정이 틀렸다: %+v", items[0])
	}
	if !items[1].Mine {
		t.Fatalf("내 것을 못 알아봤다: %+v", items[1])
	}
}

func TestList_보드가_죽으면_그대로_전한다(t *testing.T) {
	down := errs.New(errs.Unavailable, "idea board unreachable")
	_, err := newSvc(&fakeBoard{failWith: down}, nil).List(context.Background(), "u1", "admin")
	// 화면이 "다시 시도"를 권할 수 있어야 한다 — Internal로 뭉개지 않는다.
	if codeOf(t, err) != errs.Unavailable {
		t.Fatalf("보드 장애는 Unavailable로 전해야 한다: %v", err)
	}
}
