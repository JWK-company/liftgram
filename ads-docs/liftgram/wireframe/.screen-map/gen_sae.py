# -*- coding: utf-8 -*-
# 화면 지도(data.py + build.py 의 보강) → 와이어프레임 SAE 명세. 보고서를 고치면 이것을 다시 돌리고 /ads:wireframe 4~5단계를 잇는다.
import json,os,re,subprocess,sys,glob,collections
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.abspath(HERE+'/../../../..')
sys.path.insert(0,os.path.expanduser('~/.adstudio/marketplace/ads/scripts'))
from _sae_parse import serialize_sae_artifact
src=open(HERE+'/build.py',encoding='utf8').read().split("D=dict(nodes=N")[0].replace("__file__","'%s/build.py'"%HERE)
g={}; exec(src,g); N,E=g['N'],g['E']
KEEP=('tab','page','sheet','system','native','global')
CODES={'/':'WKT','/history':'HIST','/feed':'FEED','/stats':'STAT','/profile':'PRF','/workout':'ACT','/calendar':'CAL','/history/[id]':'WDT','/exercises':'EXL','/exercise/[id]':'EXD','/exercises/new':'EXN','/exercises/[id]/edit':'EXE','/routines/new':'RTN','/routines/[id]':'RTE','/program':'GEN','/gyms':'GYM','/feed/[postId]':'CMT','/explore':'XPL','/discover':'DISC','/hashtag/[tag]':'HASH','/u/[userId]':'UPRF','/u/[userId]/follows':'FOLW','/messages':'DMS','/messages/[id]':'DMC','/messages/new':'DMN','/notifications':'NTF','/bookmarks':'BMK','/coaching':'COACH','/offline':'OFFL','/gear':'GEAR','/blocked':'BLOCK','/account':'AUTH','/account/import':'IMPT','/signin':'SIGN','/signup':'JOIN','/forgot':'FRGT','/reset':'RESET','/verify-email':'VERI','/auth/complete':'OAUTH','/app':'APP','/app/continue':'APPC','/staff':'STAFF','/feedback':'FBK','/moderation':'MODR','/ops':'OPS','/terms':'TERMS','/privacy':'PRIV','/licenses':'LIC','/diag/db':'DIAG'}
PRE={'sheet':'S','native':'N','system':'Y','global':'G'}
def code(x,used):
    if x['id'] in CODES: return CODES[x['id']]
    w=re.sub(r'[^A-Z]','',x['id'].split('.',1)[-1].upper()) or 'X'
    w=(PRE.get(x['kind'],'P')+w)[:6]
    c=w; alpha='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; i=0
    while c in used or len(c)<2: c=w[:5]+alpha[i]; i+=1
    return c
nodes=[x for x in N if x['kind'] in KEEP]
used=set(CODES.values()); C={}
for x in nodes:
    c=code(x,used); C[x['id']]=c; used.add(c)
assert len(set(C.values()))==len(C), '화면 코드 겹침'
byid={x['id']:x for x in N}
SRS={os.path.basename(f)[:-5] for pat in('SRS','UCS') for f in glob.glob(ROOT+'/ads-docs/**/%s-*.json'%pat,recursive=True)}
cache={}
def plm(path):
    p=os.path.join(ROOT,path.split(':')[0])
    if p not in cache:
        try: cache[p]=collections.Counter(c for c in re.findall(r'(?:SRS|UCS)-\d{3}',open(p,encoding='utf8').read()) if c in SRS)
        except OSError: cache[p]=collections.Counter()
    return cache[p]
out_edges=collections.defaultdict(list); in_edges=collections.defaultdict(list)
for e in E:
    out_edges[e['a']].append(e); in_edges[e['b']].append(e)
def cover(x):
    c=collections.Counter()
    # 이 화면이 근거로 적힌 파일의 요구 — 큰 파일이 전체를 덮어쓰지 않게 많이 나온 것 5개만
    ev=[x.get('ev') or '']+[e['ev'] for e in out_edges[x['id']]+in_edges[x['id']]]
    for s in ev:
        for one in (s or '').split(' · '):
            if one: c+=plm(one)
    return [k for k,_ in c.most_common(5)]
TY={'go':'button','open':'button','back':'nav','ext':'button','redir':'display'}
ACT={'go':'누름','open':'누름','back':'누름','ext':'누름','redir':'자동'}
def clean(s): return re.sub(r'\s+',' ',s or '').strip()[:48]
def spec(x,order):
    cd=C[x['id']]; els=[]
    def add(label,ty,state,action,effect): els.append(dict(code='%s.%02d'%(cd,len(els)+1),label=clean(label),type=ty,state=state,action=action,effect=effect))
    kind=x['kind']
    add(x['name'],'display','기본'+(' / '+clean(x['cond']) if x['cond'] else ''),'—',clean(x['desc']) or '—')
    if kind=='sheet': add('패널','overlay','열림 / 닫힘','바깥 누름','⊕닫힘')
    # 화면 안 구역(S-nn.k · 2026-11-09) — 사용자가 「S-06.21 고쳐줘」로 부르는 단위를 와이어프레임에도 싣는다
    for ar in x.get('areas') or []:
        add('%s %s'%(ar['tag'],ar['name']),'display','기본','—',clean(ar['desc']) or '—')
    seen=set()
    for e in out_edges[x['id']]:
        k=(e['label'],e['b'])
        if k in seen: continue
        seen.add(k)
        t=byid.get(e['b'])
        if e['b'] in C: eff='→%s %s'%(C[e['b']],t['name'])
        elif t is not None and t['kind']=='dead': continue
        elif t is not None: eff='⊕%s'%t['name']
        else: eff='⊕앱 밖 %s'%e['b']
        add(e['label'] or (t['name'] if t else e['b']),TY.get(e['t'],'button'),'기본','%s'%ACT.get(e['t'],'누름'),eff)
    entry=[]
    for e in in_edges[x['id']]:
        a=byid.get(e['a'])
        if a is None or a['kind']=='dead': continue
        if a['id'] not in C: entry.append(clean('%s · %s'%(a['name'],e['label'])))
    if x['url'] and x['kind'] in('tab','page'): entry.append('주소 %s 직접'%x['url'])
    if not entry and not [e for e in in_edges[x['id']] if e['a'] in C]:
        entry.append(clean(x['cond']) or '조건에 따라 나타남(앱이 띄움)')
    # 주소 있는 조상까지 거슬러 올라간다(시트 위 시트 — 예: 코칭 › 처방 편집 › 세트 설정)
    def up(i,seen=()):
        for e in in_edges[i]:
            p=byid.get(e['a'])
            if p is None or e['a'] in seen: continue
            if p.get('url') and p['kind'] in('tab','page'): return p
        for e in in_edges[i]:
            if e['a'] in byid and e['a'] not in seen:
                r=up(e['a'],seen+(i,))
                if r: return r
        return None
    par=up(x['id'])
    route=x['url'] or ((par['url']+' 위') if par else '')
    note=clean(x['desc']) if len(x['desc'])<=48 else x['desc']
    if x['cond']: note=(note+' · 조건: '+x['cond']).strip(' ·')
    a=serialize_sae_artifact(cd,x['name'],route,note,cover(x),els)
    a.update(group='liftgram',device='mobile',entry=sorted(set(entry)),family=x['group'],order=order,archetype='sheet' if kind=='sheet' else 'mobile')
    a['title']=x['name']
    if x.get('tag'):  # 화면 번호(S-nn) — 보고서와 같은 번호
        a['title']='%s %s'%(x['tag'],x['name']); a['note']=('%s · %s'%(x['tag'],a.get('note') or '')).strip(' ·')
    return a
sae=os.path.join(HERE,'..','.sae'); os.makedirs(sae,exist_ok=True)
for f in glob.glob(sae+'/WF-*.json'): os.remove(f)  # 보고서에서 빠진 화면의 명세가 남지 않게(이 폴더는 생성물)
FAM=[]
for x in nodes:
    if x['group'] not in FAM: FAM.append(x['group'])
ordered=sorted(nodes,key=lambda x:(FAM.index(x['group'])))
# 자기 근거 파일에 요구가 없으면 들어오는 화면의 요구를 물려받는다(시트는 부모 화면의 요구를 다룬다)
own={x['id']:cover(x) for x in ordered}
def inherited(i,seen=()):
    if own.get(i): return own[i]
    for e in in_edges[i]:
        if e['a'] in own and e['a'] not in seen:
            r=inherited(e['a'],seen+(i,))
            if r: return r
    return []
_cover=cover
# 옛 명세(ads-docs/liftgram/.sae)의 연결과, 파일 근거로 잡히지 않는 요구를 사람이 대응시킨 표
OLD={'EXF':['EXN','EXE'],'FIND':['SFINDE'],'ONB':['SONBOA'],'RTN':['RTN','RTE'],'SUM':['SSUMMA'],'WSCH':['SSCHED']}
EXTRA={'SVARIA':[28],'STAT':[74,90,101],'GYM':[36],'GEAR':[37,41],'FEED':[37,39,40],'EXD':[46],'SIGN':[83],'JOIN':[83],'AUTH':[83],
 'SCTOPI':[47,92],'SCVER':[47,92],'EXL':[94],'SFINDE':[94],'GDIST':[99],'SUPDAA':[99],'SAPKSH':[99],'SSWITC':[99],'NINSTA':[99],'NUPDNO':[99],
 'NMAIN':[95],'NSPLAA':[95],'NPERM':[95],'NFS':[100],'NLOCK':[100],'NCARD':[96],'NNOTIF':[96]}
fixed=collections.defaultdict(list)
for f in glob.glob(ROOT+'/ads-docs/liftgram/.sae/WF-*.json'):
    d=json.load(open(f))
    for t in OLD.get(d.get('screen_code'),[d.get('screen_code')]):
        fixed[t]+=[c for c in d.get('relations',{}).get('covers',[]) if c in SRS]
for k,v in EXTRA.items(): fixed[k]+=['SRS-%03d'%n for n in v]
cover=lambda x: list(dict.fromkeys(fixed[C[x['id']]]+inherited(x['id'])))
for i,x in enumerate(ordered,1):
    json.dump(spec(x,i),open(os.path.join(sae,'WF-%s.json'%C[x['id']]),'w',encoding='utf8'),ensure_ascii=False,indent=1)
print('화면',len(ordered),'계열',len(FAM))
nc=[C[x['id']] for x in ordered if not json.load(open(os.path.join(sae,'WF-%s.json'%C[x['id']]))).get('relations',{}).get('covers')]
print('covers 없음',len(nc),nc[:40])
