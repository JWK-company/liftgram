// @plm SRS-006  계정·인증 규칙 테스트 — DB도 서버도 없이 돈다
//
// 여기서 보는 것은 **보안 성질**이다: 실패를 구분해 주지 않는가, 토큰이 회전하는가,
// 폐기된 토큰이 다시 통하지 않는가. 이 셋이 깨지면 조용히 위험해지므로 테스트로 못 박는다.
package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜 저장소 ──────────────────────────────────────────────────────────────

type fakeRepo struct {
	users  map[string]User // id → user
	byMail map[string]string
	tokens map[string]RefreshToken // hash → token
	// 폐기된 토큰도 남겨 둔다 — "다시 쓰면 거절되는가"를 확인해야 하므로.
	revoked map[string]bool
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{
		users:   map[string]User{},
		byMail:  map[string]string{},
		tokens:  map[string]RefreshToken{},
		revoked: map[string]bool{},
	}
}

func (f *fakeRepo) CreateUser(_ context.Context, u User) (User, error) {
	if _, dup := f.byMail[u.Email]; dup {
		return User{}, errs.New(errs.Conflict, "이미 가입된 이메일입니다")
	}
	u.CreatedAt = time.Now()
	f.users[u.ID] = u
	f.byMail[u.Email] = u.ID
	return u, nil
}

func (f *fakeRepo) GetUserByID(_ context.Context, id string) (User, error) {
	u, ok := f.users[id]
	if !ok {
		return User{}, errs.New(errs.NotFound, "사용자 없음")
	}
	return u, nil
}

func (f *fakeRepo) GetUserByEmail(_ context.Context, email string) (User, error) {
	id, ok := f.byMail[email]
	if !ok {
		return User{}, errs.New(errs.NotFound, "사용자 없음")
	}
	return f.users[id], nil
}

func (f *fakeRepo) UpdateProfile(_ context.Context, id string, p ProfilePatch) (User, error) {
	u, ok := f.users[id]
	if !ok {
		return User{}, errs.New(errs.NotFound, "사용자 없음")
	}
	if p.SetDisplayName {
		u.DisplayName = p.DisplayName
	}
	if p.SetExperienceLevel {
		u.ExperienceLevel = p.ExperienceLevel
	}
	if p.SetTrainerIntent {
		u.TrainerIntent = p.TrainerIntent
	}
	f.users[id] = u
	return u, nil
}

func (f *fakeRepo) CreateRefreshToken(_ context.Context, hash, userID string, exp time.Time) error {
	f.tokens[hash] = RefreshToken{UserID: userID, ExpiresAt: exp}
	return nil
}

func (f *fakeRepo) GetLiveRefreshToken(_ context.Context, hash string) (RefreshToken, error) {
	t, ok := f.tokens[hash]
	if !ok || f.revoked[hash] || t.ExpiresAt.Before(time.Now()) {
		return RefreshToken{}, errs.New(errs.NotFound, "세션 없음")
	}
	return t, nil
}

func (f *fakeRepo) RevokeRefreshToken(_ context.Context, hash string) error {
	f.revoked[hash] = true
	return nil
}

func newTestService() (*Service, *fakeRepo) {
	repo := newFakeRepo()
	// 32자 이상 — 서비스가 요구하는 조건과 같은 자리에서 검사한다.
	return NewService(repo, NewHMACSigner("test-secret-0123456789abcdefghijkl")), repo
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// ── 테스트 ───────────────────────────────────────────────────────────────────

func TestSignUpThenLogIn(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()

	u, tokens, err := svc.SignUp(ctx, "  Kim@Example.COM ", "hunter22!", " 김운동 ")
	if err != nil {
		t.Fatalf("가입 실패: %v", err)
	}
	// 이메일은 소문자·공백 제거로 정규화된다 — 같은 사람이 두 계정을 갖지 않게.
	if u.Email != "kim@example.com" {
		t.Fatalf("이메일 정규화 안 됨: %q", u.Email)
	}
	if u.DisplayName != "김운동" {
		t.Fatalf("표시 이름 공백 제거 안 됨: %q", u.DisplayName)
	}
	if tokens.AccessToken == "" || tokens.RefreshToken == "" {
		t.Fatal("토큰이 비었다")
	}

	// 대소문자가 달라도 같은 계정으로 로그인된다.
	if _, _, err := svc.LogIn(ctx, "KIM@example.com", "hunter22!"); err != nil {
		t.Fatalf("로그인 실패: %v", err)
	}
}

func TestSignUpRejectsDuplicateEmail(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	if _, _, err := svc.SignUp(ctx, "a@b.com", "hunter22!", ""); err != nil {
		t.Fatal(err)
	}
	_, _, err := svc.SignUp(ctx, "a@b.com", "another1!", "")
	if got := domainCode(t, err); got != errs.Conflict {
		t.Fatalf("중복 가입은 Conflict여야 한다: %s", got)
	}
}

// 실패 이유를 구분해 주면 어느 이메일이 가입돼 있는지 알아낼 수 있다.
func TestLogInDoesNotRevealWhetherEmailExists(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	if _, _, err := svc.SignUp(ctx, "known@b.com", "hunter22!", ""); err != nil {
		t.Fatal(err)
	}

	_, _, errWrongPassword := svc.LogIn(ctx, "known@b.com", "wrong-password")
	_, _, errNoSuchUser := svc.LogIn(ctx, "unknown@b.com", "wrong-password")

	var a, b *errs.DomainError
	if !errors.As(errWrongPassword, &a) || !errors.As(errNoSuchUser, &b) {
		t.Fatal("둘 다 도메인 오류여야 한다")
	}
	if a.Code != errs.Unauthorized || b.Code != errs.Unauthorized {
		t.Fatalf("둘 다 Unauthorized여야 한다: %s / %s", a.Code, b.Code)
	}
	// **메시지까지 같아야 한다** — 다르면 그 차이가 곧 정보다.
	if a.Message != b.Message {
		t.Fatalf("실패 메시지가 갈린다:\n  비번틀림: %q\n  없는계정: %q", a.Message, b.Message)
	}
}

func TestRefreshRotatesAndOldTokenStopsWorking(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, first, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}

	_, second, err := svc.Refresh(ctx, first.RefreshToken)
	if err != nil {
		t.Fatalf("갱신 실패: %v", err)
	}
	if second.RefreshToken == first.RefreshToken {
		t.Fatal("refresh가 회전하지 않았다 — 같은 토큰이 다시 나왔다")
	}

	// 쓴 토큰은 죽는다. 훔친 토큰을 쓰면 진짜 사용자의 것이 무효가 되어 도난이 드러난다.
	if _, _, err := svc.Refresh(ctx, first.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("이미 쓴 refresh가 다시 통했다")
	}
	// 새 토큰은 살아 있다.
	if _, _, err := svc.Refresh(ctx, second.RefreshToken); err != nil {
		t.Fatalf("새 refresh가 통하지 않는다: %v", err)
	}
}

func TestLogOutKillsOnlyThatSession(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	_, phone, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	// 같은 사용자가 다른 기기에서도 로그인한다.
	_, laptop, err := svc.LogIn(ctx, "a@b.com", "hunter22!")
	if err != nil {
		t.Fatal(err)
	}

	if err := svc.LogOut(ctx, phone.RefreshToken); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Refresh(ctx, phone.RefreshToken); domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그아웃한 기기의 세션이 살아 있다")
	}
	// **다른 기기는 그대로여야 한다** — 한 곳에서 나갔다고 전부 끊기면 쓰기 힘들다.
	if _, _, err := svc.Refresh(ctx, laptop.RefreshToken); err != nil {
		t.Fatalf("다른 기기 세션까지 끊겼다: %v", err)
	}
}

// 없는 토큰으로 로그아웃해도 성공이다 — 실패를 알려 주면 "그 토큰은 유효했다"는 정보가 된다.
func TestLogOutIsIdempotent(t *testing.T) {
	svc, _ := newTestService()
	if err := svc.LogOut(context.Background(), "이런-토큰은-없다"); err != nil {
		t.Fatalf("없는 토큰 로그아웃이 실패했다: %v", err)
	}
}

func TestAccessTokenCarriesIdentity(t *testing.T) {
	svc, _ := newTestService()
	u, tokens, err := svc.SignUp(context.Background(), "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	id, role, err := svc.VerifyAccess(tokens.AccessToken)
	if err != nil {
		t.Fatalf("검증 실패: %v", err)
	}
	if id != u.ID || role != "user" {
		t.Fatalf("신원이 다르다: id=%q role=%q", id, role)
	}
	// 아무 문자열이나 통과하면 안 된다.
	if _, _, err := svc.VerifyAccess("not-a-token"); err == nil {
		t.Fatal("엉터리 토큰이 통과했다")
	}
}

// 다른 키로 서명된 토큰은 거절돼야 한다 — 키를 바꿨을 때 옛 토큰이 살아남지 않게.
func TestAccessTokenFromAnotherSecretIsRejected(t *testing.T) {
	svc, _ := newTestService()
	_, tokens, err := svc.SignUp(context.Background(), "a@b.com", "hunter22!", "")
	if err != nil {
		t.Fatal(err)
	}
	other := NewService(newFakeRepo(), NewHMACSigner("completely-different-secret-abcdefghij"))
	if _, _, err := other.VerifyAccess(tokens.AccessToken); err == nil {
		t.Fatal("다른 키로 만든 토큰이 통과했다")
	}
}

func TestUpdateProfileChangesOnlyWhatWasSent(t *testing.T) {
	svc, _ := newTestService()
	ctx := context.Background()
	u, _, err := svc.SignUp(ctx, "a@b.com", "hunter22!", "처음이름")
	if err != nil {
		t.Fatal(err)
	}

	// 경력만 보낸다 — 이름은 그대로여야 한다.
	updated, err := svc.UpdateProfile(ctx, u.ID, ProfilePatch{
		ExperienceLevel:    "intermediate",
		SetExperienceLevel: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.DisplayName != "처음이름" {
		t.Fatalf("보내지 않은 이름이 바뀌었다: %q", updated.DisplayName)
	}
	if updated.ExperienceLevel != "intermediate" {
		t.Fatalf("경력이 반영되지 않았다: %q", updated.ExperienceLevel)
	}

	// 알 수 없는 값은 거절한다 — 저장소에 쓰레기가 들어가지 않게.
	_, err = svc.UpdateProfile(ctx, u.ID, ProfilePatch{ExperienceLevel: "grandmaster", SetExperienceLevel: true})
	if domainCode(t, err) != errs.Validation {
		t.Fatal("알 수 없는 경력 값이 통과했다")
	}
}
