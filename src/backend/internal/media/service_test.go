// @plm SRS-019  미디어 규칙 테스트 — 저장소도 DB도 없이 돈다
//
// 여기서 보는 것은 **무엇을 받아들이고 무엇을 서브하는가**다. 이게 틀리면 HTML이 사진인 척
// 저장되거나, 내려간 사진이 계속 보인다 — 둘 다 조용히 일어나는 사고라 테스트로 못박는다.
package media

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"github.com/JWK-company/liftgram/src/backend/internal/errs"
)

// ── 가짜 저장소·저장소 ───────────────────────────────────────────────────────

type fakeStorage struct {
	objects map[string][]byte
	saveErr error
	// 저장은 됐는데 파일이 사라진 상황(정리 작업·버킷 수명주기)을 흉내 낸다.
	pretendMissing bool
}

func newFakeStorage() *fakeStorage { return &fakeStorage{objects: map[string][]byte{}} }

func (f *fakeStorage) Name() string { return "fake" }

func (f *fakeStorage) Save(_ context.Context, data []byte, contentType string) (StoredObject, error) {
	if f.saveErr != nil {
		return StoredObject{}, f.saveErr
	}
	key, err := newKey(contentType)
	if err != nil {
		return StoredObject{}, err
	}
	f.objects[key] = data
	return StoredObject{Key: key, URL: urlForKey(key), Bytes: int64(len(data))}, nil
}

func (f *fakeStorage) Exists(_ context.Context, key string) (bool, error) {
	if f.pretendMissing {
		return false, nil
	}
	_, ok := f.objects[key]
	return ok, nil
}

func (f *fakeStorage) Open(_ context.Context, key string) (io.ReadCloser, error) {
	data, ok := f.objects[key]
	if !ok {
		return nil, errors.New("없음")
	}
	return io.NopCloser(bytes.NewReader(data)), nil
}

type fakeRepo struct {
	byKey map[string]Asset
}

func newFakeRepo() *fakeRepo { return &fakeRepo{byKey: map[string]Asset{}} }

func (f *fakeRepo) Create(_ context.Context, a Asset) (Asset, error) {
	f.byKey[a.Key] = a
	return a, nil
}

func (f *fakeRepo) GetByKey(_ context.Context, key string) (Asset, error) {
	a, ok := f.byKey[key]
	if !ok {
		return Asset{}, errs.New(errs.NotFound, "파일을 찾을 수 없습니다")
	}
	return a, nil
}

type flagScanner struct{ reason string }

func (s flagScanner) Scan(context.Context, []byte, string) (ScanResult, error) {
	return ScanResult{Flagged: true, Reason: s.reason}, nil
}

type brokenScanner struct{}

func (brokenScanner) Scan(context.Context, []byte, string) (ScanResult, error) {
	return ScanResult{}, errors.New("스캐너 장애")
}

func newTestService(scanner Scanner) (*Service, *fakeStorage, *fakeRepo) {
	st, repo := newFakeStorage(), newFakeRepo()
	n := 0
	return NewService(repo, st, scanner, func() string {
		n++
		return "media-" + string(rune('a'+n-1))
	}), st, repo
}

func domainCode(t *testing.T, err error) errs.Code {
	t.Helper()
	var de *errs.DomainError
	if !errors.As(err, &de) {
		t.Fatalf("도메인 오류가 아님: %v", err)
	}
	return de.Code
}

// ── 진짜 파일 머리들 ────────────────────────────────────────────────────────
// 형식 판정은 **바이트로** 한다. 그래서 테스트도 실제 시그니처를 쓴다.

var (
	pngBytes  = append([]byte{0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 600)...)
	jpegBytes = append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 600)...)
	gifBytes  = append([]byte("GIF89a"), make([]byte, 600)...)
	htmlBytes = []byte("<!DOCTYPE html><html><body>안녕</body></html>")
)

// ── 업로드 ───────────────────────────────────────────────────────────────────

func TestUploadRequiresLogin(t *testing.T) {
	svc, _, _ := newTestService(nil)
	_, err := svc.Upload(context.Background(), "", pngBytes, "image/png")
	if domainCode(t, err) != errs.Unauthorized {
		t.Fatal("로그인 없이 올릴 수 있다")
	}
}

func TestUploadAcceptsImages(t *testing.T) {
	for _, c := range []struct {
		name string
		data []byte
		ct   string
	}{
		{"png", pngBytes, "image/png"},
		{"jpeg", jpegBytes, "image/jpeg"},
		{"gif", gifBytes, "image/gif"},
	} {
		t.Run(c.name, func(t *testing.T) {
			svc, st, _ := newTestService(nil)
			a, err := svc.Upload(context.Background(), "u1", c.data, c.ct)
			if err != nil {
				t.Fatal(err)
			}
			if a.ContentType != c.ct || a.Kind != "image" {
				t.Fatalf("형식이 틀리다: %+v", a)
			}
			if a.URL != "/media/file/"+a.Key {
				t.Fatalf("주소 규칙이 깨졌다: %q", a.URL)
			}
			if a.Bytes != int64(len(c.data)) {
				t.Fatalf("크기가 다르다: %d", a.Bytes)
			}
			if len(st.objects) != 1 {
				t.Fatalf("저장소에 %d개", len(st.objects))
			}
		})
	}
}

// **선언은 믿지 않는다.** HTML을 image/png라고 부르며 올려도 저장되지 않는다 —
// 저장되면 그 파일은 우리 도메인에서 서브되는 HTML이 된다(XSS 경로).
func TestUploadRejectsDisguisedFile(t *testing.T) {
	svc, st, _ := newTestService(nil)
	_, err := svc.Upload(context.Background(), "u1", htmlBytes, "image/png")
	if domainCode(t, err) != errs.Validation {
		t.Fatalf("HTML이 사진으로 통과했다: %v", err)
	}
	if len(st.objects) != 0 {
		t.Fatal("거절했는데 저장은 됐다")
	}
}

// 사진이지만 **다른 사진**이라고 부른 경우도 거절한다(확장자·주소가 내용과 어긋나면 나중에 깨진다).
func TestUploadRejectsMismatchedType(t *testing.T) {
	svc, _, _ := newTestService(nil)
	_, err := svc.Upload(context.Background(), "u1", pngBytes, "image/jpeg")
	if domainCode(t, err) != errs.Validation {
		t.Fatalf("선언과 다른 형식이 통과했다: %v", err)
	}
}

func TestUploadRejectsEmpty(t *testing.T) {
	svc, _, _ := newTestService(nil)
	if _, err := svc.Upload(context.Background(), "u1", nil, "image/png"); domainCode(t, err) != errs.Validation {
		t.Fatal("빈 파일이 통과했다")
	}
}

// content type을 아예 안 보내도 **바이트로** 판정해 받아 준다.
func TestUploadSniffsWhenTypeOmitted(t *testing.T) {
	svc, _, _ := newTestService(nil)
	a, err := svc.Upload(context.Background(), "u1", jpegBytes, "")
	if err != nil {
		t.Fatal(err)
	}
	if a.ContentType != "image/jpeg" {
		t.Fatalf("추론이 틀리다: %q", a.ContentType)
	}
}

// 스캐너가 죽어도 업로드는 막히지 않는다 — 판단을 미룰 뿐이다.
func TestUploadSurvivesBrokenScanner(t *testing.T) {
	svc, _, _ := newTestService(brokenScanner{})
	a, err := svc.Upload(context.Background(), "u1", pngBytes, "image/png")
	if err != nil {
		t.Fatalf("스캐너 장애가 업로드를 막았다: %v", err)
	}
	if a.Flagged {
		t.Fatal("스캐너가 죽었는데 위반으로 찍혔다")
	}
}

// ── 서브 ─────────────────────────────────────────────────────────────────────

func TestServeReturnsBytes(t *testing.T) {
	svc, _, _ := newTestService(nil)
	a, err := svc.Upload(context.Background(), "u1", pngBytes, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	got, body, err := svc.Serve(context.Background(), a.Key)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = body.Close() }()
	data, _ := io.ReadAll(body)
	if len(data) != len(pngBytes) || got.ContentType != "image/png" {
		t.Fatalf("서브된 것이 다르다: %d바이트 %s", len(data), got.ContentType)
	}
}

// **내려간 파일은 바이트도 안 나간다.** "내려갔다"가 참이려면 파일도 안 보여야 한다.
func TestServeHidesFlagged(t *testing.T) {
	svc, _, _ := newTestService(flagScanner{reason: "테스트"})
	a, err := svc.Upload(context.Background(), "u1", pngBytes, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if !a.Flagged {
		t.Fatal("스캐너가 찍은 표시가 저장되지 않았다")
	}
	if _, _, err := svc.Serve(context.Background(), a.Key); domainCode(t, err) != errs.NotFound {
		t.Fatalf("내려간 파일이 서브됐다: %v", err)
	}
}

// 메타는 있는데 파일이 사라진 경우 — 헤더를 쓰기 **전에** 404가 되어야 한다.
func TestServeMissingObjectIsNotFound(t *testing.T) {
	svc, st, _ := newTestService(nil)
	a, err := svc.Upload(context.Background(), "u1", pngBytes, "image/png")
	if err != nil {
		t.Fatal(err)
	}
	st.pretendMissing = true
	if _, _, err := svc.Serve(context.Background(), a.Key); domainCode(t, err) != errs.NotFound {
		t.Fatalf("사라진 파일이 200으로 나갔다: %v", err)
	}
}

func TestServeUnknownKeyIsNotFound(t *testing.T) {
	svc, _, _ := newTestService(nil)
	if _, _, err := svc.Serve(context.Background(), "없는키.jpg"); domainCode(t, err) != errs.NotFound {
		t.Fatal("모르는 키가 404가 아니다")
	}
}

// 키는 매번 다르다 — 주소를 아는 것이 곧 권한이므로 겹치면 남의 사진이 새 나간다.
func TestKeysAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		k, err := newKey("image/png")
		if err != nil {
			t.Fatal(err)
		}
		if seen[k] {
			t.Fatalf("키가 겹쳤다: %s", k)
		}
		seen[k] = true
	}
}
