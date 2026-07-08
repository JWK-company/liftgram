// expo export 후처리 — dist/index.html <head>에 PWA 태그를 "정적으로" 주입한다.
// 클래식 Expo 웹(비-Router)은 생성 HTML의 head 커스터마이즈 훅이 없어, 매니페스트/아이콘/메타를
// 런타임 JS(initPwa)로 주입해 왔다. 그러나 모바일 크롬은 초기 HTML 파싱 시점에 <link rel=manifest>가
// 없으면 "앱 설치"를 신뢰성 있게 띄우지 않는다(런타임 주입은 타이밍 의존). 빌드 후처리로 정적 주입해
// 모든 기기에서 설치 가능(WebAPK)이 즉시 인식되게 한다. 런타임 주입(initPwa)은 idempotent라 공존해도 무해.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'dist', 'index.html');

try {
  let html = fs.readFileSync(file, 'utf8');
  if (/rel="manifest"/.test(html)) {
    console.log('[inject-pwa-head] manifest 이미 존재 — 스킵');
    process.exit(0);
  }
  const tags = [
    '<link rel="manifest" href="/manifest.json" />',
    '<meta name="theme-color" content="#0E1116" />',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
    '<link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="apple-mobile-web-app-title" content="Liftgram" />',
  ].join('\n    ');
  html = html.replace('</head>', '    ' + tags + '\n  </head>');
  fs.writeFileSync(file, html);
  console.log('[inject-pwa-head] dist/index.html <head>에 PWA 태그 정적 주입 완료');
} catch (e) {
  // 빌드를 깨지 않는다 — 경고만(런타임 initPwa가 폴백).
  console.warn('[inject-pwa-head] 스킵(파일 없음/오류): ' + String(e && e.message ? e.message : e));
  process.exit(0);
}
