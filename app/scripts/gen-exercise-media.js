#!/usr/bin/env node
// 종목 미디어 매핑 생성 — free-exercise-db 매칭 + 자체 스텝(supplement) 병합 코드젠. @plm SRS-032
// 사용:
//   node scripts/gen-exercise-media.js <exercises.json>
//   - exercises.json = free-exercise-db 덤프(비커밋 · 다운로드:
//     https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json)
//   - 콘텐츠 입력 = scripts/media-supplement.json (커밋 — 매칭 종목 한국어 번역 k / 무매칭 종목 k+en)
// 동작:
//   1) 시드에서 미디어 미커버 근력 종목 추출(유산소 제외 — hasTip 차단 정책 유지)
//   2) nameEn 정규화 정확일치 + ALIAS(사람 검수 확정 별칭)로 db 매칭 → s/e 이미지 + en 스텝
//   3) supplement의 k(번역)·k+en(자체 작성)을 병합해 src/data/exerciseMedia.data.ts의
//      마커(GENERATED_MARK) 이후 블록을 재생성(기존 수기 블록은 보존 · 멱등)
//   4) scripts/media-match-report.md(매칭쌍 검수 표)·scripts/media-unmatched.txt(무매칭) 산출
// 카피 게이트: k에 의료 단정 금칙어 존재 시 실패(containsMedicalClaim와 동일 패턴).
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..');
const SEED = path.join(APP, 'src/data/seed/exercises.seed.ts');
const DATA = path.join(APP, 'src/data/exerciseMedia.data.ts');
const SUPPLEMENT = path.join(__dirname, 'media-supplement.json');
const REPORT = path.join(__dirname, 'media-match-report.md');
const UNMATCHED = path.join(__dirname, 'media-unmatched.txt');
const GENERATED_MARK = '// ── 카탈로그 대확장 자동 생성부 (gen-exercise-media.js — 이 마커 아래는 재실행 시 재생성) ──';

// 사람 검수 확정 별칭 (2026-08 카탈로그 대확장 — 스펙 negative 규칙 통과·기구/자세 일치 확인).
// 기각 근거 예: Split Squat with Dumbbells=뒷발 거치(불가리안)라 스플릿 스쿼트에 부적합,
// Torso Rotation=짐볼 운동이라 토르소 로테이션 머신에 부적합. 상세는 media-match-report.md.
const ALIAS = {
  '원암 푸시업': 'Single-Arm Push-Up',
  '디클라인 덤벨 플라이': 'Decline Dumbbell Flyes',
  '덤벨 어라운드 더 월드': 'Around The Worlds',
  '링 딥스': 'Ring Dips',
  '레니게이드 로우': 'Alternating Renegade Row',
  '스터넘 풀업': 'Gironda Sternum Chins',
  '핸드스탠드 푸시업': 'Handstand Push-Ups',
  '리버스 그립 푸시다운': 'Reverse Grip Triceps Pushdown',
  '트라이셉스 익스텐션 머신': 'Machine Triceps Extension',
  '비하인드 백 리스트 컬': 'Standing Palms-Up Barbell Behind The Back Wrist Curl',
  '리버스 컬 (덤벨)': 'Standing Dumbbell Reverse Curl',
  '리버스 컬 (케이블)': 'Reverse Cable Curl',
  '슈러그 (머신)': 'Calf-Machine Shoulder Shrug',
  '저처 스쿼트': 'Zercher Squats',
  '스모 스쿼트': 'Plie Dumbbell Squat',
  '점프 스쿼트': 'Freehand Jump Squat',
  '박스 점프': 'Front Box Jump',
  '프로그 점프': 'Frog Hops',
  '커시 런지': 'Crossover Reverse Lunge',
  '케이블 풀 스루': 'Pull Through',
  'V 싯업': 'Jackknife Sit-Up',
  '플러터 킥': 'Flutter Kicks',
  '토 터치': 'Toe Touchers',
  '힐 터치': 'Alternate Heel Touchers',
  '사이드 크런치': 'Oblique Crunches',
  '사이드 벤드': 'Dumbbell Side Bend',
  '패러럴 바 니 레이즈': 'Knee/Hip Raise On Parallel Bars',
  '랜드마인 180': "Landmine 180's",
  '케틀벨 하이 풀': 'Kettlebell Sumo High Pull',
  '터키시 겟업': 'Kettlebell Turkish Get-Up (Lunge style)',
};

const FORBIDDEN = ['진단', '치료', '완치', '질병 예방', '100% 보장', '확실히 낫', '효능'];
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const baseOf = (n) => n.replace(/\s*\([^)]*\)\s*$/, '').trim();

function main() {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error('사용: node scripts/gen-exercise-media.js <free-exercise-db exercises.json>');
    process.exit(1);
  }
  const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  const dbByNorm = new Map(db.map((d) => [norm(d.name), d]));
  const dbByName = new Map(db.map((d) => [d.name, d]));
  const supplement = fs.existsSync(SUPPLEMENT) ? JSON.parse(fs.readFileSync(SUPPLEMENT, 'utf8')) : {};

  // 시드 파싱 — 근력(kind 미지정)만 대상.
  const seedSrc = fs.readFileSync(SEED, 'utf8');
  const seedEntries = [];
  for (const m of seedSrc.matchAll(/nameKo:\s*'((?:[^'\\]|\\.)*)',\s*nameEn:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")(.*)$/gm)) {
    seedEntries.push({
      ko: m[1].replace(/\\'/g, "'"),
      en: (m[2] ?? m[3]).replace(/\\'/g, "'"),
      cardio: /kind:\s*'cardio'/.test(m[4]),
    });
  }
  const seedNames = new Set(seedEntries.map((e) => e.ko));

  // 기존 데이터 파일 — 마커 이전(수기·기존 블록)은 보존.
  const dataSrc = fs.readFileSync(DATA, 'utf8');
  const markIdx = dataSrc.indexOf(GENERATED_MARK);
  const preserved = markIdx >= 0 ? dataSrc.slice(0, markIdx).replace(/\s+$/, '\n') : dataSrc.replace(/\};\s*$/, '');
  const preservedKeys = new Set([...preserved.matchAll(/^\s*"((?:[^"\\]|\\.)*)":\s*\{/gm)].map((m) => m[1]));
  const covered = (ko) => preservedKeys.has(ko) || preservedKeys.has(baseOf(ko));

  const targets = seedEntries.filter((e) => !e.cardio && !covered(e.ko));
  const lines = [];
  const reportRows = [];
  const unmatched = [];
  for (const t of targets) {
    const aliasName = ALIAS[t.ko];
    const d = aliasName ? dbByName.get(aliasName) : dbByNorm.get(norm(t.en));
    const sup = supplement[t.ko];
    if (d) {
      if (!d.images || d.images.length < 2) throw new Error(`이미지 부족: ${d.name}`);
      const k = sup?.k ?? [];
      // db 지시문이 빈 종목(예: Push Press)은 supplement의 en으로 보충.
      const en = d.instructions?.length ? d.instructions : sup?.en ?? [];
      checkForbidden(t.ko, k);
      lines.push(entryLine(t.ko, { s: d.images[0], e: d.images[1], k, en }));
      reportRows.push(`| ${t.ko} | ${d.name} | ${aliasName ? 'alias(검수)' : 'exact'} | ${k.length ? '✓' : '—'} |`);
    } else if (sup?.k && sup?.en) {
      checkForbidden(t.ko, sup.k);
      lines.push(entryLine(t.ko, { k: sup.k, en: sup.en })); // steps-only(s/e 없음)
      reportRows.push(`| ${t.ko} | (무매칭 — 자체 스텝) | steps-only | ✓ |`);
    } else {
      unmatched.push(t.ko);
    }
  }

  const out = `${preserved}\n  ${GENERATED_MARK}\n  // 매칭=free-exercise-db 이미지+영문 스텝(+한국어 번역), steps-only=자체 작성(s/e 없음 → 단계 설명만 렌더). @plm SRS-032 SRS-046\n${lines.join('\n')}\n};\n`;
  fs.writeFileSync(DATA, out);
  fs.writeFileSync(
    REPORT,
    `# 미디어 매칭 검수 표 (gen-exercise-media.js 산출)\n\n정확일치 외 매칭(alias)은 기구·자세 토큰 대조(negative 규칙) 후 사람 검수로 확정된 것만 ALIAS 맵에 등재.\n\n| nameKo | free-exercise-db | 방식 | 한국어 스텝 |\n|---|---|---|---|\n${reportRows.join('\n')}\n\n무매칭(스텝 대기): ${unmatched.length}건 — media-unmatched.txt\n`,
  );
  fs.writeFileSync(UNMATCHED, unmatched.join('\n') + (unmatched.length ? '\n' : ''));
  // supplement 죽은 키 검증(시드에 없는 종목 콘텐츠 방지).
  const dead = Object.keys(supplement).filter((k) => !seedNames.has(k));
  if (dead.length) throw new Error(`supplement 죽은 키: ${dead.join(', ')}`);
  console.log(`생성 ${lines.length}건 (매칭 ${reportRows.filter((r) => !r.includes('steps-only')).length} · steps-only ${reportRows.filter((r) => r.includes('steps-only')).length}) · 무매칭 잔여 ${unmatched.length}`);
}

function checkForbidden(ko, steps) {
  for (const s of steps) for (const p of FORBIDDEN) if (s.includes(p)) throw new Error(`금칙어 '${p}' — ${ko}: ${s}`);
}

function entryLine(ko, { s, e, k, en }) {
  const parts = [];
  if (s) parts.push(`s: ${JSON.stringify(s)}, e: ${JSON.stringify(e)}`);
  parts.push(`k: ${JSON.stringify(k)}`, `en: ${JSON.stringify(en)}`);
  return `  ${JSON.stringify(ko)}: { ${parts.join(', ')} },`;
}

main();
