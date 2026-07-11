// expo export 후처리 — (1) dist/sw.js에 배포별 버전 스탬프, (2) dist/index.html <head>에 PWA 태그 정적 주입.
//
// (1) 왜 sw.js 버전 스탬프: sw.js 내용이 배포마다 동일하면 브라우저가 서비스워커 '업데이트'를 감지하지
//     못해, 설치된 PWA가 옛 캐시 코드에 영구 고착된다(배포한 수정이 사용자에게 도달 못 함). 번들 해시를
//     CACHE 이름에 심어 매 배포마다 sw.js가 바뀌게 하면 → 브라우저가 새 SW 설치·활성화 → pwa.ts의
//     controllerchange 리스너가 페이지를 1회 리로드 → 최신 코드로 교체. activate에서 옛 캐시도 제거.
//
// (2) 왜 head 정적 주입: 모바일 크롬은 초기 HTML 파싱 시점에 <link rel=manifest>가 없으면 "앱 설치"를
//     신뢰성 있게 띄우지 않는다(런타임 initPwa 주입은 타이밍 의존). 빌드 후처리로 정적 주입해 즉시 인식.
const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const indexFile = path.join(distDir, 'index.html');
const swFile = path.join(distDir, 'sw.js');

let html = '';
try {
  html = fs.readFileSync(indexFile, 'utf8');
} catch (e) {
  console.warn('[inject-pwa-head] dist/index.html 없음 — 스킵: ' + String(e && e.message ? e.message : e));
  process.exit(0);
}

// 배포 식별자 = 메인 번들 해시(소스가 바뀔 때만 변경 → 실질 변경 시에만 SW 업데이트).
const buildId = (html.match(/index-([a-f0-9]+)\.js/) || [])[1] || String(Date.now());

// (1) sw.js 버전 스탬프 — CACHE 이름에 buildId 주입.
try {
  const sw = fs.readFileSync(swFile, 'utf8');
  const stamped = sw.replace(/const CACHE = '[^']*';/, "const CACHE = 'liftgram-" + buildId + "';");
  fs.writeFileSync(swFile, stamped);
  console.log('[inject-pwa-head] sw.js CACHE → liftgram-' + buildId);
} catch (e) {
  console.warn('[inject-pwa-head] sw.js 스탬프 스킵(파일 없음/오류): ' + String(e && e.message ? e.message : e));
}

// (2) index.html <head> PWA 태그 정적 주입(멱등).
try {
  if (/rel="manifest"/.test(html)) {
    console.log('[inject-pwa-head] manifest 이미 존재 — head 주입 스킵');
  } else {
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
    fs.writeFileSync(indexFile, html);
    console.log('[inject-pwa-head] dist/index.html <head>에 PWA 태그 정적 주입 완료');
  }
} catch (e) {
  // 빌드를 깨지 않는다 — 경고만(런타임 initPwa가 폴백).
  console.warn('[inject-pwa-head] head 주입 스킵: ' + String(e && e.message ? e.message : e));
}
