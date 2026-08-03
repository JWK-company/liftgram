// @plm SRS-019  로컬 디스크 저장소 — 기본 구현
//
// 개발과 단일 인스턴스 배포에서 이것으로 충분하다. 다만 **무료 호스트의 디스크는 재배포에서 사라진다**
// (지금 운영 중인 서버도 같은 조건이다 — 파리티). 사진을 오래 남기려면 `STORAGE_PROVIDER=s3`.
//
// 키에 디렉터리 구분자가 섞이면 저장 위치를 벗어날 수 있다(`../..`). 키는 우리가 만들지만,
// **읽을 때는 남이 준 문자열**이므로 열기 전에 반드시 검사한다.
package media

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type diskStorage struct {
	dir string
}

func NewDiskStorage(dir string) (Storage, error) {
	if dir == "" {
		return nil, errors.New("미디어 저장 경로가 비어 있습니다(MEDIA_DIR)")
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	return &diskStorage{dir: dir}, nil
}

func (d *diskStorage) Name() string { return "disk" }

func (d *diskStorage) Save(_ context.Context, data []byte, contentType string) (StoredObject, error) {
	key, err := newKey(contentType)
	if err != nil {
		return StoredObject{}, err
	}
	// 먼저 임시 이름으로 쓰고 마지막에 옮긴다 — 도중에 죽어도 **반쪽 파일이 서브되지 않는다.**
	tmp := filepath.Join(d.dir, "."+key+".part")
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return StoredObject{}, err
	}
	if err := os.Rename(tmp, filepath.Join(d.dir, key)); err != nil {
		_ = os.Remove(tmp)
		return StoredObject{}, err
	}
	return StoredObject{Key: key, URL: urlForKey(key), Bytes: int64(len(data))}, nil
}

func (d *diskStorage) Exists(_ context.Context, key string) (bool, error) {
	path, err := d.path(key)
	if err != nil {
		return false, nil // 이상한 키 = 그런 파일 없음
	}
	if _, err := os.Stat(path); err != nil {
		return false, nil
	}
	return true, nil
}

func (d *diskStorage) Open(_ context.Context, key string) (io.ReadCloser, error) {
	path, err := d.path(key)
	if err != nil {
		return nil, err
	}
	return os.Open(path)
}

// 키는 **파일 이름 하나**여야 한다 — 경로 구분자나 `..`가 들어오면 저장 폴더 밖을 가리킬 수 있다.
func (d *diskStorage) path(key string) (string, error) {
	if key == "" || strings.ContainsAny(key, `/\`) || strings.Contains(key, "..") {
		return "", errors.New("잘못된 키입니다")
	}
	return filepath.Join(d.dir, key), nil
}
