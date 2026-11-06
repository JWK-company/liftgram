#!/usr/bin/env node
// 공식 계정 예시 글(ADR-060) — SQL 을 표준 출력으로 낸다. 실행은 psql 이 한다.
//
//   node scripts/seed-official-feed.mjs           글 넣기(고정 id 라 다시 돌려도 겹치지 않는다)
//   node scripts/seed-official-feed.mjs --remove  글·사진 기록·공식 계정 걷기
//
// 운영에 넣을 때는 scripts/seed-official-feed-h2500-3.sh 를 쓴다(사진 복사·확인까지 한다).
// 고친 글·사진 기록은 다시 돌리면 반영되고, 올린 시각과 좋아요·댓글은 그대로 둔다.
// 공식 계정은 비밀번호가 없어 로그인할 수 없고, 통계에서 빠진다.
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "feed-seed");
const AUTHOR = "official-liftgram";
const ID_PREFIX = "seed-official-";
const posts = JSON.parse(readFileSync(join(HERE, "posts.json"), "utf8"));

// 넣기 전에 확인한다 — 고지 없는 공식 글이나 없는 루틴을 가리키는 글이 나가지 않게.
const routines = readFileSync(join(HERE, "../../core/src/domain/creatorRoutines.ts"), "utf8");
for (const p of posts) {
  if (!["virtual_person", "ai_photo"].includes(p.aiNotice))
    throw new Error(`AI 고지 값이 이상함: ${p.image}`);
  if (p.routine && !new RegExp(`["'\`]${p.routine}["'\`]`).test(routines))
    throw new Error(`없는 루틴: ${p.routine}`);
  statSync(join(HERE, "images", p.image));
}

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const asset = (file, type) => {
  const key = `${ID_PREFIX}${file}`;
  const bytes = statSync(join(HERE, "images", file)).size;
  return `INSERT INTO media_assets (id, owner_id, key, url, content_type, kind, bytes)
VALUES (${q(key)}, ${q(AUTHOR)}, ${q(key)}, ${q(`/media/file/${key}`)}, ${q(type)}, 'image', ${bytes})
ON CONFLICT (id) DO UPDATE SET bytes = EXCLUDED.bytes, content_type = EXCLUDED.content_type;`;
};

const out = ["BEGIN;"];
if (process.argv.includes("--remove")) {
  out.push(`DELETE FROM notifications WHERE post_id LIKE ${q(`${ID_PREFIX}%`)};`);
  out.push(`DELETE FROM posts WHERE author_id = ${q(AUTHOR)} AND id LIKE ${q(`${ID_PREFIX}%`)};`);
  out.push(`DELETE FROM media_assets WHERE owner_id = ${q(AUTHOR)};`);
  out.push(`DELETE FROM users WHERE id = ${q(AUTHOR)};`);
} else {
  out.push(`INSERT INTO users (id, display_name, avatar_url, stats_excluded)
VALUES (${q(AUTHOR)}, '리프트그램', ${q(`/media/file/${ID_PREFIX}avatar.png`)}, true)
ON CONFLICT (id) DO NOTHING;`);
  out.push(asset("avatar.png", "image/png"));
  posts.forEach((p, i) => {
    const n = String(i + 1).padStart(2, "0");
    const id = `${ID_PREFIX}${n}`;
    const meta = JSON.stringify({ aiNotice: p.aiNotice, creatorRoutineId: p.routine ?? "" });
    out.push(asset(p.image, "image/jpeg"));
    // 맨 위 글부터 약 50분씩 앞선 시각 — 목록 순서가 파일 순서가 되게 한다.
    out.push(`INSERT INTO posts (id, author_id, kind, caption, visibility, media_urls, official_meta, created_at)
VALUES (${q(id)}, ${q(AUTHOR)}, 'image', ${q(p.caption)}, 'public', ARRAY[${q(`/media/file/${ID_PREFIX}${p.image}`)}], ${q(meta)}::jsonb,
  now() - interval '${i * 50} minutes')
ON CONFLICT (id) DO UPDATE SET caption = EXCLUDED.caption, media_urls = EXCLUDED.media_urls, official_meta = EXCLUDED.official_meta;`);
    out.push(`DELETE FROM post_hashtags WHERE post_id = ${q(id)};`);
    for (const m of p.caption.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
      out.push(
        `INSERT INTO post_hashtags (post_id, tag) VALUES (${q(id)}, ${q(m[1].toLowerCase())}) ON CONFLICT DO NOTHING;`,
      );
    }
  });
}
if (!process.argv.includes("--remove")) {
  // 교체한 옛 사진의 기록을 지운다. 파일은 호출하는 쪽이 지운다.
  const keepKeys = ["avatar.png", ...posts.map((p) => p.image)].map((f) => q(`${ID_PREFIX}${f}`));
  out.push(`DELETE FROM media_assets WHERE owner_id = ${q(AUTHOR)} AND key NOT IN (${keepKeys.join(", ")});`);
}
out.push("COMMIT;");
console.log(out.join("\n"));
