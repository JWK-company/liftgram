# SPDX-License-Identifier: GPL-3.0-or-later
"""SPEC-036 나머지 327행의 동작 정의. 키 = 카탈로그 nameEn.
J(slug, **ov): 기본 키에 조정값을 더한 새 영상(같은 slug·같은 기본 키면 함께 쓴다). slug 가 None 이면 기본 자세 그대로.
LINK(키): 이미 있는 영상을 함께 쓴다(같은 동작일 때만).
자세 각도: 0 = 앞, 90 = 아래, -90 = 위, 180 = 뒤. a=[위팔,아래팔] l=[허벅지,정강이,발] t=몸통(골반→어깨)."""
import math
M = {}
def J(slug=None, nf=None, loop=None, thumb=None, prompt=None, **ov):
    if ov.get("props"): ov.setdefault("other", [])
    d = dict(slug=slug, ov=ov)
    if nf: d["nf"] = nf
    if loop: d["loop"] = loop; ov["loop"] = loop
    if thumb is not None: d["thumb"] = thumb
    if prompt: d["prompt"] = prompt
    return d
def LINK(k): return dict(link=k)
STAND = dict(t=-90, a=[90, 90], l=[90, 90, 0], at=['an', 120, 181])
def S(**x): return {**STAND, **x}
SQ = [6, 114, 0]; DL = dict(t=-32, a=[90, 90], l=[22, 104, 0], at=['an', 120, 181]); KNEE = dict(t=-42, a=[90, 90], l=[58, 98, 0], at=['an', 120, 181])
RACK = [-10, 168]; OH = [-88, -90]; TOP = dict(t=-12, a=[90, 90], l=[168, 168, 90], at=['wr', 160, 181]); BOT = dict(t=-4, a=[150, 70], l=[176, 176, 90], at=['wr', 160, 181])
def gait(A=26, B=22, knee=46, elbow=24, T=-88, n=12, tilt=0, arms=True, foot=22, bounce=0, base=0, stance=8, a=None):
    """걷기·달리기 순환. 왼다리 φ=0 에서 가장 앞. 첫 키 = 끝 키."""
    out = []
    for i in range(n+1):
        p = 2*math.pi*i/n
        def leg(ph):
            ph %= 2*math.pi; th = 90+base-A*math.cos(ph); sw = max(0, -math.sin(ph))
            return [round(th, 1), round(th+stance*abs(math.sin(ph))+knee*sw**1.5, 1), round(foot*max(0, math.sin(ph-.6)), 1)]
        def arm(ph):
            up = 90+B*math.cos(ph)
            return [round(up, 1), round(up-elbow, 1)]
        k = dict(t=T, l=leg(p), l2=leg(p+math.pi), at=['hip', 120, 107], u=i/n)
        if arms: k["a"] = arm(p); k["a2"] = arm(p+math.pi)
        if a: k["a"] = a; k.pop("a2", None)
        if bounce: k["dz"] = round(bounce*abs(math.sin(p))+.0, 4)
        out.append(k)
    return out
def walk(**x): return dict(keys=gait(**x), no_foot_floor=True)
FLOOR_LOCK = dict(no_foot_floor=False)

# ── 변형 동작 ──
FEET_UP = dict(no_foot_floor=True)
M.update({
 "Dip Machine": J(None, muscles="triceps chest"),
 "Assisted Chin Up": J("chinup", grip="under", muscles="lats biceps"),
 "Larsen Press": J("larsen", start=dict(l=[2, 4, -60]), end=dict(l=[2, 4, -60]), **FEET_UP),
 "Feet-up Bench Press": J("feetup", start=dict(l=[-55, 40, -30]), end=dict(l=[-55, 40, -30]), **FEET_UP),
 "Barbell Pin Press": J("pin", end=dict(a=[60, -92]), props=[dict(k="box", s=(.06, .06, .9), p=(.55, -.02, .45), m="FRAME"), dict(k="box", s=(.06, .06, .9), p=(-.55, -.02, .45), m="FRAME"), dict(k="cyl", r=.012, l=.5, p=(.55, -.02, .84), axis="Y", m="STEEL"), dict(k="cyl", r=.012, l=.5, p=(-.55, -.02, .84), axis="Y", m="STEEL")]),
 "Barbell Board Press": J("board", end=dict(a=[52, -92]), props=[dict(k="box", s=(.14, .28, .16), at="chest", off=(0, 0, .08), m="PAD")]),
 "Gorilla Row": J("gorilla", start=dict(t=-20, a=[90, 90], a2=[160, 80]), end=dict(t=-20, a=[160, 80], a2=[90, 90]), wr_x=.16),
 "Cable Incline Fly": J("incline", lie=-55, no_foot_floor=True, az=[35, 60], el=[9, 20], bench_top=.5, start=dict(ar=[20, 156]), end=dict(ar=[-14, -4]), scene=[], cable=dict(**{"from": [28, 150], "col": 22, "both": True})),
 "Cable Lying Fly": J("lying", lie=-90, no_foot_floor=True, az=[35, 60, 90], el=[20, 9], start=dict(ar=[34, 152]), end=dict(ar=[-4, 6]), scene=[], cable=dict(**{"from": [28, 170], "col": 22, "both": True})),
 "Decline Chest Press Machine": J("decline", start=dict(t=-78, a=[-5, -8]), end=dict(t=-78, a=[100, -30])),
 "Lying Chest Press Machine": J("lying", start=dict(t=180, a=[-90, -90], l=[45, 90, 0], at=['hip', 150, 116]), end=dict(t=180, a=[28, -92], l=[45, 90, 0], at=['hip', 150, 116]), scene=[dict(k="bench", a=[70, 128], b=[176, 128])], machine=[dict(k="stack", x=48, top=60), dict(k="lever", pivot=[84, 44], to="wr")]),
 "Heel Tap": J("heeltap", keys=[dict(t=196, a=[100, 96], a2=[100, 96], l=[-40, 50, 0], sbend=0), dict(sbend=18, wrw=None), dict(sbend=0), dict(sbend=-18), dict(sbend=0)], loop="cycle", muscles="obliques abs_", az=[60, 90], no_hand_floor=True, hold="none"),
 "Side Crunch": J("side", world_rot=[0, 90, 0], start=dict(view="front", ar=[-110, -160], lr=[95, 90], at=['hip', 120, 106]), end=dict(view="front", ar=[-110, -160], lr=[60, 80], tilt=22, at=['hip', 120, 106]), hold="none", muscles="obliques abs_", no_foot_floor=True, ankle_free=True, az=[0, 20], el=[35, 25]),
 "Double Crunch": J("double", start=dict(l=[-40, 50, 0]), end=dict(t=210, l=[-82, 20, 0]), no_foot_floor=True, hip_z=.1),
 "Cable Side Crunch": J("side", start=dict(view="front", ar=[-60, -140], lr=[95, 90], at=['hip', 120, 106]), end=dict(view="front", ar=[-60, -140], lr=[95, 90], tilt=24, at=['hip', 120, 106]), hold="wr", muscles="obliques abs_", cable=dict(**{"from": [216, 20], "col": 222})),
 "Bicep Curl 21s": J("c21", keys=[dict(a=[92, 90]), dict(a=[88, 8]), dict(a=[92, 90]), dict(a=[88, 8]), dict(a=[84, -64]), dict(a=[88, 8]), dict(a=[92, 90])], nf=49, loop="cycle", thumb=.65),
 "Behind the Back Cable Curl": J("behindback", start=dict(a=[116, 106]), end=dict(a=[112, -30])),
 "Zottman Curl": J("zottman", keys=[dict(a=[92, 90]), dict(a=[84, -64]), dict(a=[84, -64]), dict(a=[92, 90])], grip="under", loop="cycle", wr_x=.2),
 "Cross Body Hammer Curl": J("crossbody", grip="neutral", keys=[S(a=[92, 90], wrw=[.2, -.02, .75], wrw2=[-.2, -.02, .75]), dict(wrw=[-.05, -.26, 1.28], wrw2=[-.2, -.02, .75]), dict(wrw=[.2, -.02, .75], wrw2=[-.2, -.02, .75]), dict(wrw=[.2, -.02, .75], wrw2=[.05, -.26, 1.28]), dict(wrw=[.2, -.02, .75], wrw2=[-.2, -.02, .75])], loop="cycle", nf=49, muscles="biceps forearms"),
 "Waiter Curl": J("waiter", grip="under", wr_x=.04, hold="chest", start=dict(a=[90, 86]), end=dict(a=[84, -64])),
 "Dumbbell Curl and Press": J("curlpress", keys=[S(a=[92, 90]), dict(a=[84, -64]), dict(a=[-86, -90]), dict(a=[84, -64]), dict(a=[92, 90])], loop="cycle", nf=49, thumb=.5, muscles="biceps front_delt"),
 "Scapular Pull Up": J("scap", end=dict(t=-90, at=['wr', 124, 6]), start=dict(at=['wr', 124, 6], dz=-.05), muscles="lats traps", az=[140, 150]),
 "Deficit Deadlift": J("deficit", floor_z=.05, start=dict(t=-28, l=[12, 108, 0]), props=[dict(k="box", s=(.7, .5, .05), p=(0, 0, .025), m="DARK")]),
 "Straight Bar Dip": J("bar", dipbars=False, palm_down=1, wr_x=.2, props=[dict(k="cyl", r=.018, l=1.3, p=(0, -.15, 1.2), axis="X", m="STEEL")]),
 "Cable Rear Delt Row": J("rear", start=dict(a=[-4, -4]), end=dict(a=[176, -12]), muscles="rear_delt midback"),
 "Dumbbell Rear Delt Row": J("rear", start=dict(t=-24, a=[90, 90], l=[78, 100, 0]), end=dict(t=-24, a=[178, 90], l=[78, 100, 0]), wr_x=.3, muscles="rear_delt midback", az=[120, 150]),
 "Decline Dumbbell Fly": J("decline", lie=-112, bench_top=.42, az=[35, 60], el=[20, 9]),
 "Dumbbell Floor Fly": J("floor", bench_top=0, lie_z=.12, start=dict(ar=[12, 170]), end=dict(ar=[-4, 6])),
 "Dumbbell Scaption": J("scaption", start=dict(a=[90, 90]), end=dict(a=[-20, -20]), wr_x=.34, muscles="front_delt side_delt"),
 "Hamstring Bridge": J("ham", start=dict(l=[-16, 42, 40]), end=dict(t=166, l=[0, 44, 40]), muscles="hams G", no_hand_floor=True),
 "Sliding Leg Curl": J("slide", keys=[dict(t=170, a=[100, 0], l=[-14, 8, 30], at=['hip', 120, 158]), dict(t=172, l=[-60, 80, 30]), dict(t=170, l=[-14, 8, 30])], loop="cycle", muscles="hams G", no_hand_floor=True, feet_lock=False),
 "Zercher Squat": J("zercher", hold="el", start=dict(a=[90, -20]), end=dict(a=[60, -40]), grip_w=.18),
 "Landmine Squat": J("landmine", hold="none", start=dict(a=[60, -112]), end=dict(a=[56, -112]), wr_x=.08, closed_hands=True, scene=[dict(k="lever", pivot=[24, 186], to="wr", w=5)]),
 "Dumbbell Front Squat": J("front", hold="wr", start=dict(a=[-10, 168]), end=dict(a=[-10, 168]), wr_x=.22),
 "Kettlebell Front Squat": J("front", hold="wr", start=dict(a=[-10, 168]), end=dict(a=[-10, 168]), wr_x=.22),
 "Reverse Hack Squat": J("reverse", start=dict(t=-58, l=[70, 100, 0]), end=dict(t=-40, l=[-14, 110, 0])),
 "Single Leg Hip Thrust": J("single", start=dict(l=[-26, 96, 0], l2=[-70, 20, 0]), end=dict(l=[0, 90, 0], l2=[-10, 0, 0])),
 "Dumbbell Single Leg Hip Thrust": J("single", start=dict(l=[-26, 96, 0], l2=[-70, 20, 0]), end=dict(l=[0, 90, 0], l2=[-10, 0, 0])),
 "Hollow Rock": J("rock", keys=[dict(t=196, a=[196, 196], l=[-14, -14, 0], at=['hip', 120, 176], dz=.02), dict(t=186, l=[-26, -26, 0], dz=.03), dict(t=206, l=[-4, -4, 0], dz=.03), dict(t=196, l=[-14, -14, 0], dz=.02)], loop="cycle", muscles="abs_"),
 "V-Sit Hold": J("hold", start=dict(t=-132, a=[-30, -30], l=[-48, -48, 0]), end=dict(t=-128, a=[-30, -30], l=[-50, -50, 0]), still=True, muscles="abs_"),
 "Landmine Squeeze Press": J("squeeze", wr_x=.04, muscles="chest triceps"),
 "Landmine Squat to Press": J("squatpress", keys=[dict(t=-66, a=[62, -112], l=SQ, l2=SQ, at=['an', 120, 181]), dict(t=-84, a=[70, -90], l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-76, a=[-36, -36], l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-66, a=[62, -112], l=SQ, l2=SQ)], loop="cycle", nf=49, thumb=.5, muscles="quads G front_delt"),
 "Viking Press": J("viking", start=dict(t=-86, a=[70, -90], l=[90, 90, 0], l2=[90, 90, 0]), end=dict(t=-82, a=[-54, -54], l=[90, 90, 0], l2=[90, 90, 0]), grip_w=.26, wr_x=.26, muscles="front_delt side_delt triceps"),
 "Landmine Lateral Raise": J("landmine", hold="none", closed_hands=True),
 "Dumbbell Side Lying Lateral Raise": J("sidelying", world_rot=[0, 90, 0], start=dict(ar=[96, 94], al=[92, 90]), end=dict(ar=[6, 4], al=[92, 90]), no_foot_floor=True, az=[0, 20], el=[35, 25], ankle_free=True, muscles="side_delt"),
 "Windshield Wiper": J("wiper", keys=[dict(t=180, a=[176, 176], l=[-88, -88, 0], at=['hip', 120, 176], ank=[.12, 0, .96], ank2=[-.12, 0, .96]), dict(ank=[.62, 0, .72], ank2=[.38, 0, .78]), dict(ank=[.12, 0, .96], ank2=[-.12, 0, .96]), dict(ank=[-.38, 0, .78], ank2=[-.62, 0, .72]), dict(ank=[.12, 0, .96], ank2=[-.12, 0, .96])], loop="cycle", nf=49, muscles="obliques abs_", hold="none", az=[60, 30], no_foot_floor=True),
 "Decline Bench Leg Raise": J("decline", start=dict(t=198, a=[-140, -150], l=[-14, -14, 0], at=['hip', 150, 120]), end=dict(t=198, a=[-140, -150], l=[-84, -84, 0], at=['hip', 150, 120]), no_foot_floor=True, bench_top=.5, scene=[dict(k="pad", a=[60, 104], b=[168, 132], w=9), dict(k="line", a=[150, 134], b=[150, 188], w=5), dict(k="line", a=[66, 108], b=[66, 188], w=5)]),
 "Jump Lunge": J("jump", keys=[dict(t=-88, a=[110, 60], l=[0, 92, 0], l2=[104, 178, 30], at=['hip', 120, 134]), dict(t=-90, a=[60, 20], l=[70, 100, 0], l2=[110, 110, 10], at=['hip', 120, 96], dz=.14), dict(t=-88, a=[110, 60], l=[104, 178, 30], l2=[0, 92, 0], at=['hip', 120, 134], dz=0), dict(t=-90, a=[60, 20], l=[110, 110, 10], l2=[70, 100, 0], at=['hip', 120, 96], dz=.14), dict(t=-88, a=[110, 60], l=[0, 92, 0], l2=[104, 178, 30], at=['hip', 120, 134], dz=0)], no_foot_floor=True, loop="cycle", nf=49, thumb=.25, feet_lock=False),
 "Barbell Reverse Lunge": J("reverse", start=dict(t=-90, l=[90, 90, 0], l2=[90, 90, 0]), end=dict(), feet_lock="start"),
 "Smith Reverse Lunge": J("reverse", start=dict(t=-90, l=[90, 90, 0], l2=[90, 90, 0]), end=dict(), feet_lock="start"),
 "Barbell Bradford Press": J("bradford", keys=[S(a=[78, -84]), dict(a=[-60, -110]), dict(a=[118, -66]), dict(a=[-60, -110]), dict(a=[78, -84])], loop="cycle", nf=49, thumb=.25),
 "Kettlebell Bottoms Up Press": J("bottomsup", wr_line=False),
 "Press Under": J("pressunder", start=dict(t=-66, a=[-40, -130], l=SQ), end=dict(t=-66, a=[-110, -110], l=SQ), grip_w=.5, wr_line=False),
 "Snatch Balance": J("balance", keys=[S(a=[118, -66], l=[90, 90, 0]), dict(t=-82, l=[62, 108, 0]), dict(t=-90, a=[-96, -96], l=[90, 90, 20], dz=.03), dict(t=-66, a=[-110, -110], l=SQ, dz=0), dict(t=-90, a=[-96, -96], l=[90, 90, 0]), dict(a=[118, -66])], grip_w=.5, loop="cycle", nf=49, thumb=.5, muscles="quads G front_delt", hold="wr"),
 "Hindu Push Up": J("hindu", keys=[dict(t=52, a=[96, 96], l=[124, 124, 180]), dict(t=20, a=[150, 40], l=[150, 150, 120]), dict(t=-30, a=[96, 86], l=[172, 172, 90]), dict(t=20, a=[150, 40], l=[150, 150, 120]), dict(t=52, a=[96, 96], l=[124, 124, 180])], loop="cycle", nf=49, thumb=.5, hold="none", az=[90], el=[9], no_spread=False),
 "Reverse Plank": J("reverse", start=dict(t=186, a=[120, 100], l=[-4, -4, 60], at=['wr', 90, 181]), end=dict(t=186, a=[120, 100], l=[-4, -4, 60], at=['wr', 90, 181]), hold="none", still=True, hand_anchor=True, muscles="G hams erector"),
 "Plank Hip Dip": J("hipdip", keys=[dict(twist=0), dict(twist=28), dict(twist=0), dict(twist=-28), dict(twist=0)], loop="cycle", muscles="obliques abs_"),
 "Plank Pull Through": J("pullthrough", keys=[dict(a=[92, 2], a2=[92, 2], twist=0, bp=[-.25, -.1, .1]), dict(a2=[110, 60], twist=-12, bp=[.2, -.1, .1]), dict(a2=[92, 2], twist=0, bp=[.25, -.1, .1]), dict(a=[110, 60], twist=12, bp=[-.2, -.1, .1]), dict(a=[92, 2], twist=0, bp=[-.25, -.1, .1])], loop="cycle", nf=49, hold="none", props=[dict(k="sph", r=.09, at="bp", m="RUBBER")]),
 "Shoulder Taps": J("tap", keys=[dict(twist=0, wrw2=None), dict(a2=[20, -150], twist=-8), dict(a2=[90, 90], twist=0), dict(a=[20, -150], twist=8), dict(a=[90, 90], twist=0)], loop="cycle", nf=49, hold="none", muscles="abs_ front_delt"),
 "Plank Jack": J("jack", keys=[dict(ax=0, ax2=0), dict(ax=.24, ax2=.24), dict(ax=0, ax2=0)], hold="none", loop="cycle", muscles="abs_ G"),
 "Inchworm": J("inch", keys=[S(t=-90, a=[90, 90]), dict(t=70, a=[90, 90], l=[100, 90, 0], at=['an', 120, 181]), dict(t=20, a=[90, 90], l=[132, 132, 150], at=['an', 120, 181]), dict(TOP), dict(t=20, a=[90, 90], l=[132, 132, 150], at=['an', 120, 181]), dict(t=70, a=[90, 90], l=[100, 90, 0], at=['an', 120, 181]), S(t=-90, a=[90, 90])], loop="cycle", nf=49, thumb=.5, hold="none", muscles="hams abs_", no_spread=False),
 "Plank Push Up": J("push", keys=[dict(t=-8, a=[92, 2], l=[174, 174, 90], at=['wr', 168, 182]), dict(t=-10, a=[92, 2], a2=[90, 90]), dict(t=-12, a=[90, 90], a2=[90, 90]), dict(a=[90, 90], a2=[92, 2]), dict(t=-8, a=[92, 2], a2=[92, 2])], loop="cycle", nf=49, thumb=.5, hold="none", muscles="triceps abs_"),
 "Scapular Push Up": J("scap", keys=[dict(TOP), dict(TOP, dz=-.035), dict(TOP)], hold="none", loop="cycle", muscles="front_delt midback"),
 "Negative Pull Up": LINK("pull_up__bodyweight__back"),
 "Kipping Pull Up": J("kip", keys=[dict(view="side", t=-98, a=[-90, -90], l=[120, 150, 30], at=['wr', 124, 6]), dict(t=-82, a=[-80, -86], l=[60, 110, 20]), dict(t=-92, a=[-30, -110], l=[80, 110, 20]), dict(t=-98, a=[-90, -90], l=[120, 150, 30])], nf=49, loop="cycle", thumb=.65, scene=[dict(k="barF", y=6)], az=[60, 90], muscles="lats abs_", hold="none"),
 "Sternum Pull Up": J("sternum", end=dict(ar=[40, -108], at=['wr', 156, 10])),
 "Archer Pull-up": J("archer", keys=[dict(ar=[-66, -82], al=[-114, -98], at=['wr', 156, 10], tilt=0), dict(ar=[34, -100], al=[176, 186], tilt=-8, at=['wr', 156, 10]), dict(ar=[-66, -82], al=[-114, -98], tilt=0), dict(ar=[-2, -4], al=[146, -80], tilt=8), dict(ar=[-66, -82], al=[-114, -98], tilt=0)], nf=49, loop="cycle", thumb=.25),
 "Commando Pull-up": J("commando", grip="neutral", grip_w=.05),
 "Typewriter Pull-up": J("typewriter", keys=[dict(ar=[34, -100], al=[146, -80], at=['wr', 156, 10], dx=0), dict(dx=.2), dict(dx=-.2), dict(dx=0)], loop="cycle", nf=49, hold="none"),
 "Deficit Push Up": J("deficit", start=dict(TOP), end=dict(t=-3, a=[158, 66], l=[177, 177, 90]), props=[dict(k="box", s=(.2, .3, .06), p=(.3, -.45, .03), m="DARK"), dict(k="box", s=(.2, .3, .06), p=(-.3, -.45, .03), m="DARK")]),
 "Clap Push Up": J("clap", keys=[dict(BOT), dict(TOP), dict(TOP, dz=.14, wrw=[.03, -.5, .4], wrw2=[-.03, -.5, .4]), dict(TOP), dict(BOT)], ground=False, hold="none", nf=49, loop="cycle", thumb=.5),
 "Archer Push Up": J("archer", start=dict(TOP), end=dict(t=-6, a=[150, 70], a2=[20, 20], l=[174, 174, 90]), wr_x=.5, hold="none"),
 "Diamond Push Up": J("diamond", wr_x=.05, hold="none"),
 "Cable Cross Triceps Extension": J("cross", start=dict(view="front", ar=[20, 170], lr=[95, 90], at=['hip', 120, 106]), end=dict(view="front", ar=[20, 20], lr=[95, 90], at=['hip', 120, 106]), cable=dict(**{"from": [28, 28], "col": 22, "both": True})),
 "Dumbbell Side Lying Rear Delt Raise": J("sidelying", world_rot=[0, 90, 0], start=dict(view="front", ar=[120, 110], al=[92, 90]), end=dict(view="front", ar=[6, 4], al=[92, 90]), no_foot_floor=True, az=[150, 180], el=[35, 25], ankle_free=True, muscles="rear_delt"),
 "Landmine Reverse Lunge": J("landmine", hold="none", wr_x=.05, closed_hands=True, scene=[dict(k="lever", pivot=[24, 186], to="wr", w=5)]),
 "Curtsy Lunge": J("curtsy", keys=[S(l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-86, l=[20, 100, 0], l2=[118, 160, 30], ax2=-.34), S(l=[90, 90, 0], l2=[90, 90, 0], ax2=0)], loop="cycle"),
 "Dumbbell Curtsy Lunge": J("curtsy", keys=[S(l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-86, l=[20, 100, 0], l2=[118, 160, 30], ax2=-.34), S(l=[90, 90, 0], l2=[90, 90, 0], ax2=0)], loop="cycle"),
 "Smith Curtsy Lunge": J("curtsy", keys=[S(a=[118, -66], l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-86, l=[20, 100, 0], l2=[118, 160, 30], ax2=-.34), S(a=[118, -66], l=[90, 90, 0], l2=[90, 90, 0], ax2=0)], loop="cycle"),
 "Barbell B-Stance Romanian Deadlift": J("bstance", start=dict(l2=[80, 100, 40]), end=dict(l2=[60, 110, 40])),
 "Dumbbell B-Stance Romanian Deadlift": J("bstance", start=dict(l2=[80, 100, 40]), end=dict(l2=[60, 110, 40])),
 "Barbell Sumo Romanian Deadlift": J("sumo", stance=.34, start=dict(), end=dict()),
 "Landmine Romanian Deadlift": J("landmine", hold="none", closed_hands=True, wr_x=.06, scene=[dict(k="lever", pivot=[24, 186], to="wr", w=5)]),
 "Landmine Single Leg Romanian Deadlift": J("landmine1", hold="none", closed_hands=True, wr_x=.06, start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), scene=[dict(k="lever", pivot=[24, 186], to="wr", w=5)]),
 "Single Leg Deadlift": J("single", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), hold="none", az=[120, 150], muscles="hams G"),
 "Dumbbell Single Leg Deadlift": J("single", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), az=[120, 150], muscles="hams G"),
 "Kettlebell Single Leg Deadlift": J("single", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), az=[120, 150], muscles="hams G"),
 "Barbell Incline Bench Row": J("incline", start=dict(t=-20), end=dict(t=-20), bench_top=.74),
 "Barbell Z Press": J("z", start=dict(t=-90, l=[0, 4, -30], at=['hip', 100, 170]), end=dict(t=-90, l=[0, 4, -30], at=['hip', 100, 170]), scene=[], no_foot_floor=True, hip_z=.11),
 "Dumbbell Z Press": J("z", start=dict(t=-90, l=[0, 4, -30], at=['hip', 100, 170]), end=dict(t=-90, l=[0, 4, -30], at=['hip', 100, 170]), scene=[], no_foot_floor=True, hip_z=.11),
 "Arnold Press": J("arnold", keys=[dict(a=[80, -100], grip=None), dict(a=[60, -92]), dict(a=[-86, -90]), dict(a=[60, -92]), dict(a=[80, -100])], grip="under", wr_x=.17, loop="cycle", nf=49, thumb=.5),
 "Cable Standing Row": J("standing", start=dict(t=-88, a=[4, 4], l=[80, 100, 0], l2=[100, 96, 0], at=['an', 100, 181]), end=dict(t=-92, a=[118, -6], l=[80, 100, 0], l2=[100, 96, 0], at=['an', 100, 181]), scene=[], machine=[], cable=dict(**{"from": [204, 90], "col": 212})),
 "Jump Shrug": J("jump", keys=[dict(t=-56, a=[90, 90], l=[58, 98, 0], at=['an', 120, 181]), dict(t=-90, a=[90, 90], l=[90, 90, 30], dz=.11), dict(t=-56, a=[90, 90], l=[58, 98, 0], dz=0)], no_foot_floor=True, loop="cycle", thumb=.5, muscles="traps G"),
 "Dumbbell Incline Shrug": J("incline", start=dict(view="front", ar=[92, 92], lr=[95, 90], at=['hip', 120, 118], shrug=0), end=dict(view="front", ar=[92, 92], lr=[95, 90], at=['hip', 120, 118], shrug=9), lie=50, bench_top=.5, no_foot_floor=True, az=[150, 120], el=[20, 9], muscles="traps"),
 "45 Degree Side Bend": J("roman", world_rot=[0, 45, 0], start=dict(tilt=-6), end=dict(tilt=24), no_foot_floor=True, ankle_free=True, muscles="obliques", az=[0, 20]),
 "JM Press": J("jm", end=dict(a=[-40, 150])),
 "Smith JM Press": J("jm", end=dict(a=[-40, 150])),
 "Barbell Incline Skull Crusher": J("incline", start=dict(t=208, l=[25, 92, 0], a=[-104, -104], at=['hip', 150, 128]), end=dict(t=208, l=[25, 92, 0], a=[-104, 168], at=['hip', 150, 128]), scene=[dict(k="pad", a=[146, 141], b=[94, 113], w=9), dict(k="bench", a=[134, 140], b=[176, 140])]),
 "Dumbbell Incline Triceps Extension": J("incline", start=dict(t=208, l=[25, 92, 0], a=[-104, -104], at=['hip', 150, 128]), end=dict(t=208, l=[25, 92, 0], a=[-104, 168], at=['hip', 150, 128]), scene=[dict(k="pad", a=[146, 141], b=[94, 113], w=9), dict(k="bench", a=[134, 140], b=[176, 140])]),
 "EZ-Bar Incline Skull Crusher": J("incline", start=dict(t=208, l=[25, 92, 0], a=[-104, -104], at=['hip', 150, 128]), end=dict(t=208, l=[25, 92, 0], a=[-104, 168], at=['hip', 150, 128]), scene=[dict(k="pad", a=[146, 141], b=[94, 113], w=9), dict(k="bench", a=[134, 140], b=[176, 140])]),
 "EZ-Bar Decline Skull Crusher": J("decline", start=dict(t=162, a=[-112, -112], l=[-14, 30, -30], at=['hip', 150, 106]), end=dict(t=162, a=[-112, 158], l=[-14, 30, -30], at=['hip', 150, 106]), no_foot_floor=True, bench_top=.5, scene=[dict(k="pad", a=[56, 134], b=[168, 96], w=9), dict(k="line", a=[150, 104], b=[150, 188], w=5), dict(k="line", a=[66, 132], b=[66, 188], w=5)]),
 "Barbell Anderson Squat": J("anderson", start=dict(t=-56, l=SQ), end=dict(t=-90, l=[90, 90, 0]), props=[dict(k="box", s=(.06, .06, .78), p=(.6, -.02, .39), m="FRAME"), dict(k="box", s=(.06, .06, .78), p=(-.6, -.02, .39), m="FRAME")]),
 "Dumbbell Incline Squeeze Press": J("incline", start=dict(t=208, l=[25, 92, 0], a=[-82, -82], at=['hip', 150, 128]), end=dict(t=208, l=[25, 92, 0], a=[40, -80], at=['hip', 150, 128]), scene=[dict(k="pad", a=[146, 141], b=[94, 113], w=9), dict(k="bench", a=[134, 140], b=[176, 140])], az=[50, 70]),
 "Kneeling Leg Curl": J("kneeling", start=dict(t=-20, a=[90, 90], l=[150, 150, 180], l2=[120, 180, 180], at=['kn', 110, 150]), end=dict(t=-20, a=[90, 90], l=[150, 40, 180], l2=[120, 180, 180], at=['kn', 110, 150]), no_foot_floor=True, machine=[dict(k="pad", a="an", b="an", w=12), dict(k="pad", a=[64, 158], b=[130, 158], w=9), dict(k="line", a=[100, 162], b=[100, 188], w=5)], hold="none"),
 "Lateral Step Up": J("lateral", keys=[dict(view="front", ar=[92, 92], lr=[30, 104], ll=[92, 90], at=['hip', 120, 118]), dict(lr=[86, 92], ll=[120, 120], at=['hip', 120, 72]), dict(lr=[30, 104], ll=[92, 90], at=['hip', 120, 118])], loop="cycle", ankle_free=True, feet_lock=False, hold="none", props=[dict(k="box", s=(.5, .45, .28), p=(.42, 0, .14), m="PAD")], az=[0, 20]),
 "Poliquin Step Up": J("poliquin", start=dict(l=[10, 110, 40], l2=[90, 90, 0]), end=dict(l=[90, 90, 30], l2=[90, 90, 0])),
 "Meadows Row": J("meadows", start=dict(t=-24, a=[92, 92], a2=[30, 60], l=[60, 104, 0], l2=[110, 100, 0]), end=dict(t=-24, a=[172, 82], a2=[30, 60], l=[60, 104, 0], l2=[110, 100, 0]), wr_x=.05),
 "Hanging Knees to Elbows": J("knees", start=dict(l=[92, 92, 30], at=['wr', 124, 6]), end=dict(t=-110, a=[-96, -96], l=[-90, 130, 0], at=['wr', 124, 6]), scene=[dict(k="barF", y=6)], az=[35, 60]),
 "Dumbbell Cuban Press": J("cuban", keys=[S(a=[92, 90], wr_x=.3), dict(a=[160, 80]), dict(a=[160, -60]), dict(a=[-86, -90]), dict(a=[160, -60]), dict(a=[160, 80]), dict(a=[92, 90])], wr_x=.3, loop="cycle", nf=49, thumb=.5, muscles="rear_delt side_delt"),
 "V Sit Up": J("up", start=dict(t=180, a=[180, 180], l=[0, 0, 0]), end=dict(t=-126, a=[-44, -44], l=[-50, -50, 0]), muscles="abs_"),
 "Seated Knee Tuck": J("tuck", start=dict(t=-136, a=[140, 120], l=[-14, 8, 0], at=['hip', 120, 176]), end=dict(t=-118, a=[126, 110], l=[-72, 80, 0], at=['hip', 120, 176]), muscles="abs_", hold="none"),
})

# ── 다단계·탄도 ──
def clean(start=DL, rack=RACK, catch=[62, 108, 0], ct=-80, wr=None, overhead=False):
    k = [dict(start), dict(KNEE) if start is DL else dict(start), dict(t=-92, a=[92, 90], l=[90, 90, 25], at=['an', 120, 181], dz=.03), dict(t=ct, a=rack, l=catch, at=['an', 120, 181], dz=0), dict(t=-90, a=rack, l=[90, 90, 0]), dict(t=-92, a=[92, 90], l=[90, 90, 0]), dict(start)]
    return k
PWR = dict(nf=49, loop="cycle", thumb=.55, no_foot_floor=True, muscles="G hams quads traps")
SN = dict(grip_w=.52, **PWR)
LOW = dict(l=SQ, t=-66)
def snatch(start=DL, deep=True, up=[-100, -100]):
    return [dict(start), dict(KNEE) if start is DL else dict(start), dict(t=-92, a=[90, 90], l=[90, 90, 25], at=['an', 120, 181], dz=.03), dict(t=-66 if deep else -80, a=[-110, -110] if deep else up, l=SQ if deep else [62, 108, 0], at=['an', 120, 181], dz=0), dict(t=-90, a=[-94, -94], l=[90, 90, 0]), dict(t=-92, a=[92, 90]), dict(start)]
HANG = dict(t=-50, a=[90, 90], l=[70, 96, 0], at=['an', 120, 181])
BLOCK = [dict(k="box", s=(.26, .5, .26), p=(.72, 0, .13), m="DARK"), dict(k="box", s=(.26, .5, .26), p=(-.72, 0, .13), m="DARK")]
def jerk(split=False):
    return [dict(t=-90, a=RACK, l=[90, 90, 0], l2=[90, 90, 0], at=['an', 120, 181]), dict(t=-90, l=[62, 108, 0], l2=[62, 108, 0]), dict(t=-90, a=[-30, 170], l=[90, 90, 20], l2=[90, 90, 20], dz=.03), dict(t=-90, a=[-90, -90], l=[60, 104, 0] if split else [62, 108, 0], l2=[118, 160, 30] if split else [62, 108, 0], dz=0), dict(a=[-90, -90], l=[90, 90, 0], l2=[90, 90, 0]), dict(a=RACK)]
def burpee(jump=True, end=None):
    k = [S(a=[90, 90]), dict(t=-30, a=[90, 90], l=[20, 110, 0], at=['an', 120, 181]), dict(TOP), dict(BOT), dict(TOP), dict(t=-30, a=[90, 90], l=[20, 110, 0], at=['an', 120, 181])]
    if jump: k += [S(a=[-85, -85], l=[90, 90, 25], dz=.13)]
    k += [S(a=[90, 90], dz=0)]
    return k
BUR = dict(nf=49, loop="cycle", thumb=.35, hold="none", muscles="chest quads G abs_", no_spread=False)
def tkd(**x): return dict(keys=gait(**x), no_foot_floor=True, hold="none")
def jump_keys(low=None, airz=.22, arm_low=[120, 120], arm_up=[-80, -80], air=[90, 90, 30], t=-56):
    low = low or SQ
    return [dict(t=t, a=arm_low, l=low, at=['an', 120, 181]), dict(t=-90, a=arm_up, l=[90, 90, 25], dz=airz*.45), dict(t=-90, a=arm_up, l=air, dz=airz), dict(t=-80, a=[60, 40], l=[70, 96, 10], dz=.02), dict(t=t, a=arm_low, l=low, dz=0)]
JK = dict(no_foot_floor=True, loop="cycle", thumb=.5, hold="none")
M.update({
 "Dumbbell Around the World": J("arc", start=dict(a=[-150, -150]), end=dict(a=[-20, -20]), wr_x=.42, muscles="chest"),
 "Medicine Ball Slam": J("slam", keys=[S(a=[-96, -96]), dict(t=-92, a=[-110, -110], l=[90, 90, 20]), dict(t=-30, a=[100, 100], l=[60, 110, 0], bp=[0, -.5, .1]), dict(t=-46, a=[90, 90], l=[40, 106, 0]), S(a=[-96, -96])], loop="cycle", nf=49, hold="none", closed_hands=True, grip_w=.14, props=[dict(k="sph", r=.13, at="gm", m="RUBBER")], muscles="lats abs_ G", thumb=.5),
 "Lateral Band Walk": J("walk", keys=[dict(view="front", ar=[90, 90], lr=[78, 96], ll=[100, 92], at=['hip', 120, 112], dx=0), dict(lr=[62, 100], ll=[112, 92], dx=.1), dict(lr=[78, 96], ll=[100, 92], dx=0)], ankle_free=True, loop="cycle", hold="none", props=[dict(k="link", a="kn", b="kn2", r=.012, m="band2")], muscles="G", az=[0, 20]),
 "Battle Rope": J("wave", keys=[dict(t=-70, a=[50, 0], a2=[60, 40], l=[40, 110, 0], at=['an', 96, 181]), dict(a=[60, 40], a2=[50, 0]), dict(a=[50, 0], a2=[60, 40])], loop="cycle", hold="none", wr_x=.2, closed_hands=True, props=[dict(k="wave", a="gl", b=[.15, -2.4, .1], amp=.14, ph=0, r=.018, m="ACC"), dict(k="wave", a="gr", b=[-.15, -2.4, .1], amp=.14, ph=3.14, r=.018, m="ACC"), dict(k="box", s=(.2, .2, .3), p=(0, -2.45, .15), m="FRAME")], muscles="front_delt side_delt abs_"),
 "Bear Plank": J("plank", start=dict(t=0, a=[90, 90], l=[60, 150, 0], l2=[60, 150, 0]), end=dict(t=0, a=[90, 90], l=[60, 150, 0], l2=[60, 150, 0]), still=True, hold="none", muscles="abs_ front_delt"),
 "Bear Crawl": J("crawl", keys=[dict(t=0, a=[100, 96], a2=[78, 84], l=[50, 150, 0], l2=[90, 120, 0], at=['wr', 168, 181]), dict(a=[78, 84], a2=[100, 96], l=[90, 120, 0], l2=[50, 150, 0], at=['wr2', 168, 181]), dict(a=[100, 96], a2=[78, 84], l=[50, 150, 0], l2=[90, 120, 0], at=['wr', 168, 181])], loop="cycle", muscles="abs_ quads front_delt", hold="none"),
 "Bicycle Crunch": J("cycle", keys=[dict(twist=24, flex=20), dict(l=[-10, -10, 0], l2=[-80, 10, 0], twist=-24), dict(l=[-80, 10, 0], l2=[-10, -10, 0], twist=24)], loop="cycle", muscles="abs_ obliques", hold="none", az=[60, 30]),
 "Elbow to Knee": J("cycle", keys=[dict(twist=24, flex=20), dict(l=[-10, -10, 0], l2=[-80, 10, 0], twist=-24), dict(l=[-80, 10, 0], l2=[-10, -10, 0], twist=24)], loop="cycle", muscles="abs_ obliques", hold="none", az=[60, 30]),
 "Box Jump": J("jump", keys=[dict(t=-56, a=[150, 150], l=SQ, at=['an', 80, 181]), dict(t=-82, a=[-70, -70], l=[80, 96, 25], at=['an', 118, 150]), dict(t=-70, a=[10, 10], l=[30, 104, 0], at=['an', 158, 134]), S(a=[90, 90], at=['an', 158, 134]), dict(t=-60, a=[90, 90], l=[40, 100, 0], at=['an', 118, 150]), dict(t=-56, a=[150, 150], l=SQ, at=['an', 80, 181])], no_foot_floor=True, hold="none", nf=49, loop="cycle", thumb=.4, muscles="quads G calves"),
 "Lateral Box Jump": J("lateral", keys=[dict(view="front", ar=[120, 120], lr=[30, 104], at=['hip', 90, 136]), dict(ar=[-70, -70], lr=[88, 92], at=['hip', 120, 66]), dict(ar=[60, 60], lr=[40, 104], at=['hip', 150, 96]), dict(ar=[92, 92], lr=[92, 90], at=['hip', 150, 80]), dict(ar=[-70, -70], lr=[88, 92], at=['hip', 120, 66]), dict(ar=[120, 120], lr=[30, 104], at=['hip', 90, 136])], ankle_free=True, no_foot_floor=True, hold="none", nf=49, loop="cycle", muscles="quads G", az=[0, 20]),
 "Burpee Broad Jump": J("broad", keys=burpee(False)+[dict(t=-40, a=[150, 150], l=SQ, at=['an', 120, 181]), dict(t=-70, a=[-40, -40], l=[60, 110, 10], at=['an', 100, 150]), S(a=[90, 90])], **BUR),
 "Frog Jump": J("frog", keys=[dict(t=-40, a=[100, 100], l=SQ, at=['an', 120, 181]), dict(t=-80, a=[-50, -50], l=[80, 100, 20], dz=.2), dict(t=-40, a=[100, 100], l=SQ, dz=0)], stance=.3, **JK, muscles="quads G"),
 "Broad Jump": J("broad", keys=[dict(t=-40, a=[150, 150], l=SQ, at=['an', 80, 181]), dict(t=-72, a=[-30, -30], l=[80, 100, 20], at=['an', 112, 150]), dict(t=-60, a=[-20, -20], l=[20, 110, 10], at=['an', 160, 170]), dict(t=-46, a=[100, 100], l=SQ, at=['an', 170, 181]), S(a=[90, 90], at=['an', 170, 181]), S(a=[90, 90], at=['an', 80, 181]), dict(t=-40, a=[150, 150], l=SQ, at=['an', 80, 181])], no_foot_floor=True, hold="none", nf=49, loop="cycle", thumb=.35, muscles="quads G calves"),
 "HIIT": J("hiit", keys=burpee(), prompt="HIIT burpee", **BUR),
 "Burpee": J("full", keys=burpee(), **BUR),
 "Burpee Over the Bar": J("bar", keys=burpee()+[], props=[dict(k="cyl", r=.014, l=1.5, p=(0, -.1, .22), axis="X", m="STEEL")], **BUR),
 "Burpee Box Jump": J("box", keys=burpee(False)+[dict(t=-56, a=[150, 150], l=SQ, at=['an', 120, 181]), dict(t=-70, a=[10, 10], l=[30, 104, 0], at=['an', 158, 134]), S(a=[90, 90], at=['an', 120, 181])], props=[dict(k="box", s=(.6, .6, .52), p=(0, -.5, .26), m="PAD")], **BUR),
 "Devil Press": J("devil", keys=[S(a=[-85, -85]), dict(t=-46, a=[90, 90], l=[40, 106, 0]), dict(TOP), dict(BOT), dict(t=-30, a=[90, 90], l=[20, 110, 0], at=['an', 120, 181]), S(a=[-85, -85])], nf=49, loop="cycle", thumb=.5, muscles="chest G front_delt", no_spread=False),
 "Plate Bus Driver": J("turn", keys=[dict(a=[0, 0], twist=0, wrw=[.24, -.46, 1.2], wrw2=[-.24, -.46, 1.2]), dict(wrw=[.34, -.46, 1.02], wrw2=[-.1, -.46, 1.38]), dict(wrw=[.24, -.46, 1.2], wrw2=[-.24, -.46, 1.2]), dict(wrw=[.1, -.46, 1.38], wrw2=[-.34, -.46, 1.02]), dict(wrw=[.24, -.46, 1.2], wrw2=[-.24, -.46, 1.2])], loop="cycle", closed_hands=True, plate_axis="Y", muscles="front_delt side_delt", az=[30, 50]),
 "Butt Kick": J("kick", **tkd(A=12, B=26, knee=118, elbow=70, foot=10, bounce=.03, stance=2), loop="cycle", muscles="hams"),
 "Power Clean": J("power", keys=clean(), **PWR),
 "Hang Clean": J("hang", keys=clean(HANG), **PWR),
 "Barbell Muscle Clean": J("muscle", keys=clean(catch=[90, 90, 0], ct=-90), **PWR),
 "Barbell Block Clean": J("block", keys=clean(dict(KNEE)), props=BLOCK, **PWR),
 "Dumbbell Clean": J("full", keys=clean(), **PWR),
 "Kettlebell Clean": J("full", keys=clean(HANG), **PWR),
 "Clean and Jerk": J("full", keys=clean()[:-2]+jerk(True)[1:-1]+[dict(a=RACK, l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-92, a=[92, 90]), dict(DL, l2=DL["l"])], thumb=.6, nf=49, loop="cycle", no_foot_floor=True, muscles="G hams quads front_delt"),
 "Clean and Press": J("press", keys=clean()[:-2]+[dict(a=OH), dict(a=RACK), dict(t=-92, a=[92, 90]), dict(DL)], thumb=.6, **{k: v for k, v in PWR.items() if k != "thumb"}),
 "Split Jerk": J("split", keys=jerk(True)+[dict(a=RACK, l=[90, 90, 0], l2=[90, 90, 0])], nf=49, loop="cycle", thumb=.5, no_foot_floor=True, muscles="front_delt quads G triceps"),
 "Power Jerk": J("power", keys=jerk(False)+[dict(a=RACK, l=[90, 90, 0], l2=[90, 90, 0])], nf=49, loop="cycle", thumb=.5, no_foot_floor=True, muscles="front_delt quads G triceps"),
 "Dumbbell Clean and Press": J("press", keys=clean()[:-2]+[dict(a=OH), dict(a=RACK), dict(t=-92, a=[92, 90]), dict(DL)], thumb=.6, **{k: v for k, v in PWR.items() if k != "thumb"}),
 "Kettlebell Clean and Press": J("press", keys=clean(HANG)[:-2]+[dict(a=OH), dict(a=RACK), dict(t=-92, a=[92, 90]), dict(HANG)], thumb=.6, **{k: v for k, v in PWR.items() if k != "thumb"}),
 "Barbell Cluster": J(None, keys=clean()[:-2]+[dict(t=-66, a=RACK, l=SQ), dict(t=-90, a=OH, l=[90, 90, 0]), dict(a=RACK), dict(t=-92, a=[92, 90]), dict(DL)], thumb=.65, **{k: v for k, v in PWR.items() if k != "thumb"}),
 "Crab Walk": J("walk", loop="cycle", muscles="triceps G", hold="none", keys=[dict(t=205, a=[100, 100], a2=[116, 110], l=[0, 84, 0], l2=[10, 96, 0], at=['an', 162, 181]), dict(a=[116, 110], a2=[100, 100], l=[10, 96, 0], l2=[0, 84, 0], at=['an2', 162, 181]), dict(a=[100, 100], a2=[116, 110], l=[0, 84, 0], l2=[10, 96, 0], at=['an', 162, 181])]),
 "Farmer's Walk": J("walk", **walk(B=3, elbow=0, A=20), loop="cycle", muscles="forearms traps"),
 "Suitcase Carry": J("suitcase", **walk(B=3, elbow=0, A=20), loop="cycle", muscles="obliques forearms", one_hand=True),
 "Kettlebell Farmer's Walk": J("walk", **walk(B=3, elbow=0, A=20), loop="cycle", muscles="forearms traps"),
 "Trap Bar Farmer's Walk": J("walk", **walk(arms=False, a=[90, 90], A=20), loop="cycle", muscles="forearms traps"),
 "Kettlebell Figure 8": J("eight", keys=[dict(t=-20, l=[74, 100, 0], wrw=[.16, -.28, .4], wrw2=[-.24, .1, .5]), dict(wrw=[.0, -.05, .36], wrw2=[-.14, -.26, .5]), dict(wrw=[.24, .08, .5], wrw2=[-.14, -.26, .5]), dict(wrw=[.14, -.26, .5], wrw2=[-.16, -.28, .4]), dict(wrw=[.14, -.26, .5], wrw2=[.0, -.05, .36]), dict(wrw=[.16, -.28, .4], wrw2=[-.24, .1, .5])], nf=49, loop="cycle", muscles="obliques G", one_hand=True),
 "Flutter Kick": J("kick", keys=[dict(l=[-14, -14, 0], l2=[-30, -30, 0]), dict(l=[-30, -30, 0], l2=[-14, -14, 0]), dict(l=[-14, -14, 0], l2=[-30, -30, 0])], loop="cycle", muscles="abs_"),
 "Scissor Kick": J("scissor", keys=[dict(l=[-14, -14, 0], l2=[-14, -14, 0], ax=.18, ax2=-.1), dict(ax=-.1, ax2=.18), dict(ax=.18, ax2=-.1)], loop="cycle", muscles="abs_", no_foot_floor=True),
 "Kettlebell Around the World": J("around", keys=[S(wrw=[.0, -.3, .9], wrw2=[.0, -.3, .9]), dict(wrw=[.34, .0, .92], wrw2=[.34, .0, .92]), dict(wrw=[.0, .28, .92], wrw2=[.0, .28, .92]), dict(wrw=[-.34, .0, .92], wrw2=[-.34, .0, .92]), dict(wrw=[.0, -.3, .9], wrw2=[.0, -.3, .9])], loop="cycle", hold="none", nf=49, muscles="obliques abs_", closed_hands=True, props=[dict(k="sph", r=.08, at="gm", m="RUBBER")]),
 "Kettlebell Halo": J(None, keys=[S(wrw=[.0, -.2, 1.65], wrw2=[.0, -.2, 1.65]), dict(wrw=[.22, .05, 1.65], wrw2=[.22, .05, 1.65]), dict(wrw=[.0, .2, 1.7], wrw2=[.0, .2, 1.7]), dict(wrw=[-.22, .05, 1.65], wrw2=[-.22, .05, 1.65]), dict(wrw=[.0, -.2, 1.65], wrw2=[.0, -.2, 1.65])], loop="cycle", hold="none", closed_hands=True, props=[dict(k="sph", r=.08, at="gm", m="RUBBER")], muscles="front_delt side_delt"),
 "Hand Gripper": J(None, start=dict(a=[70, 0]), end=dict(a=[70, 0]), closed_hands=True, still=True, props=[dict(k="box", s=(.03, .03, .1), at="gl", m="DARK")], wr_x=.25, one_hand=True, muscles="forearms", hold="none", az=[35, 60]),
 "High Knees": J(None, **tkd(A=44, base=-30, B=30, knee=4, elbow=70, bounce=.03, stance=2, T=-86), loop="cycle", muscles="quads abs_"),
 "Snatch Pull": J("snatch", grip_w=.52, start=dict(DL), end=dict(t=-92, a=[92, 90], l=[90, 90, 25])),
 "Deadlift High Pull": J("dl", start=dict(DL), end=dict(t=-90, a=[186, -30], l=[90, 90, 25])),
 "Clean Pull": J("clean", start=dict(DL), end=dict(t=-90, a=[92, 90], l=[90, 90, 25])),
 "Kettlebell High Pull": J("kb", start=dict(HANG), end=dict(t=-90, a=[186, -30], l=[90, 90, 25]), muscles="side_delt traps G"),
 "Barbell Jump Squat": J("bar", keys=jump_keys(arm_low=[118, -66], arm_up=[118, -66], airz=.14), hold="sh", **{k: v for k, v in JK.items() if k != "hold"}, muscles="quads G calves"),
 "Pogo Jump": J("pogo", keys=[S(a=[90, 80], l=[90, 90, 25]), dict(a=[90, 80], l=[90, 90, 30], dz=.12), S(a=[90, 80], l=[90, 90, 25], dz=0)], **JK, muscles="calves"),
 "Jump Squat": J("full", keys=jump_keys(), **JK, muscles="quads G calves"),
 "Tuck Jump": J("tuck", keys=jump_keys(air=[-10, 120, 10], airz=.26), **JK, muscles="quads abs_ G"),
 "Jumping Jack": J(None, keys=[dict(view="front", ar=[92, 92], lr=[94, 90], at=['hip', 120, 106]), dict(ar=[-60, -70], lr=[66, 72], dz=.04), dict(ar=[92, 92], lr=[94, 90], dz=0)], ankle_free=True, no_foot_floor=True, loop="cycle", hold="none", thumb=.5, muscles="side_delt quads", az=[0, 20]),
 "Dumbbell Swing": J(None, keys=[dict(t=-20, a=[110, 110], l=[74, 100, 0], at=['an', 120, 181]), dict(t=-60, a=[60, 60], l=[86, 94, 0]), dict(t=-90, a=[-4, -4], l=[90, 90, 0]), dict(t=-60, a=[60, 60], l=[86, 94, 0]), dict(t=-20, a=[110, 110], l=[74, 100, 0])], loop="cycle", wr_x=.06, muscles="G hams", thumb=.5),
 "Kettlebell Swing": J(None, keys=[dict(t=-20, a=[110, 110], l=[74, 100, 0], at=['an', 120, 181]), dict(t=-60, a=[60, 60], l=[86, 94, 0]), dict(t=-90, a=[-4, -4], l=[90, 90, 0]), dict(t=-60, a=[60, 60], l=[86, 94, 0]), dict(t=-20, a=[110, 110], l=[74, 100, 0])], loop="cycle", wr_x=.06, muscles="G hams", thumb=.5),
 "Dumbbell Man Maker": J(None, keys=[dict(TOP), dict(BOT), dict(TOP), dict(TOP, a=[170, 80]), dict(TOP), dict(t=-30, a=[90, 90], l=[20, 110, 0], at=['an', 120, 181]), S(a=RACK), S(a=OH), S(a=[90, 90]), dict(t=-30, a=[90, 90], l=[20, 110, 0], at=['an', 120, 181]), dict(TOP)], nf=49, loop="cycle", thumb=.65, muscles="chest lats front_delt quads", no_spread=False),
 "Mountain Climber": J(None, keys=[dict(TOP, l=[168, 168, 90], l2=[40, 150, 90]), dict(l=[40, 150, 90], l2=[168, 168, 90]), dict(l=[168, 168, 90], l2=[40, 150, 90])], loop="cycle", hold="none", no_foot_floor=True, feet_lock=False, muscles="abs_ quads", az=[60, 90]),
 "Spiderman Plank": J("spider", keys=[dict(TOP, l=[168, 168, 90], l2=[168, 168, 90], ax=0), dict(l=[60, 170, 120], ax=.28), dict(l=[168, 168, 90], ax=0), dict(l2=[60, 170, 120], ax2=.28), dict(l2=[168, 168, 90], ax2=0)], loop="cycle", hold="none", nf=49, no_foot_floor=True, muscles="abs_ obliques"),
 "Barbell Muscle Snatch": J(None, keys=snatch(DL, deep=False, up=[-96, -96]), **SN),
 "Muscle Up": J(None, keys=[dict(t=-90, a=[-90, -90], l=[94, 110, 60], at=['wr', 124, 6]), dict(t=-84, a=[20, -88], l=[80, 110, 60]), dict(t=-70, a=[160, -10], l=[70, 120, 40]), dict(t=-78, a=[130, 60], l=[92, 110, 40]), dict(t=-86, a=[94, 92], l=[92, 110, 40]), dict(t=-70, a=[160, -10], l=[70, 120, 40]), dict(t=-84, a=[20, -88], l=[80, 110, 60]), dict(t=-90, a=[-90, -90], l=[94, 110, 60])], nf=49, loop="cycle", thumb=.57, scene=[dict(k="barF", y=6)], hold="none", no_foot_floor=True, closed_hands=True, az=[60, 90], muscles="lats chest triceps"),
 "Dumbbell Overhead Carry": J(None, **walk(arms=False, a=[-90, -90], A=20), loop="cycle", muscles="side_delt front_delt abs_"),
 "Plate Pinch": J(None, closed_hands=True, still=True, muscles="forearms", wr_x=.26, plate_axis="X", hold="none"),
 "Push Press": J(None, keys=[dict(t=-90, a=[78, -84], l=[90, 90, 0], at=['an', 120, 181]), dict(l=[62, 116, 0]), dict(a=[-40, -120], l=[90, 90, 20]), dict(a=[-86, -90], l=[90, 90, 0]), dict(a=[78, -84])], loop="cycle", thumb=.6, muscles="front_delt side_delt triceps quads"),
 "Dumbbell Push Press": J(None, keys=[dict(t=-90, a=[78, -84], l=[90, 90, 0], at=['an', 120, 181]), dict(l=[62, 116, 0]), dict(a=[-40, -120], l=[90, 90, 20]), dict(a=[-86, -90], l=[90, 90, 0]), dict(a=[78, -84])], loop="cycle", thumb=.6, muscles="front_delt side_delt triceps quads"),
 "Kettlebell Push Press": J(None, keys=[dict(t=-90, a=[78, -84], l=[90, 90, 0], at=['an', 120, 181]), dict(l=[62, 116, 0]), dict(a=[-40, -120], l=[90, 90, 20]), dict(a=[-86, -90], l=[90, 90, 0]), dict(a=[78, -84])], loop="cycle", thumb=.6, muscles="front_delt side_delt triceps quads"),
 "Renegade Row": J(None, keys=[dict(TOP, a=[90, 90], a2=[90, 90]), dict(a=[170, 80], twist=-12), dict(a=[90, 90], twist=0), dict(a2=[170, 80], twist=12), dict(a2=[90, 90], twist=0)], loop="cycle", nf=49, thumb=.25, wr_x=.26, muscles="lats abs_"),
 "Kettlebell Renegade Row": J(None, keys=[dict(TOP, a=[90, 90], a2=[90, 90]), dict(a=[170, 80], twist=-12), dict(a=[90, 90], twist=0), dict(a2=[170, 80], twist=12), dict(a2=[90, 90], twist=0)], loop="cycle", nf=49, thumb=.25, wr_x=.26, muscles="lats abs_"),
 "Rope Climb": J(None, keys=[dict(t=-90, a=[-85, -88], a2=[-30, -100], l=[40, 120, 0], at=['hip', 120, 62], wrw=[.02, -.1, 2.25], wrw2=[-.02, -.1, 1.82]), dict(a=[-30, -100], a2=[-85, -88], l=[90, 90, 0], wrw=[.02, -.1, 1.82], wrw2=[-.02, -.1, 2.25]), dict(a=[-85, -88], a2=[-30, -100], l=[40, 120, 0], wrw=[.02, -.1, 2.25], wrw2=[-.02, -.1, 1.82])], loop="cycle", hold="none", no_foot_floor=True, closed_hands=True, scene=[], props=[dict(k="cyl", r=.016, l=3.2, p=(0, -.1, 1.65), m="ACC")], muscles="lats biceps forearms", az=[60, 30]),
 "Sled Pull": J(None, loop="cycle", keys=gait(T=-104, A=24, arms=False, a=[10, 20]), no_foot_floor=True, hold="none", closed_hands=True, grip_w=.1, props=[dict(k="box", s=(.5, .7, .3), p=(0, 1.7, .15), m="DARK"), dict(k="link", a="gm", b=(0, 1.35, .25), r=.006, m="ACC")], muscles="G quads", az=[60, 90]),
 "Sled Push": J(None, loop="cycle", keys=gait(T=-40, A=30, arms=False, a=[10, 5], base=20), no_foot_floor=True, hold="none", closed_hands=True, grip_w=.22, props=[dict(k="box", s=(.6, .7, .28), p=(0, -1.25, .14), m="DARK"), dict(k="cyl", r=.018, l=1.05, p=(.22, -.92, .52), m="FRAME"), dict(k="cyl", r=.018, l=1.05, p=(-.22, -.92, .52), m="FRAME")], muscles="quads G calves", az=[60, 90]),
 "Snatch": J("full", keys=snatch(), **SN),
 "Power Snatch": J("power", keys=snatch(deep=False), **SN),
 "Hang Snatch": J("hang", keys=snatch(HANG), **SN),
 "Barbell Block Snatch": J("block", keys=snatch(dict(KNEE)), props=BLOCK, **SN),
 "Dumbbell Snatch": J("one", keys=snatch(), **{k: v for k, v in SN.items() if k != "grip_w"}, one_hand=True),
 "Kettlebell Snatch": J("one", keys=snatch(HANG), **{k: v for k, v in SN.items() if k != "grip_w"}, one_hand=True),
 "Barbell Sots Press": J(None, grip_w=.28),
 "Standing Knee to Elbow": J(None, keys=[S(a=[-130, 40], l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-66, a=[60, -40], l=[-20, 80, 0], twist=20), S(a=[-130, 40], l=[90, 90, 0], l2=[90, 90, 0], twist=0)], loop="cycle", hold="none", no_foot_floor=False),
 "Thruster": J(None), "Dumbbell Thruster": J(None), "Kettlebell Thruster": J(None),
 "Turkish Get Up": J(None, keys=[dict(t=180, a=[-90, -90], a2=[100, 100], l=[-40, 50, 0], l2=[0, 0, 0], at=['hip', 116, 176]), dict(t=-140, a=[-92, -92], a2=[130, 60]), dict(t=-110, a=[-92, -92], a2=[110, 110]), dict(t=-100, a=[-92, -92], a2=[100, 100], l=[-20, 70, 0], l2=[80, 170, 0], at=['hip', 116, 130]), dict(t=-90, a=[-92, -92], a2=[90, 90], l=[0, 92, 0], l2=[104, 178, 30], at=['hip', 116, 130]), S(a=[-92, -92], a2=[90, 90], l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-90, l=[0, 92, 0], l2=[104, 178, 30], at=['hip', 116, 130]), dict(t=-110, a=[-92, -92], a2=[110, 110], l=[-20, 70, 0], l2=[80, 170, 0]), dict(t=180, a=[-90, -90], a2=[100, 100], l=[-40, 50, 0], l2=[0, 0, 0], at=['hip', 116, 176])], nf=49, loop="cycle", thumb=.62, one_hand=True, muscles="abs_ front_delt G", no_foot_floor=True, az=[60, 90]),
 "Stomach Vacuum": J(None, still=True, muscles="abs_", az=[35, 60]),
 "Wall Ball": J(None, keys=[dict(t=-66, a=[56, -112], l=SQ, at=['an', 120, 181], bp=[0, -.3, .9]), dict(t=-90, a=[-40, -100], l=[90, 90, 0], bp=[0, -.42, 1.5]), dict(t=-90, a=[-80, -80], l=[90, 90, 20], bp=[0, -.85, 2.9]), dict(t=-90, a=[-60, -110], l=[80, 96, 0], bp=[0, -.42, 1.6]), dict(t=-66, a=[56, -112], l=SQ, bp=[0, -.3, .9])], nf=49, loop="cycle", hold="none", closed_hands=True, grip_w=.13, props=[dict(k="sph", r=.14, at="bp", m="RUBBER"), dict(k="box", s=(2.2, .1, 3.3), p=(0, -1.1, 1.65), m="DARK")], muscles="quads G front_delt", thumb=.5, az=[60, 90]),
 "Dumbbell Windmill": J(None, keys=[dict(view="front", ar=[-90, -90], al=[96, 96], lr=[80, 92], at=['hip', 120, 106], tilt=0), dict(tilt=-58, twist=18, ar=[-90, -90], al=[96, 96]), dict(tilt=0, twist=0)], ankle_free=True, loop="cycle", one_hand=True, muscles="obliques G"),
 "Kettlebell Windmill": J(None, keys=[dict(view="front", ar=[-90, -90], al=[96, 96], lr=[80, 92], at=['hip', 120, 106], tilt=0), dict(tilt=-58, twist=18, ar=[-90, -90], al=[96, 96]), dict(tilt=0, twist=0)], ankle_free=True, loop="cycle", one_hand=True, muscles="obliques G"),
 "Kettlebell Bent Press": J(None, keys=[dict(view="front", ar=[-30, -120], al=[96, 96], lr=[80, 92], at=['hip', 120, 106], tilt=0), dict(tilt=-58, twist=18, ar=[-90, -90]), dict(tilt=0, twist=0, ar=[-30, -120])], ankle_free=True, loop="cycle", one_hand=True, muscles="obliques front_delt"),
 "Wrist Roller": J(None, keys=[dict(a=[0, 0]), dict(a=[0, -10]), dict(a=[0, 0])], loop="cycle", closed_hands=True, grip_w=.15, props=[dict(k="link", a="gl", b="gr", r=.018, m="DARK"), dict(k="link", a="gm", b=(0, -.6, .55), r=.004, m="ACC"), dict(k="cyl", r=.1, l=.03, p=(0, -.6, .48), axis="X", m="RUBBER")], muscles="forearms", az=[35, 60]),
 "Yoke Walk": J(None, keys=gait(arms=False, a=[100, 30], A=18), no_foot_floor=True, loop="cycle", hold="none", closed_hands=True, props=[dict(k="cyl", r=.025, l=1.2, at="neck", off=(0, .08, 0), axis="X", m="STEEL"), dict(k="cyl", r=.03, l=1.5, at="neck", off=(.6, .08, -.72), m="FRAME"), dict(k="cyl", r=.03, l=1.5, at="neck", off=(-.6, .08, -.72), m="FRAME")], muscles="traps quads G abs_"),
})

# ── 고위험(사용자 지시로 제작 · 주의 문구 필수) ──
M.update({
 "Back Lever": J(None, start=dict(t=0, a=[-100, -100], l=[180, 180, 0], at=['wr', 150, 26]), scene=[dict(k="barF", y=26)], still=True, no_foot_floor=True, closed_hands=True, muscles="lats abs_"),
 "Barbell Behind the Neck Press": J(None), "Smith Behind the Neck Press": J(None),
 "Barbell Guillotine Press": J("guillotine", end=dict(a=[60, -92]), start=dict(a=[-92, -92])),
 "Dragon Flag": J(None, no_foot_floor=True),
 "Front Lever Hold": J(None, still=True, no_foot_floor=True, scene=[dict(k="barF", y=26)], closed_hands=True, muscles="lats abs_"),
 "Front Lever Raise": J("raise", start=dict(t=-90, a=[-90, -90], l=[90, 90, 0]), end=dict(t=180, a=[-80, -80], l=[0, 0, 0]), no_foot_floor=True, scene=[dict(k="barF", y=26)], closed_hands=True, muscles="lats abs_"),
 "Glute Ham Raise": J(None, no_foot_floor=True),
 "Handstand Hold": J("hold", still=True, no_foot_floor=True, az=[60, 90], muscles="front_delt side_delt"),
 "Handstand Walk": J("walk", keys=[dict(t=90, a=[96, 90], a2=[80, 90], l=[-90, -90, 0], at=['wr', 110, 182]), dict(a=[80, 90], a2=[96, 90], at=['wr2', 130, 182]), dict(a=[96, 90], a2=[80, 90], at=['wr', 110, 182])], loop="cycle", no_foot_floor=True, muscles="front_delt side_delt", az=[60, 90]),
 "Wall Walk": J("wall", keys=[dict(TOP), dict(t=20, a=[100, 96], l=[140, 150, 110]), dict(t=60, a=[96, 92], l=[-160, -160, 0]), dict(t=88, a=[92, 90], l=[-100, -100, 0]), dict(t=60, a=[96, 92], l=[-160, -160, 0]), dict(t=20, a=[100, 96], l=[140, 150, 110]), dict(TOP)], nf=49, loop="cycle", thumb=.5, no_foot_floor=True, hold="none", muscles="front_delt side_delt abs_", props=[dict(k="box", s=(2.4, .08, 2.6), p=(0, .28, 1.3), m="DARK")], az=[60, 90]),
 "Handstand Push Up": J(None, no_foot_floor=True, az=[60, 90], props=[dict(k="box", s=(2.4, .08, 2.6), p=(0, .28, 1.3), m="DARK")], scene=[]),
 "Human Flag": J(None, still=True, no_foot_floor=True, closed_hands=True, muscles="obliques lats", world_rot=[0, 0, 0], az=[60, 30]),
 "Barbell Jefferson Curl": J(None, keys=[dict(flex=0, t=-90), dict(flex=30, t=-40), dict(flex=60, t=30), dict(flex=30, t=-40), dict(flex=0, t=-90)], loop="cycle", muscles="erector hams", thumb=.5),
 "Dumbbell Jefferson Curl": J(None, keys=[dict(flex=0, t=-90), dict(flex=30, t=-40), dict(flex=60, t=30), dict(flex=30, t=-40), dict(flex=0, t=-90)], loop="cycle", muscles="erector hams", thumb=.5),
 "Korean Dip": J(None, no_foot_floor=True, scene=[dict(k="bar", at=[100, 70])], closed_hands=True),
 "L-Sit Hold": J(None, still=True, no_foot_floor=True, muscles="abs_ quads", props=[dict(k="cyl", r=.018, l=.6, p=(.25, 0, .5), axis="Y", m="STEEL"), dict(k="cyl", r=.018, l=.6, p=(-.25, 0, .5), axis="Y", m="STEEL")]),
 "Cable Behind the Neck Pulldown": J("neck", start=dict(tilt=0), end=dict(ar=[38, -80])),
 "Lying Neck Curl": J(None, keys=[dict(t=180, a=[10, 0], l=[0, 0, -80], at=['hip', 160, 120], nk=-30), dict(nk=30), dict(nk=-30)], loop="cycle", no_foot_floor=True, muscles="traps", az=[60, 30]),
 "Lying Neck Side Raise": J("side", keys=[dict(t=180, a=[10, 0], l=[0, 0, -80], at=['hip', 160, 120], nky=0), dict(nky=-32), dict(nky=0)], loop="cycle", no_foot_floor=True, muscles="traps", az=[60, 30]),
 "Lying Neck Extension": J(None, keys=[dict(t=0, a=[100, 100], l=[180, 180, 90], at=['hip', 100, 120], nk=30), dict(nk=-32), dict(nk=30)], loop="cycle", no_foot_floor=True, muscles="traps", az=[60, 90]),
 "Machine Neck Extension": J(None, keys=[S(t=-84, a=[10, 30], l=[0, 90, 0], at=['hip', 100, 140], nk=25), dict(nk=-25), dict(nk=25)], loop="cycle", muscles="traps", scene=[dict(k="bench", a=[78, 150], b=[128, 150])]),
 "Neck Harness Extension": J(None, keys=[dict(t=-40, a=[80, 90], l=[20, 100, 0], at=['an', 120, 181], nk=30), dict(nk=-25), dict(nk=30)], loop="cycle", muscles="traps", props=[dict(k="link", a="head", b=(0, -.3, .8), r=.006, m="ACC"), dict(k="cyl", r=.1, l=.03, p=(0, -.3, .75), axis="X", m="RUBBER")], hold="none"),
 "Nordic Curl": J(None, no_foot_floor=True, props=[dict(k="box", s=(.5, .12, .18), p=(0, .44, .14), m="PAD")]),
 "Reverse Nordic": J(None, start=dict(t=-90, a=[90, 90], l=[90, 180, 0]), end=dict(t=-130, a=[90, 90], l=[-130, 180, 0]), no_foot_floor=True, muscles="quads"),
 "Pistol Squat": J(None, muscles="quads G"),
 "Skater Squat": J("skater", start=dict(t=-90, a=[0, 0], l=[90, 90, 0], l2=[110, 160, 30]), end=dict(t=-48, a=[-4, -4], l=SQ, l2=[120, 180, 30]), muscles="quads G"),
 "Shrimp Squat": J("shrimp", start=dict(t=-90, a=[0, 0], l=[90, 90, 0], l2=[100, 240, 30]), end=dict(t=-48, a=[-4, -4], l=SQ, l2=[130, 250, 30]), muscles="quads G"),
 "Planche": J(None, still=True, no_foot_floor=True, muscles="front_delt abs_"),
 "Planche Push Up": J(None, no_foot_floor=True, muscles="front_delt chest"),
 "Behind the Neck Pull-up": J("neck", end=dict(ar=[34, -80], at=['wr', 156, 10])),
 "Pseudo Planche Push Up": J("pseudo", start=dict(t=-12, a=[108, 108], l=[168, 168, 90]), end=dict(t=-6, a=[166, 60], l=[174, 174, 90]), hold="none", muscles="front_delt chest"),
 "Sissy Squat": J(None, muscles="quads"),
 "Spanish Squat": J(None, muscles="quads", props=[dict(k="box", s=(.08, .08, 1.0), p=(0, 1.0, .5), m="FRAME")], band=dict(**{"from": [226, 138], "to": "kn"})),
})

# ── 유산소 ──
PED = dict(no_foot_floor=True, hold="none", closed_hands=True, loop="cycle", thumb=.25)
def pedal(T, pz, bar, n=6):
    return [dict(t=T, a=[20, 20], l=[20, 100, 0], l2=[60, 100, 0], at=['hip', 120, 104], pz=pz, wrw=[.24, bar[0], bar[1]], wrw2=[-.24, bar[0], bar[1]], u=0), dict(u=1)]
BIKE = dict(crank=dict(c=[-.32, .34], r=.17, x=.13), props=[dict(k="bike", crank=[-.32, .34], seat=[.02, .88], bar=[-.62, 1.08])], keys=pedal(-68, .99, (-.62, 1.08)), muscles="quads G calves", az=[60, 90], **PED)
ROWK = [dict(t=-66, a=[8, 8], l=[-20, 90, 0], at=['hip', 155, 160], pz=.42, ank=[.13, -.8, .34], ank2=[-.13, -.8, .34], wrw=[.14, -.92, .68], wrw2=[-.14, -.92, .68], u=0), dict(t=-80, at=['hip', 128, 160], wrw=[.14, -.62, .72], wrw2=[-.14, -.62, .72], u=.28), dict(t=-112, at=['hip', 120, 160], wrw=[.14, -.22, .78], wrw2=[-.14, -.22, .78], u=.42), dict(t=-112, wrw=[.14, -.22, .78], wrw2=[-.14, -.22, .78], u=.48), dict(t=-88, at=['hip', 124, 160], wrw=[.14, -.6, .72], wrw2=[-.14, -.6, .72], u=.68), dict(t=-66, at=['hip', 155, 160], wrw=[.14, -.92, .68], wrw2=[-.14, -.92, .68], u=1)]
ERG = [S(t=-90, a=[-80, -80], wrw=[.14, -.36, 1.92], wrw2=[-.14, -.36, 1.92], u=0), dict(t=-60, l=[70, 104, 0], wrw=[.14, -.48, 1.1], wrw2=[-.14, -.48, 1.1], u=.28), dict(t=-30, l=[60, 110, 0], wrw=[.14, -.34, .58], wrw2=[-.14, -.34, .58], u=.5), dict(t=-70, l=[80, 100, 0], wrw=[.14, -.44, 1.2], wrw2=[-.14, -.44, 1.2], u=.75), S(t=-90, a=[-80, -80], wrw=[.14, -.36, 1.92], wrw2=[-.14, -.36, 1.92], u=1)]
def boxing():
    G = dict(a=[60, -70], a2=[80, -80])
    return [dict(t=-84, l=[74, 100, 0], l2=[106, 90, 0], at=['hip', 110, 108], **G), dict(a=[-6, -4], a2=[80, -80], t=-80), dict(G, t=-84), dict(a=[60, -70], a2=[-6, -4], t=-80), dict(G, t=-84)]
M.update({
 "Aerobics": J(None, keys=[dict(view="front", ar=[-60, -70], lr=[86, 90], at=['hip', 120, 106]), dict(ar=[30, -40], lr=[70, 110], ll=[100, 90]), dict(ar=[-60, -70], al=[-120, -110], lr=[86, 90], ll=[94, 90]), dict(ar=[60, 10], lr=[100, 90], ll=[110, 70]), dict(ar=[-60, -70], lr=[86, 90], ll=[94, 90])], loop="cycle", ankle_free=True, no_foot_floor=True, hold="none", muscles="side_delt quads", prompt="aerobics dance step", nf=49, az=[0, 20]),
 "Boxing": J(None, keys=boxing(), loop="cycle", hold="none", closed_hands=True, muscles="front_delt chest abs_", no_foot_floor=True),
 "Climbing": J(None, keys=[dict(t=-96, a=[-70, -100], a2=[-20, -60], l=[20, 110, 0], l2=[80, 90, 0], at=['hip', 130, 110], wrw=[.2, -.3, 2.05], wrw2=[-.2, -.3, 1.6], ank=[.2, -.3, .4], ank2=[-.2, -.3, .75]), dict(a=[-20, -60], a2=[-70, -100], wrw=[.2, -.3, 1.6], wrw2=[-.2, -.3, 2.05], ank=[.2, -.3, .75], ank2=[-.2, -.3, .4]), dict(wrw=[.2, -.3, 2.05], wrw2=[-.2, -.3, 1.6], ank=[.2, -.3, .4], ank2=[-.2, -.3, .75])], loop="cycle", hold="none", no_foot_floor=True, closed_hands=True, scene=[], props=[dict(k="box", s=(2.4, .1, 3.0), p=(0, -.46, 1.5), m="DARK")]+[dict(k="sph", r=.05, p=p, m="RUBBER") for p in ((.2, -.4, 2.05), (-.2, -.4, 2.05), (.2, -.4, 1.6), (-.2, -.4, 1.6), (.2, -.4, .4), (-.2, -.4, .4), (.2, -.4, .75), (-.2, -.4, .75))], muscles="lats forearms quads", az=[150, 120]),
 "Outdoor Cycling": J(None, **{**BIKE, "props": [dict(k="cyl", r=.33, l=.04, p=(0, -.62, .33), axis="X", m="RUBBER"), dict(k="cyl", r=.33, l=.04, p=(0, .4, .33), axis="X", m="RUBBER")]+[dict(k="bike", crank=[-.32, .34], seat=[.02, .88], bar=[-.62, 1.08])]}, scene=[]),
 "Elliptical": J(None, crank=dict(c=[-.05, .28], ry=.22, rz=.07, x=.14), keys=[dict(t=-84, a=[20, -40], a2=[60, -10], l=[70, 104, 0], l2=[104, 90, 0], at=['hip', 120, 96], pz=1.2, wrw=[.26, -.52, 1.32], wrw2=[-.26, -.34, 1.2], u=0), dict(wrw=[.26, -.34, 1.2], wrw2=[-.26, -.52, 1.32], u=.5), dict(wrw=[.26, -.52, 1.32], wrw2=[-.26, -.34, 1.2], u=1)], scene=[], props=[dict(k="box", s=(.5, 1.5, .06), p=(0, -.05, .03), m="FRAME"), dict(k="box", s=(.16, .34, .34), p=(0, -.7, .3), m="DARK"), dict(k="link", a=(0, -.7, .4), b=(0, -.62, 1.35), r=.025, m="FRAME"), dict(k="link", a="gl", b="an", r=.012, m="STEEL"), dict(k="link", a="gr", b="an2", r=.012, m="STEEL")], muscles="quads G", az=[60, 90], **PED),
 "Hiking": J(None, **walk(T=-80, A=26), loop="cycle", hold="none", muscles="quads G calves", props=[dict(k="box", s=(.3, .16, .42), at="chest", off=(0, .22, -.05), m="DARK")]),
 "Jump Rope": J(None, keys=[S(a=[70, 20], l=[90, 90, 25], dz=0), dict(a=[70, 20], l=[90, 90, 30], dz=.09), S(a=[70, 20], l=[90, 90, 25], dz=0)], no_foot_floor=True, loop="cycle", hold="none", closed_hands=True, wr_x=.3, props=[dict(k="wave", a="gl", b="gr", arc=1.1, n=20, r=.005, m="CABLE")], muscles="calves forearms", az=[35, 20]),
 "Pilates": J(None, keys=[dict(t=180, a=[0, 0], l=[-60, -60, 0], at=['hip', 120, 178]), dict(t=200, a=[10, 10], l=[-40, -40, 0]), dict(t=180, a=[0, 0], l=[-60, -60, 0])], loop="cycle", no_foot_floor=True, hold="none", muscles="abs_", prompt="pilates hundred"),
 "Recumbent Bike": J(None, crank=dict(c=[-.82, .5], r=.15, x=.13), keys=[dict(t=-122, a=[60, 20], l=[-10, 30, -80], l2=[10, 60, -80], at=['hip', 120, 140], pz=.62, wrw=[.28, -.05, .6], wrw2=[-.28, -.05, .6], u=0), dict(u=1)], scene=[], props=[dict(k="box", s=(.42, .42, .08), p=(0, 0, .5), m="PAD"), dict(k="box", s=(.42, .08, .62), p=(0, .28, .8), m="PAD"), dict(k="box", s=(.06, 1.2, .06), p=(0, -.42, .35), m="FRAME"), dict(k="link", a=(0, -.8, .5), b=(0, -.42, .35), r=.024, m="FRAME"), dict(k="box", s=(.5, .08, .04), p=(0, .2, .02), m="FRAME"), dict(k="box", s=(.5, .08, .04), p=(0, -.9, .02), m="FRAME"), dict(k="link", a=(0, -.2, .35), b=(0, -.2, .05), r=.024, m="FRAME"), dict(k="cyl", r=.04, l=.03, p=(.03, -.82, .5), axis="X", m="DARK")], muscles="quads G", az=[60, 90], **PED),
 "Rowing Machine": J(None, keys=ROWK, loop="cycle", no_foot_floor=True, hold="none", closed_hands=True, grip_w=.14, scene=[], props=[dict(k="rower")], muscles="lats midback quads", az=[60, 90], thumb=.42),
 "Running": J(None, **tkd(A=38, B=38, knee=72, elbow=78, T=-82, bounce=.05), loop="cycle", muscles="quads G calves"),
 "Skater Jump": J(None, keys=[dict(view="front", ar=[60, 30], al=[130, 150], lr=[60, 96], ll=[120, 130], at=['hip', 90, 128]), dict(ar=[92, 92], al=[92, 92], lr=[80, 92], ll=[100, 90], at=['hip', 120, 96], dz=.12), dict(ar=[130, 150], al=[60, 30], lr=[60, 110], ll=[120, 96], at=['hip', 150, 128], dz=0), dict(ar=[92, 92], al=[92, 92], lr=[80, 92], ll=[100, 90], at=['hip', 120, 96], dz=.12), dict(ar=[60, 30], al=[130, 150], lr=[60, 96], ll=[120, 130], at=['hip', 90, 128], dz=0)], ankle_free=True, no_foot_floor=True, loop="cycle", hold="none", nf=49, muscles="G quads", az=[0, 20]),
 "Skating": J(None, loop="cycle", keys=gait(T=-48, A=30, B=40, knee=20, elbow=10, base=-10), no_foot_floor=True, hold="none", muscles="G quads", props=[dict(k="box", s=(.05, .34, .05), at="an", off=(0, -.05, -.1), m="STEEL"), dict(k="box", s=(.05, .34, .05), at="an2", off=(0, -.05, -.1), m="STEEL")], scene=[]),
 "Skiing": J(None, keys=[dict(t=-60, a=[60, 100], l=[40, 120, 10], at=['hip', 120, 124], twist=0), dict(t=-56, a=[80, 110], l=[36, 124, 10], twist=8), dict(t=-60, a=[60, 100], l=[40, 120, 10], twist=0)], loop="cycle", hold="none", closed_hands=True, no_foot_floor=True, scene=[], props=[dict(k="box", s=(.09, 1.7, .025), at="an", off=(0, -.15, -.095), m="DARK"), dict(k="box", s=(.09, 1.7, .025), at="an2", off=(0, -.15, -.095), m="DARK"), dict(k="link", a="gl", b=(.34, -.2, .02), r=.008, m="STEEL"), dict(k="link", a="gr", b=(-.34, -.2, .02), r=.008, m="STEEL")], muscles="quads G", az=[60, 90]),
 "SkiErg": J(None, keys=ERG, loop="cycle", no_foot_floor=True, hold="none", closed_hands=True, grip_w=.14, scene=[], props=[dict(k="box", s=(.14, .1, 2.3), p=(0, -.72, 1.15), m="FRAME"), dict(k="box", s=(.6, .5, .04), p=(0, -.72, .02), m="FRAME"), dict(k="link", a="gl", b=(.06, -.68, 2.2), r=.004, m="CABLE"), dict(k="link", a="gr", b=(-.06, -.68, 2.2), r=.004, m="CABLE")], muscles="lats abs_ triceps", az=[60, 90], thumb=.5),
 "Snowboarding": J(None, keys=[dict(view="front", ar=[10, 30], lr=[70, 110], ll=[110, 70], at=['hip', 120, 128], tilt=0), dict(ar=[-10, 10], tilt=6), dict(ar=[10, 30], tilt=0)], ankle_free=True, no_foot_floor=True, loop="cycle", hold="none", scene=[], props=[dict(k="box", s=(1.45, .28, .025), p=(0, 0, .03), m="DARK")], muscles="quads G", az=[0, 20]),
 "Sprint": J(None, **tkd(A=52, B=52, knee=88, elbow=90, T=-70, bounce=.06, foot=26, base=-10), loop="cycle", muscles="quads G hams calves"),
 "Stair Climber": J(None, crank=dict(c=[-.28, .36], ry=.1, rz=.14, x=.14), keys=[dict(t=-82, a=[20, -40], l=[20, 110, 0], l2=[94, 90, 0], at=['hip', 120, 96], pz=1.12, wrw=[.42, -.12, 1.2], wrw2=[-.42, -.12, 1.2], u=0), dict(u=1)], scene=[], props=[dict(k="stairs")], muscles="quads G calves", az=[60, 90], **PED),
 "Stepper": J("stepper", crank=dict(c=[-.05, .3], ry=.015, rz=.12, x=.14), keys=[dict(t=-82, a=[20, -40], l=[20, 110, 0], l2=[94, 90, 0], at=['hip', 120, 96], pz=1.1, wrw=[.3, -.4, 1.12], wrw2=[-.3, -.4, 1.12], u=0), dict(u=1)], scene=[], props=[dict(k="box", s=(.6, .9, .06), p=(0, -.1, .03), m="FRAME"), dict(k="link", a=(0, -.55, .05), b=(0, -.55, 1.1), r=.026, m="FRAME"), dict(k="cyl", r=.016, l=.62, p=(0, -.46, 1.1), axis="X", m="RUBBER"), dict(k="link", a="an", b=(.14, -.3, .1), r=.012, m="STEEL"), dict(k="link", a="an2", b=(-.14, -.3, .1), r=.012, m="STEEL")], muscles="quads G calves", az=[60, 90], **PED),
 "Indoor Cycling": J(None, **{**BIKE}),
 "Assault Bike": J("assault", **{**BIKE, "keys": [dict(t=-68, a=[20, 20], l=[20, 100, 0], l2=[60, 100, 0], at=['hip', 120, 104], pz=.99, wrw=[.24, -.72, 1.14], wrw2=[-.24, -.42, 1.0], u=0), dict(wrw=[.24, -.42, 1.0], wrw2=[-.24, -.72, 1.14], u=.5), dict(wrw=[.24, -.72, 1.14], wrw2=[-.24, -.42, 1.0], u=1)], "props": [dict(k="bike", crank=[-.32, .34], seat=[.02, .88], bar=[-.62, .4]), dict(k="link", a="gl", b=(.1, -.82, .3), r=.014, m="FRAME"), dict(k="link", a="gr", b=(-.1, -.82, .3), r=.014, m="FRAME")], "muscles": "quads G lats triceps"}),
 "Stretching": J(None, start=S(t=-90, a=[90, 90]), end=dict(t=60, a=[90, 90], l=[90, 90, 0], at=['an', 120, 181]), hold="none", muscles="hams", prompt="hamstring stretch"),
 "Swimming": J(None, keys=[dict(t=0, a=[-6, -6], a2=[120, 150], l=[182, 182, 180], l2=[174, 174, 180], at=['hip', 90, 120], twist=14), dict(a=[60, 100], a2=[-6, -6], twist=0), dict(a=[120, 150], a2=[60, 100], twist=-14), dict(a=[180, 100], a2=[120, 150], l=[174, 174, 180], l2=[182, 182, 180]), dict(a=[-6, -6], a2=[120, 150], l=[182, 182, 180], l2=[174, 174, 180], twist=14)], loop="cycle", no_foot_floor=True, hip_z=.72, hold="none", scene=[], muscles="lats front_delt", az=[60, 30]),
 "Treadmill Running": J(None, **tkd(A=34, B=34, knee=66, elbow=72, T=-82, bounce=.04), floor_z=.112, loop="cycle", scene=[], props=[dict(k="treadmill")], muscles="quads G calves", az=[60, 90]),
 "Walking": J(None, **tkd(), loop="cycle", muscles="quads G calves"),
 "Yoga": J(None, keys=[S(a=[-90, -90]), dict(t=60, a=[60, 60], l=[100, 90, 0], at=['an', 120, 181]), dict(t=30, a=[50, 40], l=[132, 132, 130]), dict(t=60, a=[60, 60], l=[100, 90, 0], at=['an', 120, 181]), S(a=[-90, -90])], nf=49, loop="cycle", thumb=.5, hold="none", muscles="hams front_delt", prompt="yoga sun salutation", no_spread=False),
})

# ── 평면 밖 ──
BANDKN = [dict(k="link", a="kn", b="kn2", r=.012, m="band2")]
M.update({
 "Band Hip Abduction": J(None, ankle_free=True, no_foot_floor=True, muscles="G", az=[0, 20]),
 "Cable Hip Abduction": J(None, ankle_free=True, no_foot_floor=True, muscles="G", az=[0, 20]),
 "Cable Hip Adduction": J(None, ankle_free=True, no_foot_floor=True, muscles="adductors", az=[0, 20]),
 "Clamshell": J(None, keys=[dict(view="front", ar=[92, 2], al=[100, 96], lr=[60, 160], ll=[60, 160], at=['hip', 120, 106]), dict(lr=[10, 150]), dict(lr=[60, 160])], world_rot=[0, 90, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", props=BANDKN, muscles="G", az=[0, 30], el=[35, 25]),
 "Copenhagen Plank": J(None, keys=[dict(view="front", ar=[92, 2], al=[60, 40], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], tilt=-2), dict(tilt=2), dict(tilt=-2)], world_rot=[0, 80, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="adductors obliques", az=[0, 30], el=[20, 30], props=[dict(k="box", s=(.42, .9, .42), p=(0, 0, .21), m="PAD")]),
 "Fire Hydrant": J(None, keys=[dict(t=0, a=[90, 90], l=[90, 0, 90], l2=[90, 0, 90], at=['wr', 168, 181], ax=0), dict(ax=.3), dict(ax=0)], loop="cycle", no_foot_floor=False, hold="none", muscles="G", az=[150, 120], el=[20, 30]),
 "Hatfield Squat": J(None, hold="sh", grip_w=.3, start=dict(a=[60, 20]), end=dict(a=[40, 10]), closed_hands=True, props=[dict(k="box", s=(.9, .1, 1.25), p=(0, -.7, .62), m="FRAME"), dict(k="link", a="gl", b=(.3, -.68, 1.2), r=.016, m="FRAME"), dict(k="link", a="gr", b=(-.3, -.68, 1.2), r=.016, m="FRAME")], muscles="quads G"),
 "Hip Abduction Machine": J(None, ankle_free=True, muscles="G", az=[0, 20]),
 "Hip Adduction Machine": J(None, ankle_free=True, muscles="adductors", az=[0, 20]),
 "Landmine 180": J(None, keys=[S(a=[10, -30], twist=45), dict(twist=0, a=[-40, -50]), dict(twist=-45, a=[10, -30]), dict(twist=0, a=[-40, -50]), S(a=[10, -30], twist=45)], loop="cycle", muscles="obliques abs_", closed_hands=True, nf=49, wr_x=.06, hold="none", scene=[dict(k="lever", pivot=[24, 186], to="wr", w=5)], az=[35, 60]),
 "Lateral Squat": J("squat", keys=[dict(view="front", ar=[20, 160], lr=[80, 90], at=['hip', 120, 106], ank=[.42, 0, .1], ank2=[-.42, 0, .1], dx=0, pz=.86), dict(pz=.5, dx=.3), dict(pz=.86, dx=0), dict(pz=.5, dx=-.3), dict(pz=.86, dx=0)], loop="cycle", hold="none", no_foot_floor=True, muscles="adductors quads G", az=[0, 20], nf=49),
 "Lateral Lunge": J("bw", keys=[dict(view="front", ar=[20, 160], lr=[80, 90], at=['hip', 120, 106], ank=[.42, 0, .1], ank2=[-.42, 0, .1], dx=0, pz=.86), dict(pz=.5, dx=.3), dict(pz=.86, dx=0)], loop="cycle", hold="none", no_foot_floor=True, muscles="adductors quads G", az=[0, 20]),
 "Dumbbell Lateral Lunge": J("db", keys=[dict(view="front", ar=[92, 92], lr=[80, 90], at=['hip', 120, 106], ank=[.42, 0, .1], ank2=[-.42, 0, .1], dx=0, pz=.86), dict(pz=.5, dx=.3), dict(pz=.86, dx=0)], loop="cycle", no_foot_floor=True, muscles="adductors quads G", az=[0, 20]),
 "Barbell Rollout": J(None, keys=[dict(t=-70, a=[80, 80], l=[180, 180, 0], at=['kn', 92, 180]), dict(t=-6, a=[-8, -8]), dict(t=-70, a=[80, 80])], loop="cycle", hold="wr", no_foot_floor=True, muscles="abs_ lats"),
 "Ab Wheel Rollout": J(None, keys=[dict(t=-70, a=[80, 80], l=[180, 180, 0], at=['kn', 92, 180]), dict(t=-6, a=[-8, -8]), dict(t=-70, a=[80, 80])], loop="cycle", hold="none", no_foot_floor=True, closed_hands=True, grip_w=.1, props=[dict(k="cyl", r=.09, l=.08, at="gm", axis="X", m="RUBBER", off=(0, 0, -.02)), dict(k="link", a="gl", b="gr", r=.014, m="STEEL")], muscles="abs_ lats"),
 "Russian Twist": J(None, keys=[dict(t=-126, a=[40, 10], l=[-30, 60, 0], at=['hip', 120, 176], twist=40, view="side"), dict(twist=0), dict(twist=-40), dict(twist=0), dict(twist=40)], loop="cycle", hold="none", no_foot_floor=True, closed_hands=True, wr_x=.08, muscles="obliques abs_", az=[35, 60]),
 "Lateral Leg Raise": J(None, ankle_free=True, world_rot=[0, 90, 0], no_foot_floor=True, muscles="G", az=[0, 30], el=[30, 20]),
 "Side Plank": J(None, keys=[dict(view="front", ar=[92, 2], al=[92, 90], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], tilt=-3), dict(tilt=3), dict(tilt=-3)], world_rot=[0, 72, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="obliques abs_", az=[0, 30], el=[20, 30]),
 "Side Plank Rotation": J("rot", keys=[dict(view="front", ar=[92, 2], al=[-90, -90], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], twist=0), dict(al=[120, 160], twist=38), dict(al=[-90, -90], twist=0)], world_rot=[0, 72, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="obliques abs_", az=[0, 30], el=[20, 30]),
 "Side Plank Crunch": J("crunch", keys=[dict(view="front", ar=[92, 2], al=[-110, 160], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], sbend=0), dict(ll=[40, 130], sbend=-22), dict(ll=[92, 92], sbend=0)], world_rot=[0, 72, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="obliques abs_", az=[0, 30], el=[20, 30]),
 "Torso Rotation Machine": J(None, keys=[dict(view="front", ar=[30, 150], lr=[80, 92], seated=True, at=['hip', 120, 138], twist=35, al=[150, 30]), dict(twist=-35), dict(twist=35)], loop="cycle", hold="none", closed_hands=True, muscles="obliques abs_"),
})

# ── 그립·쓰는 쪽 ──
M.update({
 "Single-arm Chest Press Machine": J("onearm", end=dict(a2=[5, 0]), start=dict(a2=[5, 0])),
 "Close Grip Pulldown": J("close", grip_w=.1, grip="neutral", start=dict(ar=[-78, -86]), end=dict(ar=[60, -96])),
 "Single-arm Lat Pulldown": J("onearm", start=dict(al=[92, 92]), end=dict(al=[92, 92]), muscles="lats biceps"),
 "Band Pallof Press": J(None, muscles="obliques abs_", grip_w=.04),
 "Pallof Press": J(None, muscles="obliques abs_", grip_w=.04),
 "One Arm Pull-up": J("onearm", start=dict(al=[60, 80]), end=dict(al=[60, 80])),
 "Wide Grip Push Up": J("wide", wr_x=.46, hold="none"),
 "One Arm Push Up": J("onearm", start=dict(a2=[180, 30]), end=dict(a2=[180, 30]), hold="none"),
 "Rope Pushdown": J("rope", grip="neutral", grip_w=.05),
 "Reverse Grip Pushdown": J("reverse", grip="under"),
 "Wide-Elbow Triceps Press": J("wide", grip="over", wr_x=.2, muscles="triceps"),
})

# ── 기구 추가 ──
def ring(**x): return dict(props=[dict(k="rings", **x)], no_foot_floor=True, closed_hands=True, hold="none")
M.update({
 "Safety Bar Squat": J("safety", hold="sh", start=dict(a=[60, 30]), end=dict(a=[50, 20]), closed_hands=True, props=[dict(k="link", a="gl", b="gr", r=.016, m="STEEL")], muscles="quads G"),
 "Parallel Bar Knee Raise": J("knee", start=dict(l=[92, 92, 30]), end=dict(l=[-20, 90, 0]), no_foot_floor=True, muscles="abs_"),
 "Parallel Bar Leg Raise": J("leg", start=dict(l=[92, 92, 30]), end=dict(l=[-4, -4, 0]), no_foot_floor=True, muscles="abs_"),
 "Exercise Ball Crunch": J("ball", hip_z=.62, start=dict(l=[30, 110, 0]), end=dict(t=210, l=[30, 110, 0]), no_foot_floor=True, props=[dict(k="sph", r=.32, p=(0, -.08, .32), m="PAD")], muscles="abs_", az=[60, 90]),
 "Ring Dip": J("ring", **ring(y=-.1), dipbars=False, palm_down=1, wr_x=.26),
 "Stability Ball Leg Curl": J("ball", start=dict(t=172, l=[-6, 0, 30]), end=dict(t=170, l=[-60, 80, 30]), feet_lock=False, no_foot_floor=True, props=[dict(k="sph", r=.3, at="an", off=(0, -.24, -.18), m="PAD")], muscles="hams G"),
 "Ring Row": J("ring", **ring(y=-.2, top=2.6), scene=[], wr_x=.22),
 "Overhead Plate Raise": J("overhead", start=dict(a=[-40, -60]), end=dict(a=[-96, -96])),
 "Ring Pull Up": J("ring", **ring(y=0, top=2.8), scene=[], grip="neutral"),
 "Ring Push Up": J("ring", props=[dict(k="rings", y=-.45, top=2.4)], hold="none", closed_hands=True, palm_down=1, wr_x=.26),
})

# ── 기구 표현·개념 ──
M.update({
 "Ab Crunch Machine": J("seat", start=dict(t=-92, a=[-40, -120], l=[10, 90, 0], at=['hip', 100, 140]), end=dict(t=-58, a=[-20, -100], l=[10, 90, 0], at=['hip', 100, 140]), scene=[dict(k="bench", a=[78, 150], b=[128, 150])], hold="none", closed_hands=True, machine=[dict(k="stack", x=48, top=60), dict(k="lever", pivot=[70, 44], to="wr")], muscles="abs_"),
 "Ab Coaster": J("coaster", start=dict(view="side", t=-40, a=[90, 90], l=[150, 60, 150], at=['kn', 110, 130]), end=dict(view="side", t=-34, a=[90, 90], l=[70, 20, 150], at=['kn', 110, 110]), no_foot_floor=True, hold="none", machine=[dict(k="line", a=[60, 150], b=[180, 120], w=5), dict(k="pad", a="kn", b="kn", w=12)], muscles="abs_"),
 "Cable Goblet Squat": J("cable", hold="none", closed_hands=True, grip_w=.06, cable=dict(**{"from": [160, 176], "col": 168})),
 "Hip Thrust (Machine)": J("pad", hold="none", machine=[dict(k="pad", a="hip", b="hip", w=14), dict(k="lever", pivot=[210, 140], to="hip", w=5)], closed_hands=True),
 "Glute Kickback Machine": J("pad", hold="none", machine=[dict(k="pad", a=[140, 120], b=[180, 120], w=8), dict(k="lever", pivot=[60, 180], to="an"), dict(k="stack", x=30, top=60)]),
 "Pendulum Squat": J("frame", props=[dict(k="box", s=(.42, .08, .72), at="chest", off=(0, .18, -.05), m="PAD"), dict(k="link", a="sh", b=(0, 1.0, 2.1), r=.024, m="FRAME"), dict(k="box", s=(.09, .09, 2.2), p=(0, 1.0, 1.1), m="FRAME")], scene=[], closed_hands=True),
 "Machine V Squat": J("frame", props=[dict(k="box", s=(.42, .08, .72), at="chest", off=(0, .18, -.05), m="PAD"), dict(k="link", a="hip", b=(.3, .9, .08), r=.024, m="FRAME"), dict(k="link", a="hip", b=(-.3, .9, .08), r=.024, m="FRAME")], closed_hands=True),
 "Barbell Hack Squat": J("bar", hold="hip", start=dict(t=-86, a=[92, 90], l=[90, 90, 0], at=['an', 120, 181]), end=dict(t=-56, a=[110, 92], l=SQ, at=['an', 120, 181]), machine=[], scene=[], az=[150, 120]),
 "Smith Hack Squat": J("smith", start=dict(t=-86, a=[118, -66], l=[80, 96, 0], at=['an', 140, 181]), end=dict(t=-82, a=[118, -66], l=[10, 110, 0], at=['an', 140, 181]), hold="sh", machine=[], scene=[]),
 "Machine Incline Fly": J("fly", lie=-55, no_foot_floor=True, az=[35, 60], el=[9, 20], bench_top=.5, scene=[], machine=[], hold="none", closed_hands=True),
 "Seated Cable Fly": J("seated", start=dict(view="front", ar=[0, -30], lr=[80, 92], seated=True, at=['hip', 120, 138]), end=dict(view="front", ar=[-10, 195], lr=[80, 92], seated=True, at=['hip', 120, 138]), machine=[], scene=[dict(k="pad", a=[120, 72], b=[120, 136], w=34)], cable=dict(**{"from": [28, 100], "col": 22, "both": True}), muscles="chest"),
 "Bodyweight Triceps Extension": J("floor", start=dict(TOP, a=[90, 90]), end=dict(t=-20, a=[160, 10], l=[168, 168, 90]), hold="none", muscles="triceps", az=[60, 90]),
 "Dumbbell Woodchop": J("db", grip="nfront", keys=[dict(view="front", ar=[-40, -40], al=[-80, -60], lr=[95, 90], at=['hip', 120, 106], twist=-30), dict(ar=[120, 130], al=[100, 110], twist=30), dict(ar=[-40, -40], al=[-80, -60], twist=-30)], loop="cycle", muscles="obliques abs_", cable={}, hold="chest"),
 "Decline Sit Up": J("bench", start=dict(t=170), end=dict(t=-80), no_foot_floor=True, bench_top=.55, muscles="abs_"),
 "Decline Crunch": J("crunch", start=dict(t=170), end=dict(t=212), no_foot_floor=True, bench_top=.55, muscles="abs_"),
 "Standing Cable Chest Press": J("stand", start=dict(t=-86, a=[150, 40], l=[74, 104, 0], l2=[104, 92, 0], at=['an', 100, 181]), end=dict(t=-86, a=[6, 2], l=[74, 104, 0], l2=[104, 92, 0], at=['an', 100, 181]), scene=[], cable=dict(**{"from": [28, 90], "col": 22, "both": True})),
 "Reverse Hyperextension": J(None, start=dict(l=[100, 92, 0]), end=dict(l=[176, 176, 0]), no_foot_floor=True, prompt="reverse hyperextension on a bench"),
 "Frog Pump": J(None, start=dict(t=170, a=[100, 0], l=[-40, 90, 0], at=['hip', 128, 166]), end=dict(t=150, a=[120, 10], l=[-20, 100, 0], at=['hip', 128, 150]), stance=.26, no_hand_floor=True, hold="hip", az=[60, 30]),
 "Dumbbell Close Grip Press": J("close", wr_x=.05, hold="wr"),
 "Band Chest Fly": J("lying", lie=-90, no_foot_floor=True, az=[35, 60, 90], el=[20, 9], band=dict(**{"from": "sh", "to": "wr"}), scene=[]),
 "Smith Good Morning": J("fixed", hold="sh", feet_lock=True),
 "Dumbbell Sumo Deadlift": J("sumo", start=dict(view="front", ar=[92, 92], lr=[30, 104], ll=[150, 76], at=['hip', 120, 136]), end=dict(view="front", ar=[94, 94], lr=[72, 94], ll=[108, 86], at=['hip', 120, 106]), hold="chest", ankle_free=True, az=[35, 0]),
 "GHD Sit Up": J("ghd", start=dict(t=180, a=[-130, 160], l=[0, 0, 40], at=['hip', 120, 96]), end=dict(t=-70, a=[-20, -40], l=[0, 0, 40], at=['hip', 120, 96]), no_foot_floor=True, hold="none", machine=[], props=[dict(k="box", s=(.42, .5, .12), p=(0, -.1, .94), m="PAD"), dict(k="box", s=(.42, .14, .22), p=(0, -.7, 1.03), m="PAD"), dict(k="box", s=(.08, .08, .92), p=(0, -.25, .46), m="FRAME"), dict(k="box", s=(.5, .9, .04), p=(0, -.25, .02), m="FRAME")], muscles="abs_", az=[60, 90]),
 "Barbell Incline Close Grip Bench Press": J("close", grip_w=.15, hold="wr"),
})
# ── 사전 렌더 눈 검수 뒤 고침(k00~k27) ──
FREE = dict(free_contact=True)
def LM(*more): return [dict(k="link", a="gm", b=(0, -1.55, .03), r=.018, m="STEEL"), dict(k="box", s=(.12, .12, .08), p=(0, -1.55, .04), m="DARK")]+list(more)
LMK = dict(hold="none", closed_hands=True, grip_w=.05, wr_x=.05, scene=[])
LOWSIDE = dict(az=[0, 30], el=[12, 18])
CRN = dict(a=[-130, 160])
TOPP = dict(t=-12, a=[90, 90], l=[168, 168, 90])
def tall_wall(y, w=1.1, h=2.4): return dict(k="box", s=(w, .08, h), p=(0, y, h/2), m="DARK")
def XO(z): return [dict(k="box", s=(.08, .08, 2.2), p=(1.05, 0, 1.1), m="FRAME"), dict(k="box", s=(.08, .08, 2.2), p=(-1.05, 0, 1.1), m="FRAME"), dict(k="link", a="gl", b=(1.05, 0, z), r=.004, m="CABLE"), dict(k="link", a="gr", b=(-1.05, 0, z), r=.004, m="CABLE")]
LIE = dict(no_foot_floor=True, floor_clamp=True, hold="none", no_hand_floor=True, az=[60, 30])
HK = [dict(t=-86, a=[60, -30], a2=[110, 60], l=[12, 104, 0], l2=[90, 90, 25], at=['hip', 120, 107]), dict(a=[85, 15], a2=[85, 15], l=[60, 100, 0], l2=[60, 100, 0], dz=.03), dict(a=[110, 60], a2=[60, -30], l=[90, 90, 25], l2=[12, 104, 0], dz=0), dict(a=[85, 15], a2=[85, 15], l=[60, 100, 0], l2=[60, 100, 0], dz=.03), dict(a=[60, -30], a2=[110, 60], l=[12, 104, 0], l2=[90, 90, 25], dz=0)]
def bridge(k1, k2, **x): return dict(keys=[k1, k2, k1], loop="cycle", **LIE, **x)
ROPE = [dict(k="link", a="head", b=(0, -.3, .8), r=.006, m="ACC")]
M.update({
 "Diamond Push Up": J("diamond", wr_x=.06, floor_wr_x=True, hold="none"),
 "Wide Grip Push Up": J("wide", wr_x=.46, floor_wr_x=True, hold="none"),
 "Archer Push Up": J("archer", start=dict(TOP), end=dict(t=-6, a=[150, 70], a2=[20, 20], l=[174, 174, 90]), wr_x=.5, floor_wr_x=True, hold="none", **FREE),
 "Nordic Curl": J(None, no_foot_floor=True, hand_anchor=True, start=dict(t=-90, a=[60, -100], l=[90, 180, 0], at=['kn', 120, 178]), end=dict(t=-18, a=[60, -100], l=[162, 180, 0], at=['kn', 120, 178]), hold="none", az=[60, 90], props=[dict(k="box", s=(.5, .12, .18), p=(0, .44, .14), m="PAD")]),
 "Reverse Nordic": J(None, no_foot_floor=True, hand_anchor=True, start=dict(t=-90, a=[90, 90], l=[90, 180, 0], at=['kn', 120, 178]), end=dict(t=-128, a=[90, 90], l=[52, 180, 0], at=['kn', 120, 178]), hold="none", az=[60, 90], muscles="quads", prompt="reverse nordic curl"),
 "Glute Ham Raise": J(None, no_foot_floor=True, hand_anchor=True, start=dict(t=-6, a=[60, -100], l=[174, 180, 0], at=['kn', 120, 90]), end=dict(t=-85, a=[60, -100], l=[95, 180, 0], at=['kn', 120, 90]), hold="none", machine=[], scene=[], az=[60, 90], muscles="hams G", props=[dict(k="box", s=(.42, .4, .1), p=(0, -.18, 1.0), m="PAD"), dict(k="box", s=(.42, .1, .26), p=(0, .5, 1.13), m="PAD"), dict(k="box", s=(.08, .08, 1.0), p=(0, .1, .5), m="FRAME"), dict(k="box", s=(.6, .9, .04), p=(0, .1, .02), m="FRAME")]),
 "Hip Abduction Machine": J(None, keys=[dict(ax=0, ax2=0), dict(ax=.22, ax2=.22), dict(ax=0, ax2=0)], loop="cycle", ankle_free=True, muscles="G", az=[0, 20]),
 "Hip Adduction Machine": J(None, keys=[dict(ax=.22, ax2=.22), dict(ax=0, ax2=0), dict(ax=.22, ax2=.22)], loop="cycle", ankle_free=True, muscles="adductors", az=[0, 20]),
 "Side Plank": J(None, keys=[dict(view="front", ar=[92, 2], al=[92, 90], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], tilt=-3), dict(tilt=3), dict(tilt=-3)], world_rot=[0, 72, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="obliques abs_", still=True, **LOWSIDE),
 "Side Plank Rotation": J("rot", keys=[dict(view="front", ar=[92, 2], al=[-90, -90], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], twist=0), dict(al=[120, 160], twist=38), dict(al=[-90, -90], twist=0)], world_rot=[0, 72, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="obliques abs_", **LOWSIDE),
 "Side Plank Crunch": J("crunch", keys=[dict(view="front", ar=[92, 2], al=[-110, 160], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], sbend=0), dict(ll=[40, 130], sbend=-22), dict(ll=[92, 92], sbend=0)], world_rot=[0, 72, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="obliques abs_", **LOWSIDE),
 "Copenhagen Plank": J(None, keys=[dict(view="front", ar=[92, 2], al=[60, 40], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], tilt=-2), dict(tilt=2), dict(tilt=-2)], world_rot=[0, 80, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", muscles="adductors obliques", still=True, props=[dict(k="box", s=(.42, .9, .42), p=(0, 0, .21), m="PAD")], **LOWSIDE),
 "Bicycle Crunch": J("cycle", keys=[dict(t=196, a=[-130, 160], l=[-10, -10, 0], l2=[-80, 10, 0], at=['hip', 116, 176], pz=.13, twist=24), dict(l=[-80, 10, 0], l2=[-10, -10, 0], twist=-24), dict(l=[-10, -10, 0], l2=[-80, 10, 0], twist=24)], loop="cycle", muscles="abs_ obliques", hold="none", no_foot_floor=True, az=[60, 30]),
 "Elbow to Knee": J("cycle", keys=[dict(t=196, a=[-130, 160], l=[-10, -10, 0], l2=[-80, 10, 0], at=['hip', 116, 176], pz=.13, twist=24), dict(l=[-80, 10, 0], l2=[-10, -10, 0], twist=-24), dict(l=[-10, -10, 0], l2=[-80, 10, 0], twist=24)], loop="cycle", muscles="abs_ obliques", hold="none", no_foot_floor=True, az=[60, 30]),
 "Decline Sit Up": J("bench", start=dict(t=170, a=[-130, 160]), end=dict(t=-80, a=[-110, 170]), no_foot_floor=True, bench_top=.55, muscles="abs_"),
 "Decline Crunch": J("crunch", start=dict(t=170, a=[-130, 160]), end=dict(t=212, a=[-110, 170]), no_foot_floor=True, bench_top=.55, muscles="abs_"),
 "Barbell Rollout": J(None, keys=[dict(t=-30, a=[60, 60], l=[120, 180, 0], at=['kn', 92, 180]), dict(t=-8, a=[14, 14], l=[150, 180, 0]), dict(t=-30, a=[60, 60], l=[120, 180, 0])], loop="cycle", hold="wr", no_foot_floor=True, hand_anchor=True, muscles="abs_ lats"),
 "Ab Wheel Rollout": J(None, keys=[dict(t=-30, a=[60, 60], l=[120, 180, 0], at=['kn', 92, 180]), dict(t=-8, a=[14, 14], l=[150, 180, 0]), dict(t=-30, a=[60, 60], l=[120, 180, 0])], loop="cycle", hold="none", no_foot_floor=True, hand_anchor=True, closed_hands=True, grip_w=.1, props=[dict(k="cyl", r=.09, l=.08, at="gm", axis="X", m="RUBBER", off=(0, 0, -.02)), dict(k="link", a="gl", b="gr", r=.014, m="STEEL")], muscles="abs_ lats"),
 "Mountain Climber": J(None, keys=[dict(TOPP, l2=[60, 120, 90]), dict(l=[60, 120, 90], l2=[168, 168, 90]), dict(l=[168, 168, 90], l2=[60, 120, 90])], loop="cycle", hold="none", no_foot_floor=True, feet_lock=False, muscles="abs_ quads", az=[60, 90]),
 "Single-arm Lat Pulldown": J("onearm", start=dict(al=[92, 92]), end=dict(al=[92, 92]), muscles="lats biceps", az=[60, 30]),
 "JM Press": J("jm", end=dict(a=[-40, 150]), az=[50, 70]),
 "Smith JM Press": J("jm", end=dict(a=[-40, 150]), az=[50, 70]),
 "Hip Thrust (Machine)": J("pad", hold="none", machine=[dict(k="pad", a="hip", b="hip", w=14)], closed_hands=True),
 "Single-arm Chest Press Machine": J("onearm", end=dict(a2=[100, 60]), start=dict(a2=[100, 60])),
 "Handstand Push Up": J(None, no_foot_floor=True, az=[60, 90], props=[tall_wall(.28)], scene=[]),
 "Wall Walk": J("wall", keys=[dict(TOP, at=['wr', 160, 181]), dict(t=20, a=[100, 96], l=[140, 150, 110], at=['wr', 100, 181]), dict(t=60, a=[96, 92], l=[-160, -160, 0], at=['wr', 64, 181]), dict(t=88, a=[92, 90], l=[-100, -100, 0], at=['wr', 44, 181]), dict(t=60, a=[96, 92], l=[-160, -160, 0], at=['wr', 64, 181]), dict(t=20, a=[100, 96], l=[140, 150, 110], at=['wr', 100, 181]), dict(TOP, at=['wr', 160, 181])], nf=49, loop="cycle", thumb=.5, no_foot_floor=True, hold="none", muscles="front_delt side_delt abs_", props=[tall_wall(1.22)], az=[60, 90]),
 "Waiter Curl": J("waiter", grip="under", wr_x=.04, start=dict(a=[90, 86]), end=dict(a=[84, -64]), az=[35, 60]),
 "Wrist Roller": J(None, keys=[dict(a=[0, 0]), dict(a=[0, -10]), dict(a=[0, 0])], loop="cycle", closed_hands=True, grip_w=.15, still=True, props=[dict(k="link", a="gl", b="gr", r=.018, m="DARK"), dict(k="link", a="gm", b=(0, -.6, .55), r=.004, m="ACC"), dict(k="cyl", r=.1, l=.03, p=(0, -.6, .48), axis="X", m="RUBBER")], muscles="forearms", az=[35, 60]),
 "Pistol Squat": J(None, muscles="quads G", **FREE),
 "Skater Squat": J("skater", start=dict(t=-90, a=[0, 0], l=[90, 90, 0], l2=[110, 160, 30]), end=dict(t=-48, a=[-4, -4], l=SQ, l2=[120, 180, 30]), muscles="quads G", **FREE),
 "Shrimp Squat": J("shrimp", start=dict(t=-90, a=[0, 0], l=[90, 90, 0], l2=[100, 240, 30]), end=dict(t=-48, a=[-4, -4], l=SQ, l2=[130, 250, 30]), muscles="quads G", **FREE),
 "Curtsy Lunge": J("curtsy", keys=[S(l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-86, l=[20, 100, 0], l2=[118, 160, 30], ax2=-.34), S(l=[90, 90, 0], l2=[90, 90, 0], ax2=0)], loop="cycle", az=[0, 25]),
 "Dumbbell Curtsy Lunge": J("curtsy", keys=[S(l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-86, l=[20, 100, 0], l2=[118, 160, 30], ax2=-.34), S(l=[90, 90, 0], l2=[90, 90, 0], ax2=0)], loop="cycle", az=[0, 25]),
 "Smith Curtsy Lunge": J("curtsy", keys=[S(a=[118, -66], l=[90, 90, 0], l2=[90, 90, 0]), dict(t=-86, l=[20, 100, 0], l2=[118, 160, 30], ax2=-.34), S(a=[118, -66], l=[90, 90, 0], l2=[90, 90, 0], ax2=0)], loop="cycle", az=[0, 25]),
 "Fire Hydrant": J(None, keys=[dict(t=-2, a=[90, 90], l=[90, 178, 180], l2=[90, 178, 180], at=['wr', 168, 181], pz=.5, kp=[0, 1, -1], ank=[.14, .36, .1]), dict(kp=[1, .1, .1], ank=[.5, .32, .36]), dict(kp=[0, 1, -1], ank=[.14, .36, .1])], loop="cycle", no_foot_floor=True, hold="none", muscles="G", az=[150, 120], el=[20, 30]),
 "Clamshell": J(None, keys=[dict(view="front", ar=[92, 2], al=[100, 96], lr=[92, 92], ll=[92, 92], at=['hip', 120, 106], ank=[.12, 0, .3], ank2=[-.12, 0, .3], kp=[.1, -1, .3], kp2=[.1, -1, .3]), dict(kp=[.9, -.5, .2]), dict(kp=[.1, -1, .3])], world_rot=[0, 90, 0], loop="cycle", no_foot_floor=True, ankle_free=True, hold="none", props=BANDKN, muscles="G", **LOWSIDE),
 "Frog Pump": J(None, **bridge(dict(t=176, a=[100, 0], l=[-36, 84, 0], at=['hip', 120, 176], pz=.13, ank=[.2, -.35, .1], ank2=[-.2, -.35, .1], kp=[.8, -.3, .6], kp2=[.8, -.3, .6]), dict(t=145, pz=.33)), grip="neutral", wr_x=.05),
 "Hamstring Bridge": J("ham", **bridge(dict(t=178, a=[100, 0], l=[-16, 42, 40], at=['hip', 120, 176], pz=.13, ank=[.13, -.72, .1], ank2=[-.13, -.72, .1]), dict(t=158, pz=.3)), muscles="hams G"),
 "Sliding Leg Curl": J("slide", **bridge(dict(t=176, a=[100, 0], l=[-6, 0, 30], at=['hip', 120, 176], pz=.13, ank=[.13, -.82, .1], ank2=[-.13, -.82, .1]), dict(t=150, pz=.33, ank=[.13, -.45, .1], ank2=[-.13, -.45, .1])), muscles="hams G"),
 "Stability Ball Leg Curl": J("ball", **bridge(dict(t=165, a=[100, 0], l=[-15, -15, 30], at=['hip', 120, 150], pz=.19, ank=[.1, -.82, .42], ank2=[-.1, -.82, .42]), dict(t=150, pz=.33, ank=[.1, -.55, .47], ank2=[-.1, -.55, .47])), props=[dict(k="sph", r=.2, at="an", off=(-.1, -.04, -.2), m="PAD")], muscles="hams G"),
 "Exercise Ball Crunch": J("ball", keys=[dict(t=190, a=[-130, 160], l=[30, 110, 0], at=['hip', 120, 120], pz=.72, ank=[.14, -.62, .1], ank2=[-.14, -.62, .1]), dict(t=215, pz=.72), dict(t=190, pz=.72)], loop="cycle", no_foot_floor=True, hold="none", props=[dict(k="sph", r=.32, p=(0, .15, .32), m="PAD")], muscles="abs_", az=[60, 90]),
 "Glute Kickback Machine": J("pad", start=dict(t=-4, a=[90, 90], l=[90, 178, 180], at=['wr', 168, 181]), end=dict(t=-4, a=[90, 90], l=[176, 176, 90], l2=[90, 178, 180], at=['wr', 168, 181]), floor_clamp=True, no_foot_floor=True, hold="none", machine=[dict(k="pad", a=[140, 120], b=[180, 120], w=8)]),
 "Cable Hip Abduction": J(None, start=dict(ll=[90, 90]), end=dict(ll=[90, 90]), ankle_free=True, no_foot_floor=True, muscles="G", az=[150, 170]),
 "Band Hip Abduction": J(None, start=dict(ll=[90, 90]), end=dict(ll=[90, 90]), ankle_free=True, no_foot_floor=True, muscles="G", az=[150, 170]),
 "Cable Hip Adduction": J(None, start=dict(ll=[90, 90]), end=dict(ll=[90, 90]), ankle_free=True, no_foot_floor=True, muscles="adductors", az=[0, 20]),
 "Lateral Leg Raise": J(None, start=dict(ll=[92, 92]), end=dict(ll=[92, 92]), ankle_free=True, world_rot=[0, 90, 0], no_foot_floor=True, muscles="G", **LOWSIDE),
 "Lateral Band Walk": J("walk", keys=[dict(view="front", ar=[90, 90], lr=[80, 94], at=['hip', 120, 112], ax=.08, ax2=.08, dx=0), dict(ax=.26, ax2=.08, dx=.09), dict(ax=.08, ax2=.08, dx=0), dict(ax=.08, ax2=.26, dx=-.09), dict(ax=.08, ax2=.08, dx=0)], ankle_free=True, nf=49, loop="cycle", hold="none", props=[dict(k="link", a="kn", b="kn2", r=.012, m="band2")], muscles="G", az=[150, 170]),
 "Scissor Kick": J("scissor", keys=[dict(l=[-14, -14, 0], l2=[-14, -14, 0], ax=.18, ax2=-.1), dict(ax=-.1, ax2=.18), dict(ax=.18, ax2=-.1)], loop="cycle", muscles="abs_", no_foot_floor=True, az=[60, 30], el=[20, 9]),
 "Heel Tap": J("heeltap", keys=[dict(t=196, a=[100, 96], a2=[100, 96], l=[-40, 50, 0], at=['hip', 116, 176], pz=.13, sbend=0), dict(sbend=18), dict(sbend=0), dict(sbend=-18), dict(sbend=0)], loop="cycle", muscles="obliques abs_", az=[60, 90], no_hand_floor=True, no_foot_floor=True, hold="none"),
 "Side Crunch": J("side", keys=[dict(view="front", ar=[-110, -160], al=[92, 90], lr=[96, 80], ll=[100, 70], at=['hip', 120, 106], sbend=0), dict(sbend=-24), dict(sbend=0)], world_rot=[0, 90, 0], loop="cycle", hold="none", muscles="obliques abs_", no_foot_floor=True, ankle_free=True, **LOWSIDE),
 "Dragon Flag": J(None, start=dict(t=140, a=[170, 150], l=[-40, -40, 0], at=['sh', 150, 118]), end=dict(t=170, a=[170, 150], l=[-10, -10, 0], at=['sh', 150, 118]), no_foot_floor=True, hand_anchor=True, hold="none", closed_hands=True, az=[60, 30], muscles="abs_", scene=[dict(k="bench", a=[120, 128], b=[186, 128])]),
 "Parallel Bar Knee Raise": J("knee", start=dict(t=-90, a=[90, 0], l=[90, 92, 30], at=['el', 120, 76]), end=dict(t=-90, a=[90, 0], l=[-20, 90, 0], at=['el', 120, 76]), hand_anchor=True, no_foot_floor=True, hold="none", az=[35, 60], muscles="abs_", props=[dict(k="box", s=(.5, .08, .8), p=(0, .2, 1.2), m="PAD"), dict(k="box", s=(.14, .5, .08), p=(.26, -.1, 1.22), m="PAD"), dict(k="box", s=(.14, .5, .08), p=(-.26, -.1, 1.22), m="PAD"), dict(k="box", s=(.08, .08, 1.6), p=(.3, .25, .8), m="FRAME"), dict(k="box", s=(.08, .08, 1.6), p=(-.3, .25, .8), m="FRAME")]),
 "Parallel Bar Leg Raise": J("leg", start=dict(t=-90, a=[90, 0], l=[90, 92, 30], at=['el', 120, 76]), end=dict(t=-90, a=[90, 0], l=[-4, -4, 0], at=['el', 120, 76]), hand_anchor=True, no_foot_floor=True, hold="none", az=[35, 60], muscles="abs_", props=[dict(k="box", s=(.5, .08, .8), p=(0, .2, 1.2), m="PAD"), dict(k="box", s=(.14, .5, .08), p=(.26, -.1, 1.22), m="PAD"), dict(k="box", s=(.14, .5, .08), p=(-.26, -.1, 1.22), m="PAD"), dict(k="box", s=(.08, .08, 1.6), p=(.3, .25, .8), m="FRAME"), dict(k="box", s=(.08, .08, 1.6), p=(-.3, .25, .8), m="FRAME")]),
 "Pallof Press": J(None, start=dict(t=-90, a=[80, -150], l=[90, 90, 0], at=['an', 120, 181]), end=dict(t=-90, a=[0, 0], l=[90, 90, 0], at=['an', 120, 181]), no_cable=True, grip_w=.04, hold="none", closed_hands=True, muscles="obliques abs_", az=[35, 60], props=[dict(k="box", s=(.1, .1, 1.8), p=(1.25, -.3, .9), m="FRAME"), dict(k="box", s=(.5, .5, .04), p=(1.25, -.3, .02), m="FRAME"), dict(k="link", a="gm", b=(1.22, -.3, 1.15), r=.004, m="CABLE")]),
 "Band Pallof Press": J(None, start=dict(t=-90, a=[80, -150], l=[90, 90, 0], at=['an', 120, 181]), end=dict(t=-90, a=[0, 0], l=[90, 90, 0], at=['an', 120, 181]), band=dict(**{"from": "gm", "to": "gm"}), grip_w=.04, hold="none", closed_hands=True, muscles="obliques abs_", az=[35, 60], props=[dict(k="box", s=(.1, .1, 1.4), p=(1.25, -.3, .7), m="FRAME"), dict(k="box", s=(.5, .5, .04), p=(1.25, -.3, .02), m="FRAME"), dict(k="link", a="gm", b=(1.22, -.3, 1.15), r=.009, m="band2")]),
 "L-Sit Hold": J(None, keys=[dict(t=-90, a=[90, 90], l=[0, 0, 0], at=['hip', 120, 160], pz=.42), dict(t=-92), dict(t=-90)], loop="cycle", still=True, no_foot_floor=True, hold="none", closed_hands=True, wr_x=.26, az=[60, 90], muscles="abs_ quads", props=[dict(k="cyl", r=.018, l=.6, p=(.26, 0, .2), axis="Y", m="STEEL"), dict(k="cyl", r=.018, l=.6, p=(-.26, 0, .2), axis="Y", m="STEEL"), dict(k="box", s=(.04, .4, .2), p=(.26, 0, .1), m="FRAME"), dict(k="box", s=(.04, .4, .2), p=(-.26, 0, .1), m="FRAME")]),
 "High Knees": J(None, keys=HK, loop="cycle", no_foot_floor=True, hold="none", feet_lock=False, muscles="quads abs_", nf=49),
 "Front Lever Raise": J("raise", start=dict(t=-90, a=[-90, -90], l=[90, 120, 0], at=['wr', 124, 8]), end=dict(t=180, a=[-80, -80], l=[0, 0, 0], at=['wr', 124, 8]), no_foot_floor=True, scene=[dict(k="barF", y=8)], closed_hands=True, muscles="lats abs_"),
 "Climbing": J(None, keys=[dict(t=-96, a=[-70, -100], a2=[-20, -60], l=[20, 110, 0], l2=[80, 90, 0], at=['hip', 130, 110], wrw=[.2, -.3, 2.05], wrw2=[-.2, -.3, 1.6], ank=[.2, -.3, .4], ank2=[-.2, -.3, .75]), dict(a=[-20, -60], a2=[-70, -100], wrw=[.2, -.3, 1.6], wrw2=[-.2, -.3, 2.05], ank=[.2, -.3, .75], ank2=[-.2, -.3, .4]), dict(wrw=[.2, -.3, 2.05], wrw2=[-.2, -.3, 1.6], ank=[.2, -.3, .4], ank2=[-.2, -.3, .75])], loop="cycle", hold="none", no_foot_floor=True, closed_hands=True, scene=[], props=[dict(k="box", s=(1.3, .1, 2.6), p=(0, -.46, 1.3), m="DARK")]+[dict(k="sph", r=.05, p=p, m="RUBBER") for p in ((.2, -.4, 2.05), (-.2, -.4, 2.05), (.2, -.4, 1.6), (-.2, -.4, 1.6), (.2, -.4, .4), (-.2, -.4, .4), (.2, -.4, .75), (-.2, -.4, .75))], muscles="lats forearms quads", az=[150, 120]),
 "Walking": J(None, **tkd(A=20, B=16, elbow=16), loop="cycle", muscles="quads G calves"),
 "Hiking": J(None, **walk(T=-80, A=22, B=16, elbow=16), loop="cycle", hold="none", muscles="quads G calves", props=[dict(k="box", s=(.28, .14, .4), at="chest", off=(0, .15, -.05), m="DARK")]),
 "Running": J(None, **tkd(A=30, B=30, knee=80, elbow=78, T=-82, bounce=.05), loop="cycle", muscles="quads G calves"),
 "Treadmill Running": J(None, **tkd(A=28, B=30, knee=72, elbow=72, T=-82, bounce=.04), floor_z=.112, loop="cycle", scene=[], props=[dict(k="treadmill")], muscles="quads G calves", az=[60, 90]),
 "Sprint": J(None, **tkd(A=40, B=44, knee=95, elbow=90, T=-72, bounce=.06, foot=26, base=-8), loop="cycle", muscles="quads G hams calves"),
 "Skating": J(None, loop="cycle", keys=gait(T=-48, A=22, B=30, knee=20, elbow=10, base=-10), no_foot_floor=True, hold="none", muscles="G quads", scene=[]),
 "Outdoor Cycling": J(None, **{**BIKE, "props": [dict(k="cyl", r=.33, l=.04, p=(0, -.72, .33), axis="X", m="RUBBER"), dict(k="cyl", r=.33, l=.04, p=(0, .42, .33), axis="X", m="RUBBER"), dict(k="bike", crank=[-.32, .34], seat=[.02, .88], bar=[-.62, 1.08], fly=False)]}, scene=[]),
 "Skiing": J(None, keys=[dict(t=-60, a=[60, 100], l=[40, 120, 10], at=['hip', 120, 124], twist=0), dict(t=-56, a=[80, 110], l=[36, 124, 10], twist=8), dict(t=-60, a=[60, 100], l=[40, 120, 10], twist=0)], loop="cycle", hold="none", closed_hands=True, no_foot_floor=True, scene=[], props=[dict(k="box", s=(.09, 1.7, .025), p=(.16, -.15, .012), m="DARK"), dict(k="box", s=(.09, 1.7, .025), p=(-.16, -.15, .012), m="DARK"), dict(k="link", a="gl", b=(.34, -.2, .02), r=.008, m="STEEL"), dict(k="link", a="gr", b=(-.34, -.2, .02), r=.008, m="STEEL")], muscles="quads G", az=[60, 90]),
 "Snowboarding": J(None, keys=[dict(view="front", ar=[60, 60], lr=[70, 110], ll=[110, 70], at=['hip', 120, 128], pz=.72, ank=[.3, 0, .11], ank2=[-.3, 0, .11], tilt=0), dict(ar=[50, 70], tilt=5), dict(ar=[60, 60], tilt=0)], ankle_free=True, no_foot_floor=True, loop="cycle", hold="none", scene=[], props=[dict(k="box", s=(1.45, .28, .025), p=(0, 0, .02), m="DARK")], muscles="quads G", az=[0, 20], still=True),
 "Stretching": J(None, start=S(t=-90, a=[90, 90]), end=dict(t=60, a=[90, 90], l=[90, 90, 0], at=['an', 120, 181]), hold="none", muscles="hams", prompt="hamstring stretch", **FREE),
 "Cable Incline Fly": J("incline", lie=-55, no_foot_floor=True, az=[35, 60], el=[9, 20], bench_top=.5, start=dict(ar=[20, 156]), end=dict(ar=[-14, -4]), scene=[], no_cable=True, hold="none", closed_hands=True, props=XO(.25)),
 "Cable Lying Fly": J("lying", lie=-90, no_foot_floor=True, az=[35, 60, 90], el=[20, 9], start=dict(ar=[34, 152]), end=dict(ar=[-4, 6]), scene=[], no_cable=True, hold="none", closed_hands=True, props=XO(.2)),
 "Dumbbell Close Grip Press": J("close", wr_x=.05, hold="wr", az=[50, 70]),
 "Trap Bar Farmer's Walk": J("walk", **walk(arms=False, a=[90, 90], A=20), loop="cycle", muscles="forearms traps", az=[35, 60]),
 "Plate Pinch": J(None, keys=[dict(a=[90, 90]), dict(a=[90, 90], dz=0), dict(a=[90, 90])], loop="cycle", closed_hands=True, still=True, muscles="forearms", wr_x=.26, hold="none", props=[dict(k="cyl", r=.11, l=.03, at="gl", axis="X", m="RUBBER", off=(0, 0, -.1)), dict(k="cyl", r=.11, l=.03, at="gr", axis="X", m="RUBBER", off=(0, 0, -.1))]),
 "Safety Bar Squat": J("safety", start=dict(a=[70, -100]), end=dict(a=[60, -100]), hold="none", closed_hands=True, grip_w=.14, props=[dict(k="cyl", r=.018, l=1.5, at="neck", off=(0, .06, 0), axis="X", m="STEEL"), dict(k="cyl", r=.2, l=.05, at="neck", off=(.62, .06, 0), axis="X", m="DARK"), dict(k="cyl", r=.2, l=.05, at="neck", off=(-.62, .06, 0), axis="X", m="DARK"), dict(k="link", a="gl", b="sh", r=.012, m="STEEL"), dict(k="link", a="gr", b="sh2", r=.012, m="STEEL")], muscles="quads G"),
 "Landmine Squat": J("landmine", start=dict(a=[60, -112]), end=dict(a=[56, -112]), props=LM(), **LMK),
 "Landmine Reverse Lunge": J("landmine", start=dict(a=[60, -112]), end=dict(a=[56, -112]), props=LM(), **LMK),
 "Landmine Romanian Deadlift": J("landmine", props=LM(), **LMK),
 "Landmine Single Leg Romanian Deadlift": J("landmine1", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), props=LM(), **LMK, **FREE),
 "Landmine 180": J(None, keys=[dict(S(a=[30, 10]), twist=35, wrw=[.42, -.42, .95], wrw2=[.34, -.44, .95]), dict(twist=0, wrw=[.04, -.5, 1.35], wrw2=[-.04, -.5, 1.35]), dict(twist=-35, wrw=[-.34, -.44, .95], wrw2=[-.42, -.42, .95]), dict(twist=0, wrw=[.04, -.5, 1.35], wrw2=[-.04, -.5, 1.35]), dict(twist=35, wrw=[.42, -.42, .95], wrw2=[.34, -.44, .95])], loop="cycle", muscles="obliques abs_", nf=49, az=[35, 60], props=LM(), **LMK),
 "Landmine Lateral Raise": J("landmine", one_hand=True, props=LM(), **LMK),
 "Good Morning Smith": J("fixed", hold="sh", feet_lock=True, **FREE),
 "Smith Good Morning": J("fixed", hold="sh", feet_lock=True, **FREE),
 "Barbell Reverse Lunge": J("reverse", start=dict(t=-90, l=[90, 90, 0], l2=[90, 90, 0]), end=dict(), feet_lock="start", **FREE),
 "Smith Reverse Lunge": J("reverse", start=dict(t=-90, l=[90, 90, 0], l2=[90, 90, 0]), end=dict(), feet_lock="start", **FREE),
 "Single Leg Deadlift": J("single", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), hold="none", az=[120, 150], muscles="hams G", **FREE),
 "Dumbbell Single Leg Deadlift": J("single", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), az=[120, 150], muscles="hams G", **FREE),
 "Kettlebell Single Leg Deadlift": J("single", start=dict(l2=[90, 90, 0]), end=dict(l2=[176, 176, 90]), az=[120, 150], muscles="hams G", **FREE),
 "Barbell B-Stance Romanian Deadlift": J("bstance", start=dict(l2=[80, 100, 40]), end=dict(l2=[60, 110, 40]), **FREE),
 "Dumbbell B-Stance Romanian Deadlift": J("bstance", start=dict(l2=[80, 100, 40]), end=dict(l2=[60, 110, 40]), **FREE),
 "Bodyweight Triceps Extension": J("floor", start=dict(TOP, a=[90, 90]), end=dict(t=-20, a=[160, 10], l=[168, 168, 90]), hold="none", muscles="triceps", az=[60, 90], scene=[]),
 "One Arm Pull-up": J("onearm", start=dict(ar=[-66, -82], al=[60, 80], lr=[96, 100], at=['wr', 156, 10]), end=dict(ar=[34, -100], al=[60, 80], lr=[96, 110], at=['wr', 156, 10]), one_hand=True),
 "Scapular Push Up": J("scap", keys=[dict(TOP), dict(TOP, dz=-.035), dict(TOP)], hold="none", loop="cycle", muscles="front_delt midback", az=[60, 90]),
 "Dumbbell Sumo Deadlift": J("sumo", keys=[dict(view="front", ar=[92, 92], lr=[60, 96], ll=[120, 84], at=['hip', 120, 120], pz=.62, ank=[.34, 0, .1], ank2=[-.34, 0, .1], kp=[.5, -.8, 0], kp2=[.5, -.8, 0]), dict(pz=.92), dict(pz=.62)], loop="cycle", wr_x=.04, ankle_free=True, no_foot_floor=True, az=[35, 0], thumb=.5),
 "Lateral Step Up": J("lateral", keys=[dict(view="front", ar=[92, 92], lr=[60, 96], ll=[92, 90], at=['hip', 120, 118], pz=.84, ank=[.42, 0, .38], ank2=[-.16, 0, .1]), dict(pz=1.16, ank=[.42, 0, .38], ank2=[-.1, 0, .46]), dict(pz=.84, ank=[.42, 0, .38], ank2=[-.16, 0, .1])], loop="cycle", ankle_free=True, feet_lock=False, no_foot_floor=True, hold="none", scene=[], props=[dict(k="box", s=(.5, .45, .28), p=(.42, 0, .14), m="PAD")], az=[0, 20]),
 "Snatch Pull": J("snatch", grip_w=.52, start=dict(DL), end=dict(t=-92, a=[92, 90], l=[90, 90, 25]), az=[35, 60], **FREE),
 "Clean Pull": J("clean", start=dict(DL), end=dict(t=-90, a=[92, 90], l=[90, 90, 25]), az=[35, 60], **FREE),
 "Deadlift High Pull": J("dl", start=dict(DL), end=dict(t=-90, a=[186, -30], l=[90, 90, 25]), az=[35, 60], **FREE),
 "Kettlebell High Pull": J("kb", start=dict(HANG), end=dict(t=-90, a=[186, -30], l=[90, 90, 25]), muscles="side_delt traps G", **FREE),
 "Machine Neck Extension": J(None, keys=[S(t=-84, a=[92, 88], l=[0, 90, 0], at=['hip', 100, 140], nk=25), dict(nk=-25), dict(nk=25)], loop="cycle", muscles="traps", scene=[dict(k="bench", a=[78, 150], b=[128, 150])], hold="none", props=[dict(k="box", s=(.26, .06, .3), at="head", off=(0, -.14, 0), m="PAD"), dict(k="box", s=(.08, .08, 1.5), p=(0, -.6, .75), m="FRAME")]),
 "Lying Neck Side Raise": J("side", keys=[dict(t=180, a=[10, 0], l=[0, 0, -80], at=['hip', 160, 120], nky=0), dict(nky=-32), dict(nky=0)], loop="cycle", no_foot_floor=True, muscles="traps", az=[60, 90], el=[20, 9]),
 "Plank Hip Dip": J("hipdip", keys=[dict(twist=0, dz=.04), dict(twist=14), dict(twist=0), dict(twist=-14), dict(twist=0)], loop="cycle", muscles="obliques abs_"),
 "45 Degree Side Bend": J("roman", world_rot=[0, 45, 0], start=dict(tilt=-6), end=dict(tilt=24), no_foot_floor=True, ankle_free=True, muscles="obliques", az=[0, 20], props=[dict(k="box", s=(.5, .3, .08), p=(0, 0, .04), m="FRAME")]),
 "Dumbbell Woodchop": J("db", keys=[dict(S(a=[20, 20]), twist=30, wrw=[.38, -.34, 1.55], wrw2=[.3, -.34, 1.55]), dict(twist=-30, wrw=[-.3, -.3, .6], wrw2=[-.38, -.3, .6]), dict(twist=30, wrw=[.38, -.34, 1.55], wrw2=[.3, -.34, 1.55])], loop="cycle", muscles="obliques abs_", az=[0, 25], grip="nfront"),
 "Cable Side Crunch": J("side", keys=[dict(view="front", ar=[-60, -140], lr=[95, 90], at=['hip', 120, 106], sbend=0), dict(sbend=24), dict(sbend=0)], loop="cycle", hold="wr", muscles="obliques abs_", az=[0, 20], cable=dict(**{"from": [216, 20], "col": 222})),
 "Planche": J(None, keys=[dict(t=-3, a=[122, 122], l=[178, 178, 180], at=['wr', 134, 181]), dict(t=-2), dict(t=-3)], loop="cycle", still=True, no_foot_floor=True, hold="none", floor_clamp=True, muscles="front_delt abs_", az=[60, 90]),
 "Planche Push Up": J(None, start=dict(t=-3, a=[122, 122], l=[178, 178, 180], at=['wr', 134, 181]), end=dict(t=-1, a=[166, 62], l=[178, 178, 180], at=['wr', 134, 181]), no_foot_floor=True, hold="none", floor_clamp=True, muscles="front_delt chest", az=[60, 90]),
 "Korean Dip": J(None, start=dict(t=-84, a=[112, 112], l=[100, 140, 30], at=['wr', 100, 86]), end=dict(t=-76, a=[178, 70], l=[100, 140, 30], at=['wr', 100, 86]), no_foot_floor=True, hand_anchor=True, hold="none", closed_hands=True, wr_x=.22, scene=[], az=[60, 90], props=[dict(k="cyl", r=.018, l=1.2, p=(0, .226, 1.15), axis="X", m="STEEL"), dict(k="box", s=(.06, .06, 1.15), p=(.58, .226, .575), m="FRAME"), dict(k="box", s=(.06, .06, 1.15), p=(-.58, .226, .575), m="FRAME")]),
 "Kipping Pull Up": J("kip", keys=[dict(view="side", t=-98, a=[-90, -90], l=[120, 150, 30], at=['wr', 124, 6]), dict(t=-82, a=[-80, -86], l=[60, 110, 20]), dict(t=-92, a=[-30, -110], l=[80, 110, 20]), dict(t=-98, a=[-90, -90], l=[120, 150, 30])], nf=49, loop="cycle", thumb=.65, scene=[dict(k="barF", y=6)], az=[35, 60], muscles="lats abs_", hold="none"),
 "Shoulder Taps": J("tap", keys=[dict(TOP, pz=.56), dict(a2=[20, -150], twist=-8), dict(a2=[90, 90], twist=0), dict(a=[20, -150], twist=8), dict(a=[90, 90], twist=0)], loop="cycle", nf=49, hold="none", no_foot_floor=True, muscles="abs_ front_delt", az=[60, 90]),
 "Arnold Press": J("arnold", keys=[dict(a=[70, -85]), dict(a=[60, -92]), dict(a=[-86, -90]), dict(a=[60, -92]), dict(a=[70, -85])], grip="under", wr_x=.17, loop="cycle", nf=49, thumb=.5),
 "Wall Ball": J(None, keys=[dict(t=-66, a=[56, -112], l=SQ, at=['an', 120, 181], bp=[0, -.3, .9]), dict(t=-90, a=[-40, -100], l=[90, 90, 0], bp=[0, -.42, 1.5]), dict(t=-90, a=[-80, -80], l=[90, 90, 20], bp=[0, -.8, 2.2]), dict(t=-90, a=[-60, -110], l=[80, 96, 0], bp=[0, -.42, 1.6]), dict(t=-66, a=[56, -112], l=SQ, bp=[0, -.3, .9])], nf=49, loop="cycle", hold="none", closed_hands=True, grip_w=.13, props=[dict(k="sph", r=.14, at="bp", m="RUBBER"), tall_wall(-1.0, .9, 2.5)], muscles="quads G front_delt", thumb=.5, az=[60, 90]),
 "Burpee Box Jump": J("box", keys=burpee(False)+[dict(t=-56, a=[150, 150], l=SQ, at=['an', 120, 181]), dict(t=-70, a=[10, 10], l=[30, 104, 0], at=['an', 214, 134]), S(a=[90, 90], at=['an', 214, 134]), S(a=[90, 90], at=['an', 120, 181])], props=[dict(k="box", s=(.6, .6, .52), p=(0, -1.07, .26), m="PAD")], **BUR),
 "Dumbbell Cuban Press": J("cuban", keys=[S(a=[92, 90]), dict(a=[160, 80]), dict(a=[160, -60]), dict(a=[-86, -90]), dict(a=[160, -60]), dict(a=[160, 80]), dict(a=[92, 90])], wr_x=.3, loop="cycle", nf=49, thumb=.5, muscles="rear_delt side_delt"),
 "Single Leg Hip Thrust": J("single", start=dict(l=[-26, 96, 0], l2=[-70, 20, 0]), end=dict(l=[0, 90, 0], l2=[-10, 0, 0]), az=[35, 60]),
 "Dumbbell Single Leg Hip Thrust": J("single", start=dict(l=[-26, 96, 0], l2=[-70, 20, 0]), end=dict(l=[0, 90, 0], l2=[-10, 0, 0]), az=[35, 60]),
})
# ── 2차 검수 뒤 고침 ──
def XOW(z): return [dict(k="box", s=(.08, .08, 2.2), p=(1.05, 0, 1.1), m="FRAME", world=1), dict(k="box", s=(.08, .08, 2.2), p=(-1.05, 0, 1.1), m="FRAME", world=1), dict(k="link", a="gl", b=dict(w=[1.05, 0, z]), r=.004, m="CABLE"), dict(k="link", a="gr", b=dict(w=[-1.05, 0, z]), r=.004, m="CABLE")]
M.update({
 "Mountain Climber": J(None, keys=[dict(TOPP, l2=[50, 170, 120]), dict(l=[50, 170, 120], l2=[168, 168, 90]), dict(l=[168, 168, 90], l2=[50, 170, 120])], loop="cycle", hold="none", no_foot_floor=True, feet_lock=False, muscles="abs_ quads", az=[60, 90]),
 "Fire Hydrant": J(None, keys=[dict(view="side", t=-2, a=[90, 90], l=[90, 178, 180], l2=[90, 178, 180], at=['wr', 168, 181], pz=.5, kp=[0, 1, -1], ank=[.14, .36, .1], ank2=[-.14, .36, .1]), dict(kp=[1, .1, .1], ank=[.5, .32, .36]), dict(kp=[0, 1, -1], ank=[.14, .36, .1])], loop="cycle", no_foot_floor=True, hold="none", muscles="G", az=[150, 120], el=[20, 30]),
 "Frog Pump": J(None, **bridge(dict(t=176, a=[100, 0], l=[-36, 84, 0], at=['hip', 120, 176], pz=.13, ank=[.2, -.35, .1], ank2=[-.2, -.35, .1], kp=[.8, -.3, .6], kp2=[.8, -.3, .6]), dict(t=145, pz=.33)), grip="neutral", wr_x=.05, **{}),
 "Dragon Flag": J(None, start=dict(t=140, a=[170, 150], l=[-40, -40, 0], at=['sh', 150, 141]), end=dict(t=170, a=[170, 150], l=[-10, -10, 0], at=['sh', 150, 141]), no_foot_floor=True, hand_anchor=True, hold="none", closed_hands=True, az=[60, 30], muscles="abs_", scene=[dict(k="bench", a=[120, 150], b=[186, 150])]),
 "Pallof Press": J(None, start=dict(t=-90, a=[80, -150], l=[90, 90, 0], at=['an', 120, 181]), end=dict(t=-90, a=[0, 0], l=[90, 90, 0], at=['an', 120, 181]), no_cable=True, grip_w=.04, hold="none", closed_hands=True, muscles="obliques abs_", az=[35, 60], props=[dict(k="box", s=(.1, .1, 1.5), p=(.95, -.3, .75), m="FRAME"), dict(k="box", s=(.5, .5, .04), p=(.95, -.3, .02), m="FRAME"), dict(k="link", a="gm", b=(.92, -.3, 1.15), r=.004, m="CABLE")]),
 "Band Pallof Press": J(None, start=dict(t=-90, a=[80, -150], l=[90, 90, 0], at=['an', 120, 181]), end=dict(t=-90, a=[0, 0], l=[90, 90, 0], at=['an', 120, 181]), no_cable=True, grip_w=.04, hold="none", closed_hands=True, muscles="obliques abs_", az=[35, 60], props=[dict(k="box", s=(.1, .1, 1.3), p=(.95, -.3, .65), m="FRAME"), dict(k="box", s=(.5, .5, .04), p=(.95, -.3, .02), m="FRAME"), dict(k="link", a="gm", b=(.92, -.3, 1.15), r=.009, m="band2")]),
 "Cable Incline Fly": J("incline", lie=-55, no_foot_floor=True, az=[35, 60], el=[9, 20], bench_top=.5, start=dict(ar=[20, 156]), end=dict(ar=[-14, -4]), scene=[], no_cable=True, hold="none", closed_hands=True, props=XOW(.25)),
 "Cable Lying Fly": J("lying", lie=-90, no_foot_floor=True, az=[35, 60, 90], el=[20, 9], start=dict(ar=[34, 152]), end=dict(ar=[-4, 6]), scene=[], no_cable=True, hold="none", closed_hands=True, props=XOW(.2)),
 "Stability Ball Leg Curl": J("ball", **bridge(dict(t=165, a=[100, 0], l=[-15, -15, 30], at=['hip', 120, 150], pz=.19, ank=[.1, -.82, .46], ank2=[-.1, -.82, .46]), dict(t=150, pz=.33, ank=[.1, -.55, .46], ank2=[-.1, -.55, .46])), props=[dict(k="sph", r=.22, at="an", off=(-.1, -.04, -.24), m="PAD")], muscles="hams G"),
 "Bodyweight Triceps Extension": J("floor", start=dict(TOP, a=[90, 90]), end=dict(t=-6, a=[40, 128], l=[172, 172, 90]), hold="none", muscles="triceps", az=[60, 90], scene=[]),
 "One Arm Pull-up": J("onearm", keys=[dict(view="front", ar=[-66, -82], al=[60, 80], lr=[96, 100], at=['hip', 120, 100], pz=.9, wrw=[.1, -.02, 2.0]), dict(pz=1.28), dict(pz=.9)], loop="cycle", thumb=.5, one_hand=True, no_foot_floor=True),
 "Dumbbell Cuban Press": J("cuban", keys=[S(a=[92, 90]), dict(a=[160, 80]), dict(a=[160, -60]), dict(a=[-86, -90]), dict(a=[160, -60]), dict(a=[160, 80]), dict(a=[92, 90])], hold="wr", wr_x=.3, loop="cycle", nf=49, thumb=.5, muscles="rear_delt side_delt"),
 "Landmine Lateral Raise": J("landmine", start=dict(al=[92, 92]), end=dict(al=[92, 92]), props=[dict(k="link", a="gl", b=(0, -1.55, .03), r=.018, m="STEEL"), dict(k="box", s=(.12, .12, .08), p=(0, -1.55, .04), m="DARK")], **LMK),
})
# ── 3차 검수 뒤 고침 ──
M.update({
 "Fire Hydrant": J(None, keys=[dict(view="side", t=-2, a=[90, 90], l=[90, 178, 180], l2=[90, 178, 180], at=['wr', 168, 181], pz=.5, kp=[.05, -.8, -.6], kp2=[-.05, -.8, -.6], ank=[.14, .45, .08], ank2=[-.14, .45, .08]), dict(kp=[1, -.2, 0], ank=[.58, .38, .42]), dict(kp=[.05, -.8, -.6], ank=[.14, .45, .08])], loop="cycle", no_foot_floor=True, hold="none", muscles="G", az=[150, 120], el=[20, 30]),
 "Stability Ball Leg Curl": J("ball", **bridge(dict(t=165, a=[100, 0], l=[-15, -15, 30], at=['hip', 120, 150], pz=.19, ank=[.1, -.82, .46], ank2=[-.1, -.82, .46]), dict(t=150, pz=.33, ank=[.1, -.55, .46], ank2=[-.1, -.55, .46])), props=[dict(k="sph", r=.22, at="an", off=(-.1, -.04, -.24), z=.22, m="PAD")], muscles="hams G"),
 "Bodyweight Triceps Extension": J("floor", start=dict(TOP, a=[90, 90]), end=dict(t=-6, a=[100, 20], l=[163, 163, 90], at=['wr', 160, 181]), hold="none", muscles="triceps", az=[60, 90], scene=[]),
 "One Arm Pull-up": J("onearm", start=dict(view="front", ar=[-66, -82], al=[60, 80], lr=[96, 100], at=['wr', 156, 6]), end=dict(view="front", ar=[34, -100], al=[60, 80], lr=[96, 110], at=['wr', 156, 6]), one_hand=True, no_foot_floor=True, thumb=1),
 "Dumbbell Cuban Press": J("cuban", keys=[dict(view="front", ar=[90, 90], al=[90, 90]), dict(ar=[5, 85], al=[5, 85]), dict(ar=[5, -85], al=[5, -85]), dict(ar=[-78, -85], al=[-78, -85]), dict(ar=[5, -85], al=[5, -85]), dict(ar=[5, 85], al=[5, 85]), dict(ar=[90, 90], al=[90, 90])], hold="wr", loop="cycle", nf=49, thumb=.5, muscles="rear_delt side_delt"),
})
# ── 사전 점검(불량 25개) 뒤 고침 ──
def _p(name, **ov):
    assert name in M and "ov" in M[name], name
    M[name]["ov"].update(ov)
def _top(name, t, pz=None):
    assert name in M and "ov" in M[name], name
    k_ = M[name]["ov"]["keys"][1]; k_["t"] = t
    if pz is not None: k_["pz"] = pz
for _n in ("Frog Pump", "Stability Ball Leg Curl", "Sliding Leg Curl"): _top(_n, 158)
_top("Hamstring Bridge", 162)
for _n in ("Clamshell", "Lateral Leg Raise"): _p(_n, az=[150, 180])
for _n in ("Clean Pull", "Deadlift High Pull", "Snatch Pull"): _p(_n, muscles="quads traps")
_p("Dumbbell Jefferson Curl", az=[150, 120])
_p("Jump Rope", still=True)
_p("Cable Cross Triceps Extension", az=[150, 130])
_p("Stretching", az=[120, 150])
_p("Landmine Reverse Lunge", free_contact=True)
M["Lateral Box Jump"]["ov"]["keys"][2]["at"] = ['hip', 150, 86]
M["Lateral Box Jump"]["ov"]["keys"][3]["at"] = ['hip', 150, 70]
M["Dumbbell Sumo Deadlift"] = J(None, keys=[dict(view="front", ar=[92, 92], lr=[60, 96], ll=[120, 84], at=['hip', 120, 128], ank=[.34, 0, .1], ank2=[-.34, 0, .1], kp=[.5, -.8, 0], kp2=[.5, -.8, 0]), dict(at=['hip', 120, 94]), dict(at=['hip', 120, 128])], wr_x=.04, ankle_free=True, no_foot_floor=True, az=[35, 60], muscles="quads G", loop="cycle")
# ── 사전 점검 2차: 들린 몸·파묻힘 ──
_p("Clamshell", floor_gap=-.2, **LOWSIDE)
_SLR = M["Lateral Leg Raise"]["ov"]
_p("Lateral Leg Raise", start=dict(lr=[92, 92], ll=[92, 92]), end=dict(lr=[92, 92], ll=[45, 45]))
for _n, _lo, _hi in (("Frog Pump", {}, dict(t=152, pz=.42, nk=25)), ("Stability Ball Leg Curl", dict(t=172, pz=.26), dict(t=152, pz=.42, nk=25)), ("Hamstring Bridge", {}, dict(t=152, pz=.42, nk=25)), ("Sliding Leg Curl", {}, dict(t=152, pz=.42, nk=25))):
    _k = M[_n]["ov"]["keys"]; _k[0] = dict(_k[0], **_lo); _k[2] = dict(_k[2], **_lo); _k[1] = dict(_k[1], **_hi)
_p("Stability Ball Leg Curl", az=[85, 85])
for _n, _l in (("Hamstring Bridge", [-16, 42, 0]), ("Sliding Leg Curl", [-6, 0, 0])):
    _k = M[_n]["ov"]["keys"]; _up = dict(l=_l, kp=[0, -.2, 1], kp2=[0, -.2, 1]); _k[0] = dict(_k[0], **_up); _k[2] = dict(_k[2], **_up)
M["Lateral Box Jump"]["ov"]["keys"][0]["at"] = ['hip', 78, 136]
M["Lateral Box Jump"]["ov"]["keys"][5]["at"] = ['hip', 78, 136]
# 파묻힘 원인은 바닥을 뚫는 팔꿈치 — 팔을 몸 옆 바닥에 둔다
for _n in ("Frog Pump", "Stability Ball Leg Curl", "Hamstring Bridge", "Sliding Leg Curl"):
    _k = M[_n]["ov"]["keys"]
    _k[0] = dict(_k[0], a=[2, 0]); _k[2] = dict(_k[2], a=[2, 0]); _k[1] = dict(_k[1], a=[14, 0], t=155, pz=.36, nk=25)
_p("Lateral Leg Raise", start=dict(lr=[92, 92], ll=[92, 92]), end=dict(lr=[92, 92], ll=[135, 135]))
# 합성 판정 뒤 수정: keys 는 앞 키를 상속하므로 되돌릴 값은 명시한다(dz·wrw 가 안 돌아와 고리 끝에서 튀었다)
M["Clap Push Up"]["ov"]["keys"] = [dict(BOT, dz=0), dict(TOP, dz=0), dict(TOP, dz=.14, wrw=[.03, -.5, .4], wrw2=[-.03, -.5, .4]), dict(TOP, dz=0, wrw=None, wrw2=None), dict(BOT, dz=0, wrw=None, wrw2=None)]
M["Scapular Push Up"]["ov"]["keys"] = [dict(TOP, dz=0), dict(TOP, dz=-.035), dict(TOP, dz=0)]
# 드는 손이 기준점이면 몸 전체가 끌려간다: 발을 기준으로
for _k in M["Shoulder Taps"]["ov"]["keys"]: _k["at"] = ['an', 120, 181]
# 상자·발 겹침
_k = M["Lateral Box Jump"]["ov"]["keys"]
for _i in (0, 5): _k[_i] = dict(_k[_i], lr=[40, 100], at=['hip', 66, 130])
_p("Poliquin Step Up", start=dict(l=[6, 92, 0], l2=[90, 90, 0]), end=dict(l=[90, 90, 0], l2=[90, 90, 0]))
_p("Wide Grip Push Up", wr_x=.40)
# 목 운동은 움직임이 너무 작아 보이지 않았다
_k = M["Lying Neck Curl"]["ov"]["keys"]; _k[0] = dict(_k[0], nk=-45); _k[1] = dict(_k[1], nk=45); _k[2] = dict(_k[2], nk=-45)
_k = M["Lying Neck Side Raise"]["ov"]["keys"]; _k[1] = dict(_k[1], nky=-48)
# 스모 루마니안: 기본 자세 그대로(빈 start·end 를 뺀다)
M["Barbell Sumo Romanian Deadlift"]["ov"].pop("start", None); M["Barbell Sumo Romanian Deadlift"]["ov"].pop("end", None)
# 코드 리뷰 반영: 벡터는 구간 양 끝 키에 다 있어야 적용된다. 박수 앞뒤 키에 바닥 손목 좌표(시험 렌더로 잰 값)를 준다
_w = dict(wrw=[.297, -.452, .065], wrw2=[-.297, -.452, .065])
M["Clap Push Up"]["ov"]["keys"][1] = dict(TOP, dz=0, **_w); M["Clap Push Up"]["ov"]["keys"][3] = dict(TOP, dz=0, **_w)
for _n in ("Frog Pump", "Stability Ball Leg Curl", "Hamstring Bridge", "Sliding Leg Curl"): M[_n]["ov"]["keys"][2] = dict(M[_n]["ov"]["keys"][2], nk=0)   # 고개가 고리 끝에서 튀지 않게
_k = M["Climbing"]["ov"]["keys"]; _k[-1] = dict(_k[-1], a=_k[0]["a"], a2=_k[0]["a2"])
M.pop("Good Morning Smith", None)
if __name__ == "__main__":
    print(len(M))
