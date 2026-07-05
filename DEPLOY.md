# Liftgram 무료 서버 배포 (Render + Neon)

3명 테스트용 POC를 위한 백엔드 무료 배포 가이드. 순서대로 따라 하면 됩니다.
소요: 약 15~20분. 카드 등록 불필요(둘 다 무료 플랜).

> 준비물: GitHub 계정(이 저장소가 올라가 있어야 함). 코드 쪽 준비는 이미 끝나 있음
> (`render.yaml`, 빌드/마이그레이션 스크립트). 아래는 "계정 만들고 클릭"만 하면 됨.

---

## 1단계 — 무료 데이터베이스 (Neon)

1. https://neon.tech → **Sign up** → GitHub로 로그인 (무료).
2. **Create project** 클릭 → 이름 아무거나(예: `liftgram`) → Region은 가까운 곳
   (예: `Asia/Singapore`) → Postgres 버전 기본값 → Create.
3. 프로젝트 만들어지면 **Connection string**(연결 문자열)이 보임 → **복사**.
   - 형태: `postgresql://user:비번@ep-xxxx.aws.neon.tech/dbname?sslmode=require`
   - 이 값이 곧 `DATABASE_URL`. 잠깐 메모장에 붙여둡니다.

> 참고: Neon 무료 DB는 안 쓰면 잠들었다가 접속 시 깨어남(첫 요청 약간 느림). POC엔 무방.

---

## 2단계 — 서버 (Render)

1. https://render.com → **Get Started** → GitHub로 로그인 (무료).
2. 대시보드 → **New +** → **Blueprint** 선택.
3. 이 저장소(`health-practice`) 선택 → Render가 루트의 `render.yaml`을 자동 인식 →
   서비스 이름 확인 후 **Apply**.
4. 배포 설정 중 **환경변수 입력** 화면이 나오면:
   - `DATABASE_URL` → 1단계에서 복사한 Neon 연결 문자열 붙여넣기.
   - `JWT_SECRET` → 자동 생성됨(그대로 두기).
   - 나머지(NODE_ENV, STORAGE_PROVIDER, PUSH_PROVIDER 등)는 이미 채워져 있음.
5. **Create / Deploy** → 첫 빌드 3~5분 소요(설치→마이그레이션→실행).
6. 완료되면 서버 주소가 생김: 예) `https://liftgram-api.onrender.com`

### 잘 됐는지 확인
브라우저에서 `https://<서버주소>/api/health` 열기 →
```json
{ "status": "ok", "db": "ok", "ts": "..." }
```
이렇게 나오면 서버 + DB 연결 성공. 🎉

> Blueprint가 안 보이면: New + → **Web Service** → 저장소 선택 →
> Root Directory `server`, Build `npm install --include=dev && npx prisma generate && npm run build`,
> Start `npx prisma migrate deploy && node dist/main.js`, Health Check Path `/api/health`,
> 환경변수는 `render.yaml`의 envVars 참고로 수동 입력.

---

## 3단계 — 앱(프론트) 연결

서버만 올리면 팀원이 아직 못 씁니다. 웹앱을 **이 서버 주소로 빌드**해서
정적 호스팅에 올려야 팀원이 폰 브라우저로 접속 → 홈 화면에 추가해서 앱처럼 씁니다.
설정은 이미 준비돼 있음(`netlify.toml`, SPA 폴백 `app/public/_redirects`).

### 방법 A — Netlify (가장 쉬움, 무료)
1. https://netlify.com → GitHub 로그인.
2. **Add new site → Import an existing project** → 이 저장소 선택.
   - 빌드 설정은 `netlify.toml`이 자동 적용됨(base=app, publish=dist).
3. **Site settings → Environment variables** 에 추가:
   `EXPO_PUBLIC_SERVER_URL = https://<Render 서버주소>/api`
4. **Deploy** → 발급된 주소(예: `https://liftgram.netlify.app`)를 팀원에게 공유.
5. 팀원: 폰 브라우저로 열기 → 공유/메뉴 → **홈 화면에 추가** → 앱처럼 사용.

### 방법 B — 손으로 빌드해서 아무 정적호스팅에 업로드
```bash
cd app
EXPO_PUBLIC_SERVER_URL="https://<서버주소>/api" npm run export:web
# 결과물: app/dist  → Cloudflare Pages/Render Static 등에 업로드
# (Cloudflare Pages는 _redirects 파일이 SPA 폴백을 자동 처리)
```

> 마지막으로 서버 CORS를 이 프론트 주소로 좁히려면(선택), Render 환경변수에
> `CORS_ORIGINS = https://<프론트주소>` 추가. (안 넣어도 POC는 동작)

---

## (선택) 사진 영구 저장 — Cloudflare R2 (무료 10GB)
기본값(`STORAGE_PROVIDER=local`)은 사진을 서버 디스크에 저장해서 **재배포하면 사진이 사라집니다**.
아래를 설정하면 사진이 클라우드(R2)에 저장돼 재배포에도 유지됩니다. (글/계정 등 DB 데이터는 원래 안전.)

1. https://dash.cloudflare.com → **R2** → **Create bucket** (이름 예: `liftgram-media`).
2. **R2 → Manage R2 API Tokens → Create API Token** (Object Read & Write) →
   Access Key ID / Secret Access Key 복사, 엔드포인트(`https://<account_id>.r2.cloudflarestorage.com`) 확인.
3. Render → 서비스 → **Environment** 에 추가:
   - `STORAGE_PROVIDER` = `r2`
   - `S3_ENDPOINT` = `https://<account_id>.r2.cloudflarestorage.com`
   - `S3_BUCKET` = `liftgram-media`
   - `S3_REGION` = `auto`
   - `S3_ACCESS_KEY_ID` = (복사한 값)
   - `S3_SECRET_ACCESS_KEY` = (복사한 값)
4. 재배포 → 이후 업로드되는 사진은 R2에 저장됨(서버가 `/media/file/:key`로 프록시 서브,
   모더레이션·URL 그대로). 카드 등록 불필요(R2 무료 10GB).

> 코드는 이미 준비돼 있어(어댑터) env만 넣으면 됩니다. 안 넣으면 로컬 저장으로 동작(POC 무방).

## 알아둘 점 (무료 플랜 특성)
- **콜드 스타트**: Render 무료 서버는 15분간 아무도 안 쓰면 잠듦 → 다음 첫 접속이
  40~60초 느림(그 후엔 정상). 3명 테스트엔 무난.
- **사진 저장**: 기본은 서버 디스크(재배포 시 초기화). 위 R2 설정 시 영구 유지.
  깨진 이미지는 앱에서 폴백 아이콘으로 표시(빈 회색 박스 방지).
- **푸시 알림**: POC 기본 꺼둠(`PUSH_PROVIDER=noop`). 필요하면 VAPID 키 설정 후 켜기.
- **비밀번호 찾기 없음**: 테스트용 계정을 미리 정해 팀원에게 공유하는 게 편함.
