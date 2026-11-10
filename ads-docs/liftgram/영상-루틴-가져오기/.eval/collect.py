# 시험 자료 모으기 — 한국 운동 루틴 영상의 제목·설명란·댓글(공식 YouTube Data API만)
import json,os,re,sys,urllib.parse,urllib.request
K=sys.argv[1]; OUT=sys.argv[2]
def get(path,**q):
    q['key']=K; u='https://www.googleapis.com/youtube/v3/'+path+'?'+urllib.parse.urlencode(q)
    return json.load(urllib.request.urlopen(u,timeout=20))
QS=['어깨 운동 루틴','하체 루틴 헬스','등 운동 루틴','가슴 운동 루틴','팔 운동 루틴 이두 삼두','헬스 초보 루틴','분할 루틴 헬스','보디빌더 운동 루틴']
ids=['AvD08x6Fnn4']
for q in QS:
    r=get('search',part='id',q=q,type='video',maxResults=8,relevanceLanguage='ko',regionCode='KR',videoDuration='medium')
    ids+= [i['id']['videoId'] for i in r['items'] if i['id']['videoId'] not in ids]
vids=[]
for i in range(0,len(ids),50):
    vids+=get('videos',part='snippet,contentDetails',id=','.join(ids[i:i+50]))['items']
out=[]
for v in vids:
    vid=v['id']; cm=[]
    try:
        r=get('commentThreads',part='snippet',videoId=vid,order='relevance',maxResults=100,textFormat='plainText')
        cm=[{'text':c['snippet']['topLevelComment']['snippet']['textOriginal'],'likes':c['snippet']['topLevelComment']['snippet']['likeCount'],'author_is_channel':c['snippet']['topLevelComment']['snippet'].get('authorChannelId',{}).get('value')==v['snippet']['channelId']} for c in r['items']]
    except Exception as e: cm=[]
    out.append({'id':vid,'title':v['snippet']['title'],'channel':v['snippet']['channelTitle'],'duration':v['contentDetails']['duration'],'description':v['snippet']['description'],'comments':cm})
json.dump(out,open(OUT,'w'),ensure_ascii=False,indent=1)
TS=re.compile(r'\b\d{1,2}:\d{2}\b')
n_desc=sum(1 for o in out if len(TS.findall(o['description']))>=3)
n_cm=sum(1 for o in out if any(len(TS.findall(c['text']))>=3 for c in o['comments']))
print(len(out),'개 영상 · 설명란 시각 목록',n_desc,'· 댓글 시각 목록',n_cm)
