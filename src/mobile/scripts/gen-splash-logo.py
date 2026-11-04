#!/usr/bin/env python3
# SPEC-017 · SRS-054 — 시작 화면 로고 윤곽 생성기 — 웹 LogoSpinner(BrandGlyph outline)와 **같은 기하**를 네이티브 그림으로 굽는다
#
# 웹 그림: viewBox 0 0 32 32 · <g transform="translate(5.2 0) skewX(-14)"> 안에 둥근 막대 4개(rx = 짧은 변의 절반 = 캡슐)
#          · 윤곽 선 굵기 1.4px(non-scaling) · 색 brand-vivid #FF5A36 (src/frontend/app/components/ui/LogoSpinner.tsx)
# 안드로이드 VectorDrawable 은 skewX 를 못 하고, iOS 에셋 SVG 의 transform 지원도 믿기 어렵다 → 기울기·이동·크기를 좌표에 미리 적용한다.
#
# 출력(같은 좌표 · 같은 화면 크기 56dp/pt — 웹 부팅 덮개 LogoSpinner size={56} 과 맞춘다):
#   android/app/src/main/res/drawable/splash_logo.xml   288dp 캔버스 — 아이콘 배경색이 없으면 core-splashscreen·안드로이드 12+ 가
#     아이콘 그림을 288dp 칸에 맞춰 그린다(240dp 로 그리면 1.2배 = 로고 약 67dp 로 커진다 · REV-004 안드로이드 H-1)
#   ios/App/App/Assets.xcassets/SplashLogo.imageset/splash-logo.svg   56pt
#   www/offline.html   첫 실행 오프라인 화면의 같은 윤곽(<svg class="logo"> 한 줄을 바꿔 쓴다)
#   ../frontend/app/components/ui/logoOutlinePath.ts   웹 LogoSpinner 의 빈 윤곽(같은 합친 윤곽)
# 실행: python3 src/mobile/scripts/gen-splash-logo.py  (src/mobile 기준 상대 경로에 쓴다)
#       --check  쓰지 않고 지금 파일들이 생성 결과와 같은지만 확인(다르면 끝 코드 1)
import math
import os
import re
import sys

RECTS = [(3, 3, 5.4, 24), (3, 21.4, 24, 3.6), (18.4, 14.6, 4.4, 17.2), (24, 17.6, 3.4, 11.2)]  # x, y, w, h (rx = min(w,h)/2)
TX, SKEW = 5.2, math.tan(math.radians(-14))
# [원본] STROKE = 1.4 — 웹은 vectorEffect 를 <g> 에 달아(상속 안 되는 속성) 선이 viewBox 비율로 커진다:
#   1.4 × 56/32 = 2.45px 가 실제 웹 모습(chromium·webkit 픽셀 비교 · REV-004 디자인 H1). 네이티브를 웹 실측에 맞춘다.
STROKE = 1.4 * 56.0 / 32.0  # 56dp·pt 화면 단위 선 굵기
SIZE = 56.0  # 화면에 보이는 로고 크기(dp·pt·css px)
SEG = 10  # 반원 하나를 몇 개의 선분으로 — 56dp 에서 눈에 안 보이는 수준


def glyph_point(x, y):
    """웹 <g> 변환을 그대로: translate(5.2 0) · skewX(-14) → viewBox(32) 좌표."""
    return (x + SKEW * y + TX, y)


def capsule(x, y, w, h):
    r = min(w, h) / 2
    pts = []
    if h >= w:  # 세로 캡슐 — 위 반원(왼→오) · 아래 반원(오→왼)
        cx = x + r
        for i in range(SEG + 1):
            a = math.pi + math.pi * i / SEG
            pts.append((cx + r * math.cos(a), y + r + r * math.sin(a)))
        for i in range(SEG + 1):
            a = math.pi * i / SEG
            pts.append((cx + r * math.cos(a), y + h - r + r * math.sin(a)))
    else:  # 가로 캡슐 — 오른 반원(위→아래) · 왼 반원(아래→위)
        cy = y + r
        for i in range(SEG + 1):
            a = -math.pi / 2 + math.pi * i / SEG
            pts.append((x + w - r + r * math.cos(a), cy + r * math.sin(a)))
        for i in range(SEG + 1):
            a = math.pi / 2 + math.pi * i / SEG
            pts.append((x + r + r * math.cos(a), cy + r * math.sin(a)))
    return [glyph_point(px, py) for px, py in pts]


def _inside(p, poly):
    """볼록·비볼록 모두 — 짝홀 규칙."""
    x, y = p
    hit = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
        if (y1 > y) != (y2 > y) and x < x1 + (y - y1) * (x2 - x1) / (y2 - y1):
            hit = not hit
    return hit


def _cuts(a, b, poly):
    """선분 a-b 가 poly 의 변과 만나는 지점의 비율 t(0~1)."""
    (ax, ay), (bx, by) = a, b
    out = []
    for (cx, cy), (dx, dy) in zip(poly, poly[1:] + poly[:1]):
        den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
        if abs(den) < 1e-12:
            continue
        t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den
        u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den
        if 0 < t < 1 and 0 <= u <= 1:
            out.append(t)
    return out


def union_loops():
    """막대 4개를 합친 바깥 윤곽(viewBox 32 좌표) — 안쪽 겹친 선이 보이지 않게 한다.
    각 변을 다른 막대와 만나는 곳에서 자르고, 다른 막대 밖에 있는 조각만 남겨 순서대로 잇는다."""
    polys = [capsule(*r) for r in RECTS]
    segs = []
    for i, poly in enumerate(polys):
        others = [q for j, q in enumerate(polys) if j != i]
        for a, b in zip(poly, poly[1:] + poly[:1]):
            ts = sorted({0.0, 1.0, *(t for q in others for t in _cuts(a, b, q))})
            for t1, t2 in zip(ts, ts[1:]):
                p1 = (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)
                p2 = (a[0] + (b[0] - a[0]) * t2, a[1] + (b[1] - a[1]) * t2)
                if math.dist(p1, p2) < 1e-9:  # 경계에 딱 닿아 생긴 길이 0 조각
                    continue
                mid = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
                if not any(_inside(mid, q) for q in others):
                    segs.append((p1, p2))
    loops = []
    while segs:
        start, cur = segs.pop(0)
        loop = [start]
        while math.dist(cur, start) > 1e-6:
            if not segs:
                sys.exit("로고 윤곽이 닫히지 않는다")
            k = min(range(len(segs)), key=lambda n: math.dist(segs[n][0], cur))
            if math.dist(segs[k][0], cur) > 1e-6:
                sys.exit("로고 윤곽이 닫히지 않는다")
            loop.append(cur)
            cur = segs.pop(k)[1]
        loops.append(loop)
    return loops


def path_d(scale, off):
    # [원본] 막대마다 따로 그린 윤곽 — 겹친 곳의 선이 로고 안쪽에 보였다
    # out = []
    # for rect in RECTS:
    #     pts = [(off + px * scale, off + py * scale) for px, py in capsule(*rect)]
    #     out.append("M" + " L".join(f"{px:.3f},{py:.3f}" for px, py in pts) + " Z")
    # return " ".join(out)
    # [개선] 합친 바깥 윤곽 하나
    out = []
    for loop in union_loops():
        pts = [(off + px * scale, off + py * scale) for px, py in loop]
        out.append("M" + " L".join(f"{px:.3f},{py:.3f}" for px, py in pts) + " Z")
    return " ".join(out)


CHECK = "--check" in sys.argv
DIFF = []


def emit(path, text):
    old = open(path, encoding="utf-8").read() if os.path.exists(path) else None
    if old == text:
        return
    if CHECK:
        DIFF.append(path)
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # src/mobile
    scale = SIZE / 32.0

    # 안드로이드 — 288dp 캔버스 가운데에 56dp(배경 없는 아이콘 규격)
    # [원본] off = (240 - SIZE) / 2
    CANVAS = 288
    off = (CANVAS - SIZE) / 2
    android = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- SPEC-017 · SRS-054 — 시작 화면 로고 윤곽 — 생성물(src/mobile/scripts/gen-splash-logo.py) · 손으로 고치지 않는다.
     웹 LogoSpinner 빈 윤곽과 같은 기하·같은 크기(56dp). SplashScreen API 배경 없는 아이콘 규격 288dp 캔버스(가운데 192dp 원 안). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="{CANVAS}dp" android:height="{CANVAS}dp"
    android:viewportWidth="{CANVAS}" android:viewportHeight="{CANVAS}">
    <path
        android:pathData="{path_d(scale, off)}"
        android:fillColor="#00000000"
        android:strokeColor="@color/splash_logo"
        android:strokeWidth="{STROKE:g}"
        android:strokeLineJoin="round" />
</vector>
"""
    p = os.path.join(here, "android/app/src/main/res/drawable/splash_logo.xml")
    emit(p, android)

    # iOS — 56pt SVG(에셋 카탈로그 벡터 보존)
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="{SIZE:g}" height="{SIZE:g}" viewBox="0 0 {SIZE:g} {SIZE:g}">
<path d="{path_d(scale, 0)}" fill="none" stroke="#FF5A36" stroke-width="{STROKE:g}" stroke-linejoin="round"/>
</svg>
"""
    d = os.path.join(here, "ios/App/App/Assets.xcassets/SplashLogo.imageset")
    emit(os.path.join(d, "splash-logo.svg"), svg)
    emit(
        os.path.join(d, "Contents.json"),
        '{\n  "images" : [ { "filename" : "splash-logo.svg", "idiom" : "universal" } ],\n'
        '  "info" : { "author" : "xcode", "version" : 1 },\n'
        '  "properties" : { "preserves-vector-representation" : true }\n}\n',
    )

    # 오프라인 화면 — 같은 윤곽 한 줄
    o = os.path.join(here, "www/offline.html")
    html = open(o, encoding="utf-8").read()
    line = (
        f'<svg aria-hidden="true" class="logo" xmlns="http://www.w3.org/2000/svg" width="{SIZE:g}" height="{SIZE:g}" '
        f'viewBox="0 0 {SIZE:g} {SIZE:g}"><path d="{path_d(scale, 0)}" fill="none" stroke="#FF5A36" '
        f'stroke-width="{STROKE:g}" stroke-linejoin="round"/></svg>'
    )
    new, n = re.subn(r'<svg aria-hidden="true" class="logo"[^\n]*?</svg>', lambda _m: line, html)
    if n != 1:
        sys.exit("offline.html 에서 <svg class=\"logo\"> 를 하나 찾지 못했다")
    emit(o, new)

    # 웹 LogoSpinner 빈 윤곽 — 같은 윤곽을 viewBox 32 좌표로
    web = (
        "// 생성물(src/mobile/scripts/gen-splash-logo.py) · 손으로 고치지 않는다.\n"
        "// 로고 막대 4개를 합친 바깥 윤곽 — viewBox 0 0 32 32, 기울기까지 좌표에 반영했다.\n"
        f'export const LOGO_OUTLINE_PATH =\n  "{path_d(1.0, 0)}";\n'
    )
    emit(os.path.join(here, "../frontend/app/components/ui/logoOutlinePath.ts"), web)

    if CHECK:
        if DIFF:
            print("생성 결과와 다름:", *DIFF, sep="\n  ")
            sys.exit(1)
        print("ok — 생성 결과와 같다")
    else:
        print("ok", p, d, o)


if __name__ == "__main__":
    main()
