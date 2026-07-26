#!/usr/bin/env node
// 3D 움짤 에셋 인제스트 — 구매/제작한 GIF를 자체 호스팅 경로로 반입하고 매핑을 재생성한다. @plm SRS-046
// 사용:
//   node scripts/ingest-3d-media.js <gif-폴더> [매핑.csv]
//   - 매핑.csv 형식: nameKo,파일명   (없으면 파일명(확장자 제외)을 nameKo로 사용 — 예: '바벨 벤치프레스.gif')
// 동작: 검증(시드 nameKo 대조) → public/media3d/ 복사 → src/data/exerciseMedia3d.data.ts 재생성(정렬·멱등).
// 라이선스 확보된 에셋만 반입할 것(ADR-029 게이트 — 재배포 조항 확인 전 제3자 GIF 금지).
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const SEED = path.join(APP, 'src/data/seed/exercises.seed.ts');
const OUT_DIR = path.join(APP, 'public/media3d');
const DATA = path.join(APP, 'src/data/exerciseMedia3d.data.ts');

function seedNames() {
  const src = fs.readFileSync(SEED, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/nameKo:\s*'([^']+)'/g)) names.add(m[1]);
  return names;
}

function slugify(nameKo) {
  // URL 안전 파일명 — 한글 유지(퍼센트 인코딩은 서빙 시), 공백→하이픈, 괄호 제거.
  return nameKo.replace(/[()]/g, '').trim().replace(/\s+/g, '-') + '.gif';
}

function main() {
  const [dir, csv] = process.argv.slice(2);
  if (!dir || !fs.existsSync(dir)) {
    console.error('사용: node scripts/ingest-3d-media.js <gif-폴더> [매핑.csv]');
    process.exit(1);
  }
  const names = seedNames();

  // 매핑 구성: csv 우선, 없으면 파일명=nameKo.
  const pairs = []; // [nameKo, srcFile]
  if (csv && fs.existsSync(csv)) {
    for (const line of fs.readFileSync(csv, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf(',');
      if (i < 0) continue;
      pairs.push([t.slice(0, i).trim(), path.join(dir, t.slice(i + 1).trim())]);
    }
  } else {
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.gif')) continue;
      pairs.push([path.basename(f, path.extname(f)).trim(), path.join(dir, f)]);
    }
  }

  const unmatched = [];
  const mapping = {}; // nameKo -> /media3d/slug.gif
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [nameKo, src] of pairs) {
    if (!fs.existsSync(src)) {
      unmatched.push(`${nameKo} (파일 없음: ${src})`);
      continue;
    }
    if (!names.has(nameKo)) {
      unmatched.push(`${nameKo} (시드에 없는 nameKo — KEY 규약 확인)`);
      continue;
    }
    const slug = slugify(nameKo);
    fs.copyFileSync(src, path.join(OUT_DIR, slug));
    mapping[nameKo] = `/media3d/${encodeURIComponent(slug)}`;
  }

  // 기존 매핑과 병합(멱등 — 재실행 시 새 파일만 추가·갱신).
  const existing = fs.existsSync(DATA) ? fs.readFileSync(DATA, 'utf8') : '';
  for (const m of existing.matchAll(/'([^']+)':\s*'([^']+)'/g)) {
    if (!(m[1] in mapping)) mapping[m[1]] = m[2];
  }

  const entries = Object.keys(mapping)
    .sort()
    .map((k) => `  '${k}': '${mapping[k]}',`)
    .join('\n');
  fs.writeFileSync(
    DATA,
    `// 3D 스타일 움짤 오버레이 매핑 — scripts/ingest-3d-media.js 가 생성/갱신(수기 편집 비권장). @plm SRS-046
// 키=종목 nameKo(조회 KEY), 값=자체 호스팅 GIF 경로(/media3d/*.gif — app/public/media3d에 배치, ADR-029 자체 호스팅).
// 라이선스 확보된 에셋만 넣는다: ADR-029 게이트(재배포 조항 원문 확인) 통과 전 제3자 GIF 반입 금지.
// 비어 있는 동안에는 기존 2프레임(free-exercise-db) 시연이 그대로 사용된다 — 코드 변경 없이 이 파일만 채우면 전환.
export const RAW_MEDIA_3D: Record<string, string> = {
${entries}
};
`,
  );
  console.log(`인제스트 완료: ${Object.keys(mapping).length}건 매핑 (신규 ${pairs.length - unmatched.length}건 복사)`);
  if (unmatched.length) {
    console.log(`⚠ 미반영 ${unmatched.length}건:`);
    for (const u of unmatched) console.log('  - ' + u);
  }
}

main();
