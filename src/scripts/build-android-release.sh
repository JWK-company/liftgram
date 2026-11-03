#!/usr/bin/env bash
# SPEC-018 Phase 1 — 서명된 안드로이드 출시 APK 한 벌 + android.json (ADR-047 · SRS-099)
#
#   bash src/scripts/build-android-release.sh <저장소 루트> <출력 폴더>
#     예) 배포:  build-android-release.sh "$CLEAN" "$CLEAN/src/frontend/public/downloads"
#         단독:  build-android-release.sh . /tmp/liftgram-apk
#
# 순서(바꾸지 않는다):
#   ① 사전 검사 — JDK·SDK·apksigner·zipalign·aapt2·출시 키·지문 기록(운영 M-5)
#   ② 캐시 — ~/.liftgram-release/apk/<versionCode>/ 에 같은 버전이 있으면 다시 확인(sha256·지문)하고 그것을 쓴다.
#      캐시 커밋 뒤 APK 에 들어가는 파일이 바뀌었으면 **멈춘다**(versionCode 를 올리라 — 같은 번호에 다른 앱이 나가면
#      이미 받은 사람은 업데이트를 못 받는다 · 운영 M-1). 알고 넘기려면 ALLOW_SAME_APK=1.
#   ③ 빌드는 **키 없이** — bun install --frozen-lockfile → cap sync → assembleRelease. 의존성 gradle 코드가 키·비밀번호를
#      못 보게 한다(보안 M-4). cap sync 가 추적 파일을 바꾸면 멈춘다(운영 L-1).
#   ④ 서명은 여기서만 — zipalign → apksigner(v2·v3). 비밀번호는 환경 변수로만 넘긴다.
#   ⑤ 검증 — apksigner verify(v2 참 · 지문 = src/mobile/release-cert.json) · aapt2 badging(패키지·버전 = src/mobile/release.json).
#      하나라도 다르면 멈춘다. 서명 없는 APK 는 절대 내보내지 않는다(운영 M-6).
#   ⑥ 깨끗한 커밋에서 만든 것만 캐시에 넣는다(운영 H-3) — 임시 폴더 → mv · mkdir 잠금(운영 M-8) · 직전 버전 한 벌 보관(운영 L-3).
#   ⑦ 출력 — liftgram-<versionName>-<versionCode>-<sha8>.apk(이름 = 바이트 · 운영 H-1) + android.json.
#
# 환경: LIFTGRAM_RELEASE_DIR(기본 ~/.liftgram-release) · JAVA_HOME(기본 openjdk@21) · ANDROID_HOME(기본 ~/Library/Android/sdk)
#
#   bash src/scripts/build-android-release.sh --verify <apk> <versionName> <versionCode> <저장소 루트>
#     검증만(키 불필요) — 배포 스크립트의 SKIP_APK 되받기가 같은 검사를 쓴다(Phase 1 qa 보안 M-5).
set -euo pipefail
MODE=build
if [ "${1:-}" = "--verify" ]; then
  [ $# -eq 5 ] || { echo "쓰는 법: $0 --verify <apk> <versionName> <versionCode> <저장소 루트>"; exit 2; }
  MODE=verify
  VERIFY_APK=$2
  VERIFY_VN=$3
  VERIFY_VC=$4
  SRC=$(cd "$5" && pwd)
  OUT=""
else
  [ $# -eq 2 ] || { echo "쓰는 법: $0 <저장소 루트> <출력 폴더>"; exit 2; }
  SRC=$(cd "$1" && pwd)
  OUT=$2
fi
MOB="$SRC/src/mobile"
DIR=${LIFTGRAM_RELEASE_DIR:-$HOME/.liftgram-release}
KEY="$DIR/upload.jks"
SECRET="$DIR/secret.properties"
CACHE_ROOT="$DIR/apk"
PKG=org.tarae.liftgram
# APK 에 들어가는 것 — 이것이 캐시 커밋 뒤에 바뀌면 같은 versionCode 를 다시 쓰지 않는다(운영 M-1 · ios 는 안드로이드 APK 밖)
#   iOS 만의 파일(앱·위젯·Swift 패키지·잠금 규칙 검사기)은 빼서 거짓 멈춤을 줄인다(Phase 1 qa 운영 L-2)
APK_PATHS=(src/mobile ':(exclude)src/mobile/ios' ':(exclude)src/mobile/native/liftgram-native/ios'
  ':(exclude)src/mobile/native/liftgram-native/Package.swift' ':(exclude)src/mobile/native/lock-core-check')
SERVER_URL=https://liftgram.tarae.org

say() { printf '  %s\n' "$*"; }
die() { printf '!! %s\n' "$*" >&2; exit 1; }

# ── ① 사전 검사 ───────────────────────────────────────────────────────────────
export JAVA_HOME=${JAVA_HOME:-/opt/homebrew/opt/openjdk@21}
[ -x "$JAVA_HOME/bin/java" ] || die "JDK 가 없다: JAVA_HOME=$JAVA_HOME (brew install openjdk@21)"
jv=$("$JAVA_HOME/bin/java" -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -1)
[ "$jv" = "21" ] || die "JDK 21 이 필요하다(지금 ${jv:-?}) — JAVA_HOME 을 openjdk@21 로"
export ANDROID_HOME=${ANDROID_HOME:-$HOME/Library/Android/sdk}
[ -d "$ANDROID_HOME/platforms" ] || die "안드로이드 SDK 가 없다: ANDROID_HOME=$ANDROID_HOME"
# (ls 가 비면 pipefail 로 조용히 끝났다 — 끝 코드를 삼키고 아래에서 안내 · Phase 1 qa 운영 L-1)
BT=$( (ls -d "$ANDROID_HOME"/build-tools/*/ 2>/dev/null || true) | sort -V | tail -1)
BT=${BT%/}
for t in apksigner zipalign aapt2; do [ -x "$BT/$t" ] || die "build-tools 에 $t 가 없다: ${BT:-<없음>}"; done
command -v bun >/dev/null || die "bun 이 없다"
command -v python3 >/dev/null || die "python3 이 없다"
if [ "$MODE" = build ]; then
  [ -f "$KEY" ] && [ -f "$SECRET" ] || die "출시 키가 없다: $DIR — 먼저 src/scripts/android-release-key.sh (서명 없는 APK 는 내보내지 않는다)"
fi
[ -f "$MOB/release.json" ] || die "$MOB/release.json 이 없다"
[ -f "$MOB/release-cert.json" ] || die "$MOB/release-cert.json 이 없다(키 지문 기록 — android-release-key.sh 가 만든다)"

jget() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$1" "$2"; }
VN=$(jget "$MOB/release.json" versionName)
VC=$(jget "$MOB/release.json" versionCode)
[[ "$VN" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "release.json 의 versionName 이 X.Y.Z 가 아니다: $VN"
# 버전 원본은 release.json 하나 — package.json 이 다르면 어느 쪽이 맞는지 모른다(Phase 1 qa 안드로이드 M-3)
PJV=$(jget "$MOB/package.json" version)
[ "$PJV" = "$VN" ] || die "src/mobile/package.json version($PJV) 이 release.json versionName($VN) 과 다르다 — 둘을 맞춰라"
MINV=$(jget "$MOB/release.json" minVersionCode)
MINS=$(jget "$MOB/release.json" minSignedVersionCode)
CERT=$(jget "$MOB/release-cert.json" sha256)
[[ "$VC" =~ ^[0-9]+$ ]] && [[ "$MINV" =~ ^[0-9]+$ ]] && [[ "$MINS" =~ ^[0-9]+$ ]] || die "release.json 의 버전 코드가 정수가 아니다"
[ "$MINV" -le "$VC" ] && [ "$MINS" -le "$VC" ] || die "release.json: minVersionCode·minSignedVersionCode 는 versionCode 이하여야 한다"
[[ "$CERT" =~ ^[0-9a-f]{64}$ ]] || die "release-cert.json 의 sha256 이 64 hex 가 아니다"
if [ "$MODE" = verify ]; then
  # 되받은 APK 는 사이트의 버전이다(웹만 되돌릴 때) — 기준을 인자로 바꾼다
  VN=$VERIFY_VN
  VC=$VERIFY_VC
  [[ "$VN" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] && [[ "$VC" =~ ^[0-9]+$ ]] || die "검증 기준 버전 형식이 이상하다: $VN / $VC"
fi
COMMIT=$(git -C "$SRC" rev-parse HEAD)
DIRTY=$(git -C "$SRC" status --porcelain -- "${APK_PATHS[@]}" | wc -l | tr -d ' ')
[ "$MODE" = build ] && echo "── 안드로이드 출시 APK ${VN} (${VC}) · 커밋 ${COMMIT:0:7}$([ "$DIRTY" != 0 ] && echo " · 미커밋 ${DIRTY}건(캐시 안 함)") ──"

sha_of() { shasum -a 256 "$1" | cut -d' ' -f1; }
size_of() { stat -f%z "$1" 2>/dev/null || stat -c%s "$1"; }

# 서명·버전 검증 — 실패하면 멈춘다(⑤)
verify_apk() {
  local apk=$1 v b fp
  local all cfg url
  v=$("$BT/apksigner" verify --print-certs -v "$apk" 2>&1) || die "apksigner verify 실패: $apk"
  grep -q 'Verified using v2 scheme (APK Signature Scheme v2): true' <<<"$v" || die "v2 서명이 없다: $apk"
  grep -q 'Verified using v3 scheme (APK Signature Scheme v3): true' <<<"$v" || die "v3 서명이 없다: $apk"
  # 서명자 수는 apksigner 의 요약 줄로 — 「Signer #N」 줄만 세면 v3.1 회전 서명자를 놓친다(Phase 1 qa 보안 L-4)
  grep -q '^Number of signers: 1$' <<<"$v" || die "서명자가 하나가 아니다: $apk"
  fp=$(sed -n 's/^Signer #1 certificate SHA-256 digest: *//p' <<<"$v")
  fp=$(printf '%s' "${fp%%$'\n'*}" | tr 'A-F' 'a-f')
  [ "$fp" = "$CERT" ] || die "서명 지문이 출시 키와 다르다: ${fp:-?} ≠ ${CERT} ($apk)"
  # (aapt2 | head 는 pipefail 에서 SIGPIPE 141 — 전부 받은 뒤 첫 줄만)
  all=$("$BT/aapt2" dump badging "$apk" 2>/dev/null) || die "aapt2 badging 실패: $apk"
  b=${all%%$'\n'*}
  [[ "$b" == *"name='$PKG' versionCode='$VC' versionName='$VN'"* ]] || die "패키지·버전이 release.json 과 다르다: $b"
  # 출시 APK 는 디버그 가능·시험 전용이면 안 된다(Phase 1 qa 운영 L-6 · 안드로이드 L-3)
  ! grep -q '^application-debuggable' <<<"$all" || die "debuggable APK 다: $apk"
  ! grep -q "testOnly='-1'" <<<"$all" || die "testOnly APK 다: $apk"
  # 16KB 페이지 정렬(네이티브 라이브러리가 들어와도 설치되게 · Phase 1 qa 안드로이드 M-1)
  "$BT/zipalign" -c -P 16 4 "$apk" >/dev/null 2>&1 || die "16KB 정렬이 아니다: $apk"
  # 앱이 띄울 화면 주소 — 서명된 APK 안의 capacitor.config.json 으로 본다(무시 대상 파일이라 저장소 검사로는 못 본다 · 안드로이드 L-5)
  cfg=$(unzip -p "$apk" assets/capacitor.config.json 2>/dev/null) || die "APK 에 capacitor.config.json 이 없다: $apk"
  url=$(python3 -c 'import json,sys;print(json.loads(sys.argv[1]).get("server",{}).get("url",""))' "$cfg")
  [ "$url" = "$SERVER_URL" ] || die "APK 의 server.url 이 ${SERVER_URL} 이 아니다: ${url:-<없음>}"
}

if [ "$MODE" = verify ]; then
  verify_apk "$VERIFY_APK"
  say "검증 OK: $VERIFY_APK (${PKG} ${VN}/${VC} · 지문 ${CERT:0:16}…)"
  exit 0
fi

# 잠금 — 캐시를 만지는 실행은 하나씩. SIGKILL 로 남은 잠금은 주인 pid 가 없으면 걷는다(Phase 1 qa 운영 L-3 · 빌드 **전에** 확인)
take_lock() {
  mkdir -p "$CACHE_ROOT"
  chmod 700 "$DIR" "$CACHE_ROOT" 2>/dev/null || true
  if ! mkdir "$CACHE_ROOT/.lock" 2>/dev/null; then
    local owner
    owner=$(cat "$CACHE_ROOT/.lock/pid" 2>/dev/null || true)
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
      rm -rf "$CACHE_ROOT/.lock"
      mkdir "$CACHE_ROOT/.lock" || die "캐시 잠금을 잡지 못했다"
      say "남은 잠금(pid $owner — 없음)을 걷었다"
    else
      die "다른 빌드가 캐시를 쓰는 중이다(pid ${owner:-?} · $CACHE_ROOT/.lock) — 끝난 뒤 다시"
    fi
  fi
  echo $$ >"$CACHE_ROOT/.lock/pid"
  LOCKED=1
}

write_out() { # <apk> <sha256> <builtAt> <commit>
  local apk=$1 sha=$2 built=$3 cm=$4 name size
  name="liftgram-${VN}-${VC}-${sha:0:8}.apk"
  size=$(size_of "$apk")
  mkdir -p "$OUT"
  # 바로 앞 버전 APK 도 한 벌 같이 싣는다 — 배포 순간 받던 사람·이어받기가 404(그리고 HTML 바이트)를 받지 않게
  # (Phase 1 qa 운영 M-5 · 웹 M-2). json 은 이번 것만 가리킨다.
  local prev_vc prev_file=""
  prev_vc=$( (ls "$CACHE_ROOT" 2>/dev/null || true) | grep -E '^[0-9]+$' | sort -n | awk -v v="$VC" '$1<v' | tail -1 || true)
  if [ -n "$prev_vc" ] && [ -f "$CACHE_ROOT/$prev_vc/meta.json" ]; then
    prev_file=$(jget "$CACHE_ROOT/$prev_vc/meta.json" file)
    [ -f "$CACHE_ROOT/$prev_vc/$prev_file" ] || prev_file=""
  fi
  mkdir -p "$OUT"
  # 나머지 APK 는 치운다(옛 이름은 immutable 엣지 캐시에 남아 있다)
  find "$OUT" -maxdepth 1 -name 'liftgram-*.apk' ! -name "$name" ${prev_file:+! -name "$prev_file"} -delete
  cp "$apk" "$OUT/$name.tmp" && mv "$OUT/$name.tmp" "$OUT/$name"
  [ "$(sha_of "$OUT/$name")" = "$sha" ] || die "복사한 APK 의 sha256 이 다르다"
  if [ -n "$prev_file" ] && [ "$prev_file" != "$name" ]; then
    cp "$CACHE_ROOT/$prev_vc/$prev_file" "$OUT/$prev_file.tmp" && mv "$OUT/$prev_file.tmp" "$OUT/$prev_file"
    say "직전 APK 도 싣는다: $prev_file"
  fi
  # 값은 argv 로만 넘긴다(heredoc 치환에 버전 문자열을 끼우지 않는다 · Phase 1 qa 운영 L-5)
  python3 -c 'import json,sys
a=sys.argv
d={"v":1,"versionName":a[2],"versionCode":int(a[3]),"url":"/downloads/"+a[4],"sha256":a[5],"size":int(a[6]),
   "certSha256":a[7],"minVersionCode":int(a[8]),"minSignedVersionCode":int(a[9]),"builtAt":a[10],"commit":a[11][:7]}
with open(a[1]+".tmp","w") as f:
  json.dump(d,f,ensure_ascii=False,indent=2); f.write("\n")' \
    "$OUT/android.json" "$VN" "$VC" "$name" "$sha" "$size" "$CERT" "$MINV" "$MINS" "$built" "$cm"
  mv "$OUT/android.json.tmp" "$OUT/android.json"
  say "출력 $OUT/$name ($size B · sha256 ${sha:0:16}…)"
  say "     $OUT/android.json"
}

# ── ② 캐시 ────────────────────────────────────────────────────────────────────
C="$CACHE_ROOT/$VC"
if [ -f "$C/meta.json" ]; then
  capk="$C/$(jget "$C/meta.json" file)"
  csha=$(jget "$C/meta.json" sha256)
  ccm=$(jget "$C/meta.json" commit)
  cbuilt=$(jget "$C/meta.json" builtAt)
  [ -f "$capk" ] && [ "$(sha_of "$capk")" = "$csha" ] || die "캐시 APK 의 sha256 이 기록과 다르다: $C — 그 폴더를 확인하라(손대지 않는다)"
  verify_apk "$capk"
  if [ "${ALLOW_SAME_APK:-0}" != "1" ]; then
    git -C "$SRC" cat-file -e "${ccm}^{commit}" 2>/dev/null \
      || die "캐시 APK(${VC})의 커밋 ${ccm:0:7} 을 이 저장소가 모른다 — 비교할 수 없어 멈춘다(ALLOW_SAME_APK=1 로 넘김)"
    changed=$(git -C "$SRC" diff --name-only "$ccm" -- "${APK_PATHS[@]}" | wc -l | tr -d ' ')
    if [ "$changed" != "0" ]; then
      git -C "$SRC" diff --name-only "$ccm" -- "${APK_PATHS[@]}" | sed -n '1,10s/^/     /p' >&2
      die "versionCode ${VC} 의 APK 는 커밋 ${ccm:0:7} 로 이미 나갔는데 그 뒤 앱 파일 ${changed}건이 바뀌었다 — src/mobile/release.json 의 versionCode(와 versionName)를 올려라(알고 넘기려면 ALLOW_SAME_APK=1)"
    fi
  fi
  say "캐시 사용: $C (커밋 ${ccm:0:7} · ${cbuilt})"
  write_out "$capk" "$csha" "$cbuilt" "$ccm"
  exit 0
fi

# ── ③ 빌드(키 없이) ───────────────────────────────────────────────────────────
WORK=$(mktemp -d)
LOCKED=""
cleanup() { rm -rf "$WORK"; [ -n "$LOCKED" ] && rm -rf "$CACHE_ROOT/.lock" 2>/dev/null || true; }
trap cleanup EXIT
[ "$DIRTY" = "0" ] && take_lock
before=$( (git -C "$SRC" diff -- "${APK_PATHS[@]}"; git -C "$SRC" status --porcelain -- "${APK_PATHS[@]}") | shasum | cut -d' ' -f1)
say "의존성(bun install --frozen-lockfile)"
(cd "$MOB" && bun install --frozen-lockfile >"$WORK/bun.log" 2>&1) || { tail -20 "$WORK/bun.log"; die "bun install 실패"; }
say "cap sync android"
(cd "$MOB" && ./node_modules/.bin/cap sync android >"$WORK/sync.log" 2>&1) || { tail -20 "$WORK/sync.log"; die "cap sync 실패"; }
after=$( (git -C "$SRC" diff -- "${APK_PATHS[@]}"; git -C "$SRC" status --porcelain -- "${APK_PATHS[@]}") | shasum | cut -d' ' -f1)
if [ "$before" != "$after" ]; then
  git -C "$SRC" status --porcelain -- "${APK_PATHS[@]}" | sed -n '1,10s/^/     /p' >&2
  die "cap sync 가 저장소의 추적 파일을 바꿨다 — 생성물을 커밋한 뒤 다시(운영 L-1)"
fi
say "gradle assembleRelease(서명 없이)"
REL_OUT="$MOB/android/app/build/outputs/apk/release"
rm -rf "$REL_OUT" # 옛 산출물을 이번 것으로 착각하지 않게(Phase 1 qa 안드로이드 L-4)
# --no-daemon: 데몬이 남아 1~2GB 를 잡고, 서명 단계까지 살아 있는 의존성 코드가 없게(운영 M-6 · 보안 M-2)
(cd "$MOB/android" && env -u LIFTGRAM_UPLOAD_KEY_PROPS ./gradlew --no-daemon -q :app:assembleRelease >"$WORK/gradle.log" 2>&1) \
  || { tail -30 "$WORK/gradle.log"; die "gradle 빌드 실패"; }
# 산출물 이름은 AGP 가 적은 output-metadata.json 에서 읽는다(이름 규칙이 바뀌어도)
UNSIGNED="$REL_OUT/$(python3 -c 'import json,sys;e=json.load(open(sys.argv[1]))["elements"];print(e[0]["outputFile"] if len(e)==1 else "")' "$REL_OUT/output-metadata.json" 2>/dev/null || true)"
[ -f "$UNSIGNED" ] || die "출시 APK 가 하나 나와야 하는데 없다: $REL_OUT"
[[ "$UNSIGNED" == *unsigned.apk ]] || die "gradle 이 서명한 APK 를 냈다($UNSIGNED) — 키가 gradle 에 닿았다(build.gradle signingConfigs 확인)"

# ── ④ 서명(키는 여기서만) ─────────────────────────────────────────────────────
# 16KB 페이지 정렬(-P 16) — 4KB(-p)는 AGP 가 맞춘 .so 정렬을 낮춘다(Phase 1 qa 안드로이드 M-1)
"$BT/zipalign" -P 16 -f 4 "$UNSIGNED" "$WORK/aligned.apk"
ALIAS=$(sed -n 's/^keyAlias=//p' "$SECRET")
# 비밀번호는 표준 입력으로만 — 환경 변수(ps eww 로 보임)·명령줄·set -x 에 나오지 않게(보안 M-2·L-1). PKCS12 는 키 비밀번호가 같다.
"$BT/apksigner" sign --ks "$KEY" --ks-key-alias "${ALIAS:-liftgram}" --ks-pass stdin \
  --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --v4-signing-enabled false \
  --out "$WORK/signed.apk" "$WORK/aligned.apk" \
  < <(sed -n 's/^storePassword=//p' "$SECRET") >/dev/null 2>"$WORK/sign.log" || { cat "$WORK/sign.log"; die "apksigner sign 실패"; }

# ── ⑤ 검증 ────────────────────────────────────────────────────────────────────
verify_apk "$WORK/signed.apk"
SHA=$(sha_of "$WORK/signed.apk")
BUILT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
say "서명·검증 OK (v2·v3 · 16KB 정렬 · 지문 ${CERT:0:16}… · ${PKG} ${VN}/${VC})"

# ── ⑥ 캐시(깨끗한 커밋만) ─────────────────────────────────────────────────────
if [ "$DIRTY" = "0" ]; then
  if [ -e "$C" ]; then
    say "그 사이 다른 실행이 캐시 ${VC} 를 만들었다 — 내 결과는 캐시하지 않는다"
  else
    T="$CACHE_ROOT/.tmp.$$"
    rm -rf "$T"; mkdir -p "$T"
    fname="liftgram-${VN}-${VC}-${SHA:0:8}.apk"
    cp "$WORK/signed.apk" "$T/$fname"
    python3 -c 'import json,sys;json.dump(dict(file=sys.argv[2],sha256=sys.argv[3],commit=sys.argv[4],builtAt=sys.argv[5],versionName=sys.argv[6],versionCode=int(sys.argv[7])),open(sys.argv[1],"w"),indent=2)' \
      "$T/meta.json" "$fname" "$SHA" "$COMMIT" "$BUILT" "$VN" "$VC"
    mv "$T" "$C"
    say "캐시 저장: $C"
    # 보관 — 이번 것과 그 바로 아래 버전 한 벌만 남긴다(되돌리기용 · 운영 L-3)
    keep_prev=$( (ls "$CACHE_ROOT" || true) | grep -E '^[0-9]+$' | sort -n | awk -v v="$VC" '$1<v' | tail -1 || true)
    for d in $( (ls "$CACHE_ROOT" || true) | grep -E '^[0-9]+$' || true); do
      [ "$d" = "$VC" ] || [ "$d" = "$keep_prev" ] || [ "$d" -gt "$VC" ] || { rm -rf "${CACHE_ROOT:?}/$d"; say "옛 캐시 정리: $d"; }
    done
  fi
  rm -rf "$CACHE_ROOT/.lock"; LOCKED=""
else
  say "미커밋 앱 파일이 있어 캐시하지 않는다(운영 H-3) — 이 APK 는 시험용"
fi

# ── ⑦ 출력 ────────────────────────────────────────────────────────────────────
write_out "$WORK/signed.apk" "$SHA" "$BUILT" "$COMMIT"
