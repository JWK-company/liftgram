// @plm SRS-019  S3 호환 저장소 — Cloudflare R2 · AWS S3 · 그 밖의 호환 스토리지
//
// ─────────────────────────────────────────────────────────────────────────────
// 옛 서버와 **같은 판단**을 그대로 옮긴다: 저장은 클라우드에 하지만 **서브는 우리 서버가 한다.**
// 버킷을 공개로 열지 않기 때문에
//   · 내려간(flagged) 사진은 바이트도 안 나간다 — 모더레이션이 실제로 효력을 갖는다
//   · 저장소를 바꿔도 이미 올라간 글의 주소가 그대로다
// 대신 사진 트래픽이 서버를 지난다. CDN을 앞에 두려면 그때 url만 절대주소로 바꾸면 된다
// (그래서 url을 계산하지 않고 **값으로 저장**한다 — 0006_media.sql).
//
// R2는 리전이 `auto`이고 path-style 주소를 쓴다. 그 두 가지만 다르고 나머지는 S3와 같다.
// ─────────────────────────────────────────────────────────────────────────────
package media

import (
	"bytes"
	"context"
	"errors"
	"io"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

type S3Config struct {
	Endpoint  string
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
}

type s3Storage struct {
	client *s3.Client
	bucket string
}

func NewS3Storage(cfg S3Config) (Storage, error) {
	missing := []string{}
	if cfg.Endpoint == "" {
		missing = append(missing, "S3_ENDPOINT")
	}
	if cfg.Bucket == "" {
		missing = append(missing, "S3_BUCKET")
	}
	if cfg.AccessKey == "" {
		missing = append(missing, "S3_ACCESS_KEY_ID")
	}
	if cfg.SecretKey == "" {
		missing = append(missing, "S3_SECRET_ACCESS_KEY")
	}
	if len(missing) > 0 {
		// 조용히 로컬로 되돌아가지 않는다 — 그러면 재배포마다 사진이 사라지는 것을 아무도 모른다.
		return nil, errors.New("S3 저장소 설정이 비었습니다: " + joinComma(missing))
	}
	region := cfg.Region
	if region == "" {
		region = "auto" // R2의 값
	}
	client := s3.New(s3.Options{
		Region:       region,
		BaseEndpoint: aws.String(cfg.Endpoint),
		UsePathStyle: true, // R2·호환 스토리지에서 가장 안전한 주소 방식
		Credentials: credentials.NewStaticCredentialsProvider(cfg.AccessKey, cfg.SecretKey, ""),
	})
	return &s3Storage{client: client, bucket: cfg.Bucket}, nil
}

func (s *s3Storage) Name() string { return "s3" }

func (s *s3Storage) Save(ctx context.Context, data []byte, contentType string) (StoredObject, error) {
	key, err := newKey(contentType)
	if err != nil {
		return StoredObject{}, err
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return StoredObject{}, err
	}
	return StoredObject{Key: key, URL: urlForKey(key), Bytes: int64(len(data))}, nil
}

func (s *s3Storage) Exists(ctx context.Context, key string) (bool, error) {
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		// 없음도 권한 오류도 여기서는 "없음"이다 — 호출부는 어느 쪽이든 404를 답한다.
		return false, nil
	}
	return true, nil
}

func (s *s3Storage) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	out, err := s.client.GetObject(ctx, &s3.GetObjectInput{Bucket: aws.String(s.bucket), Key: aws.String(key)})
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

func joinComma(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ", "
		}
		out += x
	}
	return out
}
