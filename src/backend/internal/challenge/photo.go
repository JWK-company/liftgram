// 인증 사진 처리(SRS-119·121 · REV-159) — 크기 검사 → 디코드 → 다시 인코딩(EXIF·썸네일 없음) → dHash.
//
// 원본 바이트는 저장하지 않는다. 기기에서 줄여 올리는 것은 전송량 때문일 뿐이고, 개인정보(위치 EXIF)는
// 서버가 다시 인코딩해서 없앤다 — RPC 를 직접 부르는 사람도 원본을 남길 수 없다.
package challenge

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"math/bits"
)

const (
	MaxPhotoBytes  = 4_500_000
	MaxPhotoSide   = 4096
	MaxPhotoPixels = 16_000_000
	StoreLongSide  = 1280
	StoreQuality   = 80
	// 본인 지난 인증과 이 거리 이하면 「같은 사진」으로 거부한다(64비트 dHash · Phase 1b 실측으로 정함).
	// [원본] DupRejectDist = 4 — 매일 같은 랙 앞에서 손만 바꾼 정상 사진도 4 안에 들 수 있다(REV-162 M-7)
	// [개선] 거부는 거의 같은 사진(≤2)만 · 그 위 본인 사진 근접(≤DupOwnSuspectDist)은 「중복 의심」 표시만
	DupRejectDist = 2
	// 본인 지난 인증과 이 거리 이하(거부 밖)면 「중복 의심」 표시만 한다.
	DupOwnSuspectDist = 6
	// 같은 그룹 다른 사람 사진과 이 거리 이하면 「중복 의심」 표시만 한다.
	DupSuspectDist = 10
)

var ErrBadPhoto = errors.New("challenge: bad photo")

// PhotoStore 는 비공개 사진 저장소다(공개 미디어와 다른 디렉터리·버킷 · SRS-121).
type PhotoStore interface {
	Save(ctx Ctx, data []byte, contentType string) (string, error)
	Open(ctx Ctx, key string) (io.ReadCloser, error)
	Delete(ctx Ctx, key string) error
}

// ProcessPhoto 는 받은 바이트를 검사하고 저장할 JPEG 바이트와 dHash 를 돌려준다.
func ProcessPhoto(data []byte) ([]byte, uint64, error) {
	if len(data) == 0 || len(data) > MaxPhotoBytes {
		return nil, 0, ErrBadPhoto
	}
	// 바이트 스니핑 — JPEG(FF D8 FF)만 받는다
	if len(data) < 3 || data[0] != 0xFF || data[1] != 0xD8 || data[2] != 0xFF {
		return nil, 0, ErrBadPhoto
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 || cfg.Width > MaxPhotoSide || cfg.Height > MaxPhotoSide ||
		cfg.Width*cfg.Height > MaxPhotoPixels {
		return nil, 0, ErrBadPhoto // 디코드 폭탄 · 거대한 사진
	}
	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, 0, ErrBadPhoto
	}
	small := fitLongSide(img, StoreLongSide)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, small, &jpeg.Options{Quality: StoreQuality}); err != nil {
		return nil, 0, err
	}
	return out.Bytes(), DHash(small), nil
}

// fitLongSide 는 긴 변이 max 를 넘으면 영역 평균으로 줄인다(작으면 RGBA 로 옮기기만).
func fitLongSide(src image.Image, max int) *image.RGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	nw, nh := w, h
	if w >= h && w > max {
		nw, nh = max, h*max/w
	} else if h > w && h > max {
		nw, nh = w*max/h, max
	}
	if nh < 1 {
		nh = 1
	}
	if nw < 1 {
		nw = 1
	}
	return resizeBox(src, nw, nh)
}

func resizeBox(src image.Image, nw, nh int) *image.RGBA {
	b := src.Bounds()
	w, h := b.Dx(), b.Dy()
	dst := image.NewRGBA(image.Rect(0, 0, nw, nh))
	for y := 0; y < nh; y++ {
		y0 := b.Min.Y + y*h/nh
		y1 := b.Min.Y + (y+1)*h/nh
		if y1 <= y0 {
			y1 = y0 + 1
		}
		for x := 0; x < nw; x++ {
			x0 := b.Min.X + x*w/nw
			x1 := b.Min.X + (x+1)*w/nw
			if x1 <= x0 {
				x1 = x0 + 1
			}
			var r, g, bl, n uint64
			// 큰 칸은 최대 4×4 표본만(속도) — 평균의 근사로 충분하다
			sy := max1((y1 - y0) / 4)
			sx := max1((x1 - x0) / 4)
			for yy := y0; yy < y1; yy += sy {
				for xx := x0; xx < x1; xx += sx {
					cr, cg, cb, _ := src.At(xx, yy).RGBA()
					r, g, bl, n = r+uint64(cr), g+uint64(cg), bl+uint64(cb), n+1
				}
			}
			dst.SetRGBA(x, y, color.RGBA{uint8(r / n >> 8), uint8(g / n >> 8), uint8(bl / n >> 8), 255})
		}
	}
	return dst
}

func max1(v int) int {
	if v < 1 {
		return 1
	}
	return v
}

// DHash 는 9×8 회색 축소본에서 가로로 이웃한 밝기를 비교한 64비트 해시다.
func DHash(img image.Image) uint64 {
	s := resizeBox(img, 9, 8)
	var h uint64
	for y := 0; y < 8; y++ {
		for x := 0; x < 8; x++ {
			if lum(s.RGBAAt(x, y)) > lum(s.RGBAAt(x+1, y)) {
				h |= 1 << uint(y*8+x)
			}
		}
	}
	return h
}

func lum(c color.RGBA) int { return 299*int(c.R) + 587*int(c.G) + 114*int(c.B) }

// HashDist 는 두 해시의 다른 비트 수다.
func HashDist(a, b uint64) int { return bits.OnesCount64(a ^ b) }
