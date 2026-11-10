import json,sys
L=json.load(open(sys.argv[1])); P=json.load(open(sys.argv[2]))
TP=FP=FN=0; rows=[]
for v,x in L.items():
    req=set(x['req']); opt=set(x.get('opt',[])); pred=set(P.get(v,[]))
    tp=len(req&pred); fn=len(req-pred); fp=0 if x.get('partial') else len(pred-req-opt)
    TP+=tp; FN+=fn; FP+=fp; rows.append((v,tp,len(req),fp,sorted(req-pred),sorted(pred-req-opt) if not x.get('partial') else []))
for r in rows: print(f"{r[0]} 맞음 {r[1]}/{r[2]} 오답 {r[3]}  놓침={r[4]}  오답={r[5]}")
print(f"== 재현율(정답 중 찾음) {TP/(TP+FN):.0%} · 정밀도(고른 것 중 맞음) {TP/max(1,TP+FP):.0%} · 맞음 {TP} 놓침 {FN} 오답 {FP}")
