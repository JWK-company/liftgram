#!/usr/bin/env bash
# SPEC-018 Phase 1 — 안드로이드 출시 키 만들기(한 번만) · ADR-047
#
#   bash src/scripts/android-release-key.sh
#
# 자체 배포에서는 이 키가 곧 **앱 서명 키**다(플레이의 업로드 키가 아니다 — 잃으면 재설정할 길이 없고 모든 사용자가
# 다시 설치해야 한다). 그래서:
#   · 이미 있으면 **덮어쓰지 않고** 멈춘다
#   · 폴더 700 · 파일 600 (보안 M-4)
#   · 비밀번호는 무작위 32자를 파일(secret.properties)에만 — 명령줄·셸 기록·로그에 나오지 않게 -storepass:env 로 넘긴다
#   · 끝에 SHA-256 지문을 출력하고 src/mobile/release-cert.json 에 쓴다(앱 안 상수 · 빌드 검증 기준 — 커밋한다)
#   · 백업(암호화 사본 2벌 · 키와 비밀번호는 다른 매체 · 클라우드 동기 폴더 밖)은 사람의 일 — 끝에 안내한다
#
# 키 위치는 LIFTGRAM_RELEASE_DIR(기본 ~/.liftgram-release)로 바꿀 수 있다(시험용).
#
#   bash src/scripts/android-release-key.sh --cert-only   # 키는 그대로 두고 지문 기록(release-cert.json)만 다시 쓴다(복구용 · qa 보안 L-2)
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
DIR=${LIFTGRAM_RELEASE_DIR:-$HOME/.liftgram-release}
KEY="$DIR/upload.jks"
SECRET="$DIR/secret.properties"
ALIAS=liftgram
CERT_JSON=${RELEASE_CERT_JSON:-$HERE/mobile/release-cert.json}

: "${JAVA_HOME:=/opt/homebrew/opt/openjdk@21}"
KEYTOOL="$JAVA_HOME/bin/keytool"
[ -x "$KEYTOOL" ] || { echo "!! keytool 이 없다: $KEYTOOL (JAVA_HOME 을 JDK 21 로)"; exit 1; }

# 지문 기록 쓰기 — 이미 다른 지문이 적혀 있으면 멈춘다(시험 키가 진짜 지문을 덮지 않게 · qa 보안 M-4)
write_cert() {
  local fp=$1 hex old
  hex=$(printf '%s' "$fp" | tr -d ':' | tr 'A-F' 'a-f')
  if [ -f "$CERT_JSON" ]; then
    old=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get("sha256",""))' "$CERT_JSON" 2>/dev/null || true)
    if [ -n "$old" ] && [ "$old" != "$hex" ] && [ "${ALLOW_NEW_CERT:-0}" != "1" ]; then
      echo "!! $CERT_JSON 에 다른 지문이 이미 있다(${old:0:16}… ≠ ${hex:0:16}…) — 덮지 않는다(정말 키를 바꿨으면 ALLOW_NEW_CERT=1)"
      return 1
    fi
  fi
  umask 022
  cat >"$CERT_JSON" <<EOF
{
  "note": "안드로이드 출시 키(앱 서명 키)의 SHA-256 지문 — src/scripts/android-release-key.sh 가 만든다. 앱 안 상수(BuildConfig.RELEASE_CERT_SHA256)·빌드 검증·/app 공개 페이지가 이 값을 쓴다. 손으로 고치지 않는다.",
  "sha256": "$hex",
  "colon": "$fp"
}
EOF
}
read_fp() {
  "$KEYTOOL" -list -v -keystore "$KEY" -alias "$ALIAS" -storepass:file <(sed -n 's/^storePassword=//p' "$SECRET") 2>/dev/null \
    | sed -n 's/^[[:space:]]*SHA256: *//p' | sed -n 1p
}

if [ "${1:-}" = "--cert-only" ]; then
  [ -f "$KEY" ] && [ -f "$SECRET" ] || { echo "!! 키가 없다: $DIR"; exit 1; }
  FP=$(read_fp)
  [ -n "$FP" ] || { echo "!! 지문을 읽지 못했다"; exit 1; }
  write_cert "$FP"
  echo "  지문 $FP → $CERT_JSON"
  exit 0
fi

if [ -e "$KEY" ] || [ -e "$SECRET" ]; then
  echo "!! 이미 출시 키가 있다: $DIR — 덮어쓰지 않는다(이 키를 잃거나 바꾸면 모든 사용자가 다시 설치해야 한다)"
  echo "   지문 기록만 다시 쓰려면 --cert-only"
  exit 1
fi

umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"
# Time Machine 에서 뺀다 — 암호화하지 않은 백업 디스크에 키와 비밀번호가 함께 들어가지 않게(qa 보안 M-1).
# 백업은 사람이 암호화 사본 2벌로 한다(아래 안내).
command -v tmutil >/dev/null && tmutil addexclusion "$DIR" 2>/dev/null || true

# (tr </dev/urandom | head 는 pipefail 에서 SIGPIPE 141 로 죽는다 — python secrets 로)
PASS=$(python3 -c 'import secrets,string;a=string.ascii_letters+string.digits;print("".join(secrets.choice(a) for _ in range(32)))')
[ ${#PASS} -eq 32 ] || { echo "!! 무작위 비밀번호를 만들지 못했다"; exit 1; }
export LIFTGRAM_KS_PASS="$PASS"

# PKCS12 는 저장소·키 비밀번호가 같다 — 하나만 쓴다.
"$KEYTOOL" -genkeypair -v -storetype PKCS12 -keystore "$KEY" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 10950 \
  -dname "CN=Liftgram, O=tarae, C=KR" \
  -storepass:env LIFTGRAM_KS_PASS -keypass:env LIFTGRAM_KS_PASS >/dev/null 2>&1 \
  || { rm -f "$KEY"; echo "!! keytool 실패"; exit 1; }

{
  echo "# SPEC-018 출시 키 비밀번호 — 저장소에 넣지 않는다 · 백업은 키 파일과 다른 매체에"
  echo "storeFile=$KEY"
  echo "keyAlias=$ALIAS"
  echo "storePassword=$PASS"
  echo "keyPassword=$PASS"
} >"$SECRET"
chmod 600 "$KEY" "$SECRET"
unset LIFTGRAM_KS_PASS PASS

FP=$(read_fp)
[ -n "$FP" ] || { echo "!! 지문을 읽지 못했다 — 키는 만들어졌다: --cert-only 로 지문 기록만 다시"; exit 1; }
write_cert "$FP" || exit 1

echo "── 출시 키를 만들었다 ──"
echo "  키      $KEY (600)"
echo "  비밀번호 $SECRET (600)"
echo "  지문    $FP"
echo "  기록    $CERT_JSON (커밋한다)"
echo
echo "  ⚠ 백업: 이 키를 잃으면 모든 사용자가 앱을 다시 설치해야 한다."
echo "     암호화한 사본 2벌을 서로 다른 매체(예: 암호화 USB · 금고)에 · 키 파일과 비밀번호는 따로 · 클라우드 동기 폴더 밖."
echo "     백업을 끝내고 복원 시험(사본의 지문이 위와 같은지)까지 했으면:  echo <지문> > $DIR/BACKED_UP"
echo "     — 이 표식이 없으면 배포 스크립트가 APK 를 내보내지 않는다(qa 보안 H-2)."
