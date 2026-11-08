#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""자극 부위를 칠한 영상을 운영으로 내보낼 묶음으로 만든다(서버). 컨펌된 합격본에 tint.py 로 색만 입힌 판이라 동작은 그대로다.
사용: tint_pack.py <제작 폴더 out> <칠한 폴더 mus> <새 묶음 폴더> <confirmed.json> <새 confirmed.json> <답 메시지 번호> <ffmpeg> <ffprobe>
칠한 판(mus/<키>/<키>.mp4·.png)은 mus/<키>/c 에 원본 층(N·M·W)으로 다시 합성한 영상과 프레임으로 만든다.
- 칠한 판이 있으면: ① 원본 영상·검사 기록이 컨펌과 같고 합격 ② 다시 합성한 영상(mus/<키>/c/<키>.mp4)의 해시가 컨펌과 같다(= 칠한 프레임이 컨펌본의 프레임)
  ③ 칠한 영상의 프레임 수가 원본과 같다 — 셋 다 맞을 때만 새 묶음에 둔다. 색 공간 표시(bt709)는 원본과 같게 다시 붙인다(재인코딩 없음).
- 칠한 판이 아예 없으면(부위 정보 없음) 원본을 그대로 옮긴다. 반쪽만 있으면 멈춘다.
결과 묶음은 publish.py export --out 으로 그대로 내보낸다."""
import hashlib, json, os, re, shutil, subprocess, sys
from PIL import Image
def sha(p):
    with open(p, "rb") as f: return hashlib.sha256(f.read()).hexdigest()
def nframes(fp, p):
    r = subprocess.run([fp, "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", p], capture_output=True, text=True, check=True)
    return int(r.stdout.strip())
def main(out, mus, dst, conf_p, new_p, reply, ff, fp):
    if not re.fullmatch(r"\d+", reply): raise SystemExit("답은 메시지 번호만 적는다")
    conf = json.load(open(conf_p)); new = {}; nt = 0
    for key, c in sorted(conf.items()):
        s, d = f"{out}/{key}", f"{dst}/{key}"; I = json.load(open(f"{s}/info.json"))
        if I.get("fail") or str(I.get("sha8")) != c["sha8"] or sha(f"{s}/{key}.mp4")[:8] != c["sha8"]: raise SystemExit(f"컨펌과 다른 원본: {key}")
        os.makedirs(d, exist_ok=True); tv, tp, rc = f"{mus}/{key}/{key}.mp4", f"{mus}/{key}/{key}.png", f"{mus}/{key}/c/{key}.mp4"
        have = [os.path.exists(x) for x in (tv, tp)]
        if all(have):
            if not os.path.exists(rc) or sha(rc)[:8] != c["sha8"]: raise SystemExit(f"칠한 판이 컨펌본 프레임에서 나오지 않음: {key}")
            if nframes(fp, tv) != nframes(fp, f"{s}/{key}.mp4"): raise SystemExit(f"칠한 판의 프레임 수가 원본과 다름: {key}")
            tmp = f"{d}/{key}.tmp.mp4"   # 색 공간 표시만 원본(comp.py)과 같게 — 화면이 회색·빨강을 다른 색으로 읽지 않게
            subprocess.run([ff, "-y", "-loglevel", "error", "-i", tv, "-c", "copy", "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1", "-movflags", "+faststart", tmp], check=True)
            os.replace(tmp, f"{d}/{key}.mp4")
            Image.open(tp).convert("RGB").resize((192, 192), Image.LANCZOS).save(f"{d}/thumb.webp", quality=78)   # comp.py 와 같은 썸네일 규격
            h = sha(f"{d}/{key}.mp4"); src = {k: I[k] for k in ("sha256", "sha8", "kb") if k in I}
            I = dict(I, sha256=h, sha8=h[:8], kb=os.path.getsize(f"{d}/{key}.mp4")//1024, tint_of=c["sha8"], tint_src=src); nt += 1
            new[key] = dict(c, sha8=h[:8], webp_sha8=sha(f"{d}/thumb.webp")[:8], 판="자극부위", 답=reply)
        elif any(have): raise SystemExit(f"칠한 판이 반쪽만 있음: {key}")
        else:
            shutil.copyfile(f"{s}/{key}.mp4", f"{d}/{key}.mp4"); shutil.copyfile(f"{s}/thumb.webp", f"{d}/thumb.webp"); new[key] = dict(c)
        json.dump(I, open(f"{d}/info.json", "w"), ensure_ascii=False)
    json.dump(new, open(new_p, "w"), ensure_ascii=False, indent=1); print("묶음", len(new), "칠한 판", nt, "원본 그대로", len(new)-nt)
if __name__ == "__main__": main(*sys.argv[1:])
