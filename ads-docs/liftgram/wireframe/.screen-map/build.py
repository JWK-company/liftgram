import json,os,re,subprocess
SP=os.path.dirname(os.path.abspath(__file__))
exec(open(SP+'/data.py',encoding='utf8').read())
# 보강
MJ='src/mobile/android/app/src/main/java/org/tarae/liftgram/'
E[:]=[x for x in E if not (x['a']=='x.nat' and x['b']=='/workout')]
for x in E:
    if x['a']=='a.lock' and x['b']=='/workout': x['ev']=MJ+'LockWorkoutActivity.java:1082'
    if x['a']=='a.fs': x['ev']=MJ+'LockScreenGate.java:307'
e('/forgot','/terms','화면 바닥 약관','C/auth/AuthPage.tsx:26'); e('/forgot','/privacy','화면 바닥 처리방침','C/auth/AuthPage.tsx:29'); e('/forgot','/','로고','C/auth/AuthPage.tsx:10'); e('/account','/','로고','C/profile/AuthClient.tsx:444')
files=subprocess.check_output(['git','-C',os.path.abspath(SP+'/../../../..'),'ls-files'],text=True).split('\n') if False else subprocess.check_output(['git','-C','/Users/woobi/Desktop/tarae/liftgram','ls-files','src'],text=True).split('\n')
fset=set(files); base={}
for f in files: base.setdefault(os.path.basename(f),[]).append(f)
PRE={'C/':'src/frontend/app/components/','F/':'src/frontend/','B/':'src/backend/'}
bad=[]
def fix(one):
    m=re.match(r'^(.*?)(:\d+)?$',one.strip()); p,l=m.group(1),m.group(2) or ''
    for k,v in PRE.items():
        if p.startswith(k): p=v+p[2:]
    if p in fset or any(f.startswith(p) for f in files if p.endswith('/')): return p+l
    c=base.get(os.path.basename(p),[])
    c=[x for x in c if 'frontend/app/components' in x or '/mobile/' in x or len(c)==1]
    if len(c)==1: return c[0]+l
    bad.append(one); return p+l
def fixs(s): return ' · '.join(fix(x) for x in s.split(' · ')) if s else s
for x in E: x['ev']=fixs(x['ev'])
for x in N:
    if x.get('ev'): x['ev']=fixs(x['ev'])
print('경로 못 찾음',bad)

# 캡처 — shots/<id>.jpg 가 있으면 화면에 붙이고, 없으면 왜 못 찍었는지 적는다
import re as _re
NOSHOT={'native':'앱 전용 화면이라 브라우저로 찍지 못했습니다','s.schema':'기기 저장소가 더 새 버전일 때만 뜹니다','s.tabseal':'다른 탭과 충돌할 때만 뜹니다. 재현하지 못했습니다','s.tabold':'옛 버전 탭이 열려 있을 때만 뜹니다','s.tabimport':'다른 탭이 가져오기 중일 때만 뜹니다','s.update':'앱 업데이트 중에만 뜹니다','s.owner':'기기에 다른 계정 기록이 있을 때만 뜹니다','s.story':'사진을 올려야 볼 수 있습니다. 찍지 않았습니다','s.lockcheck':'앱에서 잠금 화면 기록을 합칠 때만 뜹니다','s.lockready':'앱 안에서만 뜹니다','s.lockdiff':'앱 안에서만 뜹니다','s.swapscope':'재현하지 못했습니다','s.weighin':'찍지 않았습니다','s.slots':'다른 칸 기록이 있을 때만 뜹니다. 재현하지 못했습니다','s.schedrm':'재현하지 못했습니다','s.updatecard':'앱에서만 뜹니다','s.apksheet':'앱에서만 뜹니다','s.switch':'설치형 웹앱·앱에서 조건이 맞을 때만 뜹니다','s.sumopen':'찍지 않았습니다','s.imppick':'재현하지 못했습니다','s.impun':'확인 안 한 종목이 있을 때만 뜹니다. 재현하지 못했습니다','s.impleave':'재현하지 못했습니다','s.impundo':'찍지 않았습니다','s.human':'운영 키가 있어야 뜹니다','s.geo':'브라우저 자체 창입니다','s.files':'운영체제 자체 창입니다','s.p.unit':'프로필에서 이 줄을 찾지 못했습니다. 지금 없는 시트일 수 있습니다','y.error':'렌더 오류가 날 때만 뜹니다','y.boot':'앱 시작 순간에만 보입니다','y.updboot':'업데이트 직후에만 보입니다','y.sw503':'오프라인이고 캐시도 없을 때만 뜹니다','y.appoff':'앱 웹뷰 로드 실패 때만 뜹니다','y.states':'여러 화면의 순간 상태입니다','g.dist':'앱 배포 조건이 맞을 때만 뜹니다','g.sync':'백업 실패 때만 뜹니다','g.boot':'따로 보이는 화면이 아닙니다'}
NOTE={'s.ad':'관리자 미리 보기를 켠 화면입니다. 가운데 「광고 자리」가 해당 위치입니다.','s.summary':'관리자 미리 보기가 켜져 있어 「광고 자리」가 보입니다. 일반 사용자에게는 보이지 않습니다.','/feedback':'로컬 시험 서버에서 목록을 불러오지 못한 상태로 찍혔습니다.','/coaching':'코치 쪽 계정으로 찍었습니다.','/moderation':'시험 데이터가 보입니다.','/ops':'시험 데이터가 보입니다.','/diag/db':'시험 빌드에서 찍었습니다. 운영은 404입니다.'}
for x in N:
    k=_re.sub(r'[^\w.-]','_',x['id'])
    if os.path.exists(os.path.join(SP,'shots',k+'.jpg')): x['shot']='shots/'+k+'.jpg'
    elif x['kind'] in('tab','page','sheet','system','native','global'): x['noshot']=NOSHOT.get(x['id']) or NOSHOT.get(x['kind']) or '찍지 못했습니다'
    if x['id'] in NOTE: x['note']=NOTE[x['id']]
# ── 화면 번호표(2026-11-09) — 「S-12 운동 중 고쳐줘」 · 「S-12.3 세트 줄」처럼 부르게.
# 번호는 tags.json 에 한 번 정해 두고 다시 매기지 않는다(새 화면만 끝 번호 + 1 · 지운 화면 번호는 비워 둔다).
TAGF=os.path.join(SP,'tags.json')
TAGS=json.load(open(TAGF,encoding='utf8')) if os.path.exists(TAGF) else {}
RANK={'tab':0,'page':1,'redirect':2,'global':3,'sheet':4,'system':5,'native':6}
nums=[int(v[2:]) for v in TAGS.values()]
nxt=max(nums)+1 if nums else 1
for x in sorted([x for x in N if x['kind'] in RANK],key=lambda x:(RANK[x['kind']],N.index(x))):
    if x['id'] not in TAGS:
        TAGS[x['id']]=f'S-{nxt:02d}'; nxt+=1
json.dump(TAGS,open(TAGF,'w',encoding='utf8'),ensure_ascii=False,indent=1)
AREAS=globals().get('AREAS',{})
for x in N:
    if x['id'] in TAGS: x['tag']=TAGS[x['id']]
    ar=AREAS.get(x['id'])
    if ar and x.get('tag'):
        x['areas']=[dict(tag=f"{x['tag']}.{i+1}",name=a[0],desc=a[1] if len(a)>1 else '',ev=fixs(a[2]) if len(a)>2 and a[2] else '') for i,a in enumerate(ar)]
miss=[k for k in AREAS if k not in TAGS]
if miss: print('구역 대상 화면 없음',miss)
D=dict(nodes=N,edges=E,orphanNote='',odd=[],foot='')
D['orphanNote']='/diag/db는 개발 전용이라 의도된 것입니다. /signin·/signup은 로그인 폼 전환 때 주소만 바뀝니다. /stats/summary는 옛 주소를 살려 둔 것입니다.'
D['odd']=[
 ['내 종목 줄 → /exercise/[id]','카탈로그의 내 종목 줄도 상세로 연결되는데, 코드 주석은 내 종목이 서버에 없어 이 주소가 404라고 적고 있습니다.','실행 확인 필요 · src/frontend/app/components/CatalogClient.tsx:403'],
 ['앱 링크 도착지','/feed/, /u/, /hashtag/ 링크로 앱이 열려도 해당 글로 옮기는 코드를 찾지 못했습니다. 스킴 처리기는 auth·workout·start만 나눕니다.','실행 확인 필요 · src/frontend/lib/native.ts:96'],
 ['공유 링크','앱 링크 대상 주소는 있지만 앱 안에 링크를 복사하거나 보내는 버튼이 없습니다.','src/frontend/app/components/session/ShareWorkout.tsx:192'],
 ['/gyms 뒤로 가기','입구는 운동 홈인데 뒤로 가면 프로필로 가고 프로필 탭이 켜집니다.','src/frontend/app/components/NearbyGymsClient.tsx:85'],
 ['/bookmarks 뒤로 가기','입구는 프로필인데 뒤로 가면 피드로 가고 피드 탭이 켜집니다.','src/frontend/app/components/feed/PostListScreen.tsx:80'],
 ['/terms·/privacy 뒤로 가기','로그인·가입 화면에서 열어도 뒤로 가면 프로필로 갑니다.','src/frontend/app/components/legal/LegalPage.tsx:22'],
 ['/feed 비로그인 버튼','버튼 글자는 「프로필로 가기」인데 실제로는 /account로 갑니다.','src/frontend/app/components/feed/FeedClient.tsx:256'],
 ['/explore 비로그인','로그인 안내 없이 빈 화면만 보입니다.','src/frontend/app/components/feed/ExploreClient.tsx:70'],
 ['/verify-email 제목','처리 중이거나 실패해도 제목이 「확인된 이메일」입니다.',''],
 ['404 화면','전용 404가 없어 Next 기본 화면이 뜹니다. 한국어 안내와 돌아갈 버튼이 없습니다.',''],
]
D['foot']='코드 기준 2026-11-09 작업 트리(웹 0.82.0 · 2026-11-04 판에 v0.64~0.82 변경 반영). 화면마다 번호(S-nn)와, 주요 화면은 구역 번호(S-nn.k)를 달았습니다 — 수정 요청 때 이 번호로 부르면 됩니다. 연결은 코드를 읽어 만들었습니다. 캡처는 같은 날 로컬 운영 빌드에서 시험 계정으로 찍은 390×844 화면이라 실제 데이터와 다릅니다. 링크 추출 스크립트로 대조했으며, 주석 처리된 링크는 입구로 세지 않았습니다. 같은 시트를 여러 화면에서 쓰면 한 항목으로 셉니다. 모든 주소는 입력으로도 열 수 있어 그 길은 그리지 않았습니다.'
js=json.dumps(D,ensure_ascii=False).replace('</','<\\/')
html=open(SP+'/tpl.html',encoding='utf8').read().replace('/*DATA*/',js)
html=html.replace("D.exp(e.ev)","e.ev").replace("D.exp(n.ev)","n.ev")
open(SP+'/liftgram-screen-map.html','w',encoding='utf8').write(html)
print(len(N),len(E),len(html))
