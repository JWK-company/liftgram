# SPEC-031 — 사진 자동 검사와 숨김 중 파일 차단, 카카오 시행일 자동 전환

> 타입 Spec · 그룹 할일/사진-자동-검사 · ADStudio가 `SPEC-031.json`에서 자동으로 만든 읽기용 파일(고치려면 .json 또는 ADStudio에서)

- **implements** → ADR-053

### 목표

- 올라오는 사진을 서버 안에서 공개 모델로 검사해, 점수가 높으면 사람이 볼 때까지 숨긴다. 사진은 밖으로 나가지 않고 GPU를 쓰지 않는다.
- 나체·미성년자 신고로 자동 숨김된 글은 사진 파일도 함께 막는다. 검토자는 막힌 사진을 볼 수 있어야 한다.
- 헬스장 카카오 검색을 시행일(2026-11-12 KST)에 사람 손 없이 켠다.

### 등급 판정

Feature: 새 컨테이너, 새 RPC, 저장소 판단 변경, 화면 변경이 함께 있다.

### 모델 선택 근거

| 모델 | 운동 사진 163장 중 0.5 이상 | 0.9 이상 | 1장 처리(2스레드) | 라이선스 |
| --- | --- | --- | --- | --- |
| AdamCodd/vit-base-nsfw-detector int8 | 44 | 13 | 246ms | Apache-2.0 |
| Falconsai/nsfw_image_detection int8(onnx-community 변환) | 5 | 3 | 71ms | Apache-2.0(원본) |

표본은 Wikimedia Commons의 보디빌딩·역도·크로스핏·요가 등 공개 사진이다. 실제 음란물로 잡아내는 비율은 시험하지 않았고, 유화 나체 3점은 Falconsai가 모두 0.12 미만이었다. 잡아내는 능력은 모델 공개 자료에 기댄다. 미성년자 판별 기능은 없으므로 신고 경로가 그대로 필요하다.

### 범위

- 새 컨테이너: `src/imagescan/server.py`, `src/imagescan/Dockerfile`, `src/compose.yaml`, `src/compose.prod.yaml`
- 스캐너: 새 파일 `src/backend/internal/media/scanner_http.go`, `src/backend/cmd/server/main.go`, `src/backend/internal/config/config.go`, `src/.env.example`
- 글·DM·프로필의 flagged 처리: `src/backend/internal/feed/service.go`, `src/backend/internal/feed/repo.go`, `src/database/queries/feed.sql`, `src/backend/internal/dm/service.go`, 프로필 사진 경로
- 숨김 중 파일 차단: `src/backend/internal/moderation/service.go`, `src/backend/internal/moderation/repo.go`, `src/database/queries/moderation.sql`
- 검토자 미리보기: `src/proto/moderation/v1/moderation.proto`, `src/backend/internal/moderation/handler.go`, `src/frontend/app/components/moderation/ModerationQueueClient.tsx`
- 화면: `src/frontend/app/components/feed/PostCard.tsx`, 업로드 실패 문구
- 캐시: `src/backend/internal/media/handler.go`의 `max-age`를 7일에서 1시간으로
- 고지: `src/frontend/app/privacy/page.tsx`, `src/frontend/app/licenses/page.tsx`
- 카카오: `src/backend/internal/gyms/handler.go`, `src/backend/cmd/server/main.go`, `src/backend/internal/config/config.go`, 운영 `.env`

### 설계

#### 검사 컨테이너

- `imagescan`: python slim + onnxruntime CPU + Pillow. `POST /scan`에 바이트를 받아 `{"score":0.12}`를 돌려준다. 모델은 이미지 빌드 때 커밋 `1ceb3c7f`에서 받아 sha256 `bdc94149…`로 검증한다.
- 격리: backend와만 닿는 `internal: true` 네트워크, 포트 공개 없음, 비루트, `read_only`, CPU 2개, 메모리 1GB.
- 입력 제한: 20MB, `Image.MAX_IMAGE_PIXELS` 제한. 움직이는 그림은 프레임 5장까지 고르게 뽑아 최고 점수를 쓴다. 해석 실패는 400.
- 동시 처리는 스레드 2개와 대기 상한으로 묶고, 넘치면 503.

#### 백엔드

- `HTTPScanner`: `IMAGE_SCAN_URL`이 비면 지금처럼 Noop. 시간 상한 3초, 점수 `>= IMAGE_SCAN_THRESHOLD`(기본 0.9)이면 flagged.
- 검사 실패는 올리기를 막지 않고 통과시키며 경고 로그를 남긴다(기존 `src/backend/internal/media/service.go`의 판단 유지). 이 경우 사진은 신고로만 걸러진다.
- 글: `CreatePost`가 사진 중 하나라도 flagged면 `moderation_status=pending`으로 저장한다. 지금은 결과를 버려서 글은 공개되고 사진만 깨진다.
- DM·프로필 사진: 검토 큐가 없어 flagged면 거절하고 「이 사진은 사용할 수 없어요」로 답한다. 커스텀 종목 사진은 기기 안에서만 쓰이므로 업로드 응답만 본다.
- 스토리: 이미 pending으로 처리한다.

#### 숨김 중 파일 차단

- `holdIfReportedEnough`가 숨길 때 대기 신고에 `nudity`·`minor_safety`가 있으면 모든 사진의 flagged를 켠다. 숨김과 같은 트랜잭션에서 처리한다.
- 승인하면 기존 `SetModeration`이 풀고, 제거하면 그대로 막힌다.

#### 검토자 미리보기

- 새 RPC `GetReviewMedia(media_url) → (content_type, data)`: moderator·admin만, 우리 사진 주소만, flagged 여부와 상관없이 바이트를 돌려준다.
- `src/frontend/app/components/moderation/ModerationQueueClient.tsx`는 일반 주소 대신 이 RPC로 받아 Blob URL로 그린다.

#### 작성자 화면

- 검토 중인 글의 사진이 막혀 있으면 깨진 그림 대신 「검토 중」 자리를 보여 준다.

#### 카카오 시행일

- `KAKAO_LOCAL_SINCE`(기본 `2026-11-12T00:00:00+09:00`, 형식 오류면 부팅 실패) 전에는 키가 있어도 503을 돌려주고 카카오를 부르지 않는다. 운영 `.env`에 키를 지금 넣어 둔다.

### 작업 단계

#### Phase 1 — 검사·차단·전환 구현

- [ ] 컨테이너와 평가 스크립트
- [ ] 스캐너와 flagged 처리
- [ ] 파일 차단과 검토자 미리보기
- [ ] 고지·캐시
- [ ] 카카오 시행일
- 완료 기준: 아래 수용 기준의 시험이 통과하고 운영에 배포된다.

### 수용 기준

- 점수가 기준 이상인 사진의 글은 작성자에게만 보이고 검토 목록에 오르며, 사진 파일은 404다.
- 검토자는 막힌 사진을 볼 수 있고, 승인하면 글과 파일이 모두 열린다.
- 검사 컨테이너가 꺼져 있어도 사진 올리기와 서버 기동은 된다.
- 나체 신고로 자동 숨김되면 파일이 404고, 괴롭힘 신고로 숨김되면 파일은 열린다.
- 시행일 전 `/api/gyms/nearby`는 503이고 카카오를 부르지 않으며, 시행일 뒤 실제 키로 결과가 나온다.
- 검사 컨테이너는 밖으로 나가는 연결이 없다.

### 테스트 계획

- Go 단위: 스캐너(기준, 시간 초과, 실패 통과), 글 pending, DM·프로필 거절, 권한
- 실 DB: 숨김 파일 차단, 승인 복구
- 컨테이너: 정상·손상·거대·움직이는 그림, 네트워크 차단
- e2e: 가짜 스캐너로 글 숨김과 검토자 승인 흐름
- 실제 키 호출 1회로 카카오 응답 확인

### 위험·주의

- 오탐: 표본에서 0.9 이상 3/163(1.8%)이고 모두 보디빌딩 무대 사진이다. 잘못 걸려도 삭제되지 않고 검토 대기다. 검토자가 비면 글이 계속 숨겨지므로 사용자 보고에 명시한다.
- 미탐: 잡아내는 능력은 실측하지 못했다. 미성년자 판별 불가.
- Cloudflare 캐시: 막기 전에 받아 간 사진은 캐시 수명 동안 열릴 수 있어 1시간으로 줄인다.
- 검사 대기로 업로드가 최대 3초 늦어질 수 있다.
- 서버 디스크 사용률 94%(여유 484GB): 이미지 증가분 약 400MB는 문제없다.

### 스펙 리뷰 반영(REV-041)

- 쓰는 기준값은 Falconsai 모델의 점수 0.9다. 기준은 `IMAGE_SCAN_THRESHOLD`로 바꿀 수 있고, 0.5 이상 점수는 로그에 남겨 조정 근거로 쓴다.
- 검사도 시행일부터 한다: `IMAGE_SCAN_SINCE`(기본 2026-11-12 KST). 방침이 시행 7일 전 공지를 약속하므로 11월 5일 배포에 문구를 넣고 공지 배너의 닫기 키를 새로 만든다.
- 검사 실패 사진은 `media_assets.scan_pending`으로 표시하고 5분마다 다시 본다. 걸리면 그 사진을 쓴 글·스토리를 검토 대기로 돌린다.
- 프로필 사진은 저장 전에 소유자와 검사 결과를 확인한다. 지금까지는 어떤 주소든 저장됐다.
- 컨테이너: `tmpfs /tmp`, `cap_drop: ALL`, `no-new-privileges`, `pids_limit`, 기동 뒤 준비 확인, `LABEL project=liftgram`, 배포 스크립트의 build·up 대상에 추가.
- `GetReviewMedia`는 점으로 시작하는 키를 거절하고 열람을 로그에 남긴다.
- 약관·방침·검토 중 안내에 자동 검사와 문의 방법을 적는다.

### 코드 리뷰 반영(REV-042)

- 런타임은 평가 때와 같은 onnxruntime 1.31.1, 메모리 상한은 1536m
- 판단할 수 없는 사진은 공개하지 않고 사람 검토로 보낸다
- 재검사는 실패한 사진을 건너뛰고 `scan_attempts` 가 적은 사진부터 본다
- 검토 화면은 글의 사진을 전부 보여 주고, 불러오지 못하면 승인을 막는다
