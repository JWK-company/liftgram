# 로컬 LLM 시험 — 1단계: 글에서 영상 속 종목 뽑기 · 2단계: 카탈로그 후보(글자 유사도 상위 12) 중 고르기
import csv,json,re,sys,time,urllib.request
VIDS,LABELS,CAT,MODEL,MODE,OUT=sys.argv[1:7]   # MODE = full(댓글 포함) | nocomment(제목·설명란만)
URL='http://127.0.0.1:11500/api/chat'
rows=[r for r in csv.DictReader(open(CAT)) if r['status']!='drop' and not r['merge_into']]
def norm(s): return re.sub(r'[\s\-_()·./]','',s.lower())
def grams(s):
    s=norm(s); return {s[i:i+2] for i in range(max(1,len(s)-1))}
INDEX=[]
for r in rows:
    for n in [r['new_name_ko'],r['id_en']]+[a for a in r['aliases_ko'].split(';')+r['aliases_en'].split(';') if a]:
        INDEX.append((r['id_en'],grams(n)))
NAME={r['id_en']:r['new_name_ko'] for r in rows}
EQUIP={r['id_en']:r['equipment'] for r in rows}
def cands(q,k=12):
    g=grams(q); best={}
    for i,gg in INDEX:
        s=len(g&gg)/max(1,len(g|gg))
        if s>best.get(i,0): best[i]=s
    return [i for i,_ in sorted(best.items(),key=lambda x:-x[1])[:k]]
def chat(system,user):
    body={'model':MODEL,'messages':[{'role':'system','content':system},{'role':'user','content':user}],'stream':False,'format':'json','think':False,'options':{'temperature':0,'num_ctx':16384}}
    t=time.time(); r=json.load(urllib.request.urlopen(urllib.request.Request(URL,json.dumps(body).encode(),{'Content-Type':'application/json'}),timeout=600))
    return json.loads(r['message']['content']),time.time()-t
TS=re.compile(r'\d{1,2}:\d{2}')
def gather(v):
    strip=lambda s: re.sub(r'https?://\S+','',s)
    parts=[f"제목: {v['title']}",f"채널: {v['channel']}",'설명란:\n'+strip(v['description'])[:2500]]
    if MODE=='full':
        cs=sorted(v['comments'],key=lambda c:(-(len(TS.findall(c['text']))>=3), -c['author_is_channel'], -c['likes']))[:25]
        parts.append('댓글(좋아요 순·시각 목록 먼저):\n'+'\n'.join('- '+strip(c['text'])[:500].replace('\n',' / ') for c in cs))
    return '\n\n'.join(parts)
S1=("너는 운동 영상 분석기다. 주어진 YouTube 영상의 제목·설명란·댓글만 근거로, 영상 속에서 실제로 시연·수행하는 웨이트 운동 종목을 순서대로 뽑아라. "
    "광고·제품·식단·이론 설명·'하지 마세요' 같은 언급만은 빼라. 근거가 글에 없으면 지어내지 말고 빈 목록을 내라. "
    "JSON만: {\"exercises\":[{\"name\":\"영상에서 부른 이름 그대로\",\"equipment\":\"덤벨|바벨|케이블|머신|스미스|맨몸|밴드|모름\",\"one_arm\":true/false,\"sets\":숫자|null,\"reps\":\"숫자 또는 범위\"|null,\"time\":\"m:ss\"|null,\"evidence\":\"근거 문장 짧게\"}]}")
S2=("너는 운동 종목 매칭기다. 각 항목에 대해 주어진 후보 id 중 같은 운동(같은 동작·같은 기구)을 하나 고르고, 맞는 게 없으면 null. 한 팔(원암)은 같은 종목으로 본다. "
    "JSON만: {\"matches\":[{\"i\":번호,\"id\":\"후보 id\"|null}]}")
vids=[v for v in json.load(open(VIDS)) if v['id'] in json.load(open(LABELS))]
out={}; log=[]
for v in vids:
    e,t1=chat(S1,gather(v)); ex=e.get('exercises',[]) or []
    if ex:
        lines=[]
        for n,x in enumerate(ex):
            q=f"{x.get('equipment') if x.get('equipment') not in (None,'모름') else ''} {x.get('name','')}".strip()
            cl=cands(q)+[c for c in cands(x.get('name','')) ]
            cl=list(dict.fromkeys(cl))[:14]
            lines.append(f"{n}. {x.get('name')} (기구: {x.get('equipment')})\n   후보: "+'; '.join(f"{c}={NAME[c]}" for c in cl))
        m,t2=chat(S2,'\n'.join(lines))
        ids=[x['id'] for x in m.get('matches',[]) if x.get('id') in NAME]
    else: ids=[];t2=0
    out[v['id']]=ids; log.append({'id':v['id'],'extract':ex,'ids':ids,'sec':round(t1+t2,1)})
    print(v['id'],f"{t1+t2:.1f}s",len(ex),'개 →',[NAME[i] for i in ids],flush=True)
json.dump(out,open(OUT,'w'),ensure_ascii=False,indent=1); json.dump(log,open(OUT.replace('.json','.log.json'),'w'),ensure_ascii=False,indent=1)
print('평균',round(sum(l['sec'] for l in log)/len(log),1),'초/영상')
