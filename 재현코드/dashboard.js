/* 집계자료만 읽습니다. 중앙값을 합산하거나 월별 중앙값으로 연간 값을 계산하지 않습니다. */
(()=>{'use strict';
const D=JSON.parse(document.getElementById('dashboard-data').textContent);
const $=id=>document.getElementById(id), F=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2,minimumFractionDigits:2});
const I=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:0});
const moneyFormat=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2,minimumFractionDigits:0});
const fmt=v=>v==null||!Number.isFinite(v)?'해당 없음':F.format(v);
const money=v=>v==null||!Number.isFinite(v)?'해당 없음':moneyFormat.format(v);
const num=v=>v==null?'0':I.format(v);
const pct=v=>v==null||!Number.isFinite(v)?'해당 없음':(v>0?'+':'')+F.format(v)+'%';
const change=(v,b)=>v==null||b==null||b<=0?null:(v/b-1)*100;
const esc=v=>String(v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const key=(t,d,u,a)=>[t,d,u,a].join('|');
const annual=new Map(D.annual.map(r=>[key(...r.slice(0,4)),r]));
const monthly=new Map(D.monthly.map(r=>[key(...r.slice(0,4)),r]));
const getA=(y,d,u,a)=>annual.get(key(y-2021,d,u,a))||null;
const getM=(m,d,u,a)=>monthly.get(key(m,d,u,a))||null;
const value=(r,i)=>r?r[i]:null;
const state={year:2025,district:0,use:0,area:0,metric:'price',tab:'use',useMode:'level'};
let serial=0,queue=Promise.resolve();
let focusedUse=0; // 건물용도 탭의 표시만 선택하며 공통 필터와 집계는 바꾸지 않습니다.
const years=[2021,2022,2023,2024,2025];
const months=Array.from({length:60},(_,m)=>`${2021+Math.floor(m/12)}-${String(m%12+1).padStart(2,'0')}-01`);
const seq=[[0,'#e6edf1'],[.25,'#c6d6e0'],[.5,'#91afc4'],[.75,'#5d859f'],[1,'#244f6f']];
const mapSeq=[[0,'#edf5ff'],[.2,'#d4e8ff'],[.4,'#91bfee'],[.6,'#3e86ca'],[.8,'#104b87'],[1,'#03152f']];
const div=[[0,'#3d7194'],[.5,'#f1f1ed'],[1,'#b46f51']];
const useColors=['#8f9d70','#386c91','#b88664','#867fa0'];
const config={responsive:true,displaylogo:false,modeBarButtonsToRemove:['lasso2d','select2d'],toImageButtonOptions:{format:'png',scale:2}};
const layout=extra=>Object.assign({paper_bgcolor:'#fff',plot_bgcolor:'#fff',font:{family:'Malgun Gothic,Arial,sans-serif',size:11,color:'#414a52'},
    margin:{l:62,r:18,t:15,b:49},hovermode:'x unified',xaxis:{showgrid:false,zeroline:false,tickfont:{size:10}},
    yaxis:{gridcolor:'#edf0f2',zeroline:false,tickfont:{size:10}},legend:{orientation:'h',y:-.22,font:{size:10}}},extra);
const scope=s=>`${D.districts[s.district]} · ${D.uses[s.use]} · ${D.areas[s.area]}`;
const annualSeries=s=>years.map(y=>getA(y,s.district,s.use,s.area));
function text(id,html,empty=false){$(id).innerHTML=html;$(id).classList.toggle('empty',empty);}
function draw(id,traces,l){return Plotly.react($(id),traces,l,config);}
function emptyLayout(extra={}){return layout(Object.assign({xaxis:{visible:false},yaxis:{visible:false},annotations:[{text:'선택 조건에 해당하는 자료가 없습니다',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false,font:{size:12,color:'#7d858b'}}]},extra));}
function options(id,names,start=0){$(id).innerHTML=names.map((name,i)=>`<option value="${i+start}">${esc(name)}</option>`).join('');}
options('year-select',years,2021);options('district-select',D.districts);options('use-select',D.uses);options('area-select',D.areas);
function sync(){for(const [id,k] of [['year-select','year'],['district-select','district'],['use-select','use'],['area-select','area'],['map-metric','metric']])$(id).value=state[k];}
function kpis(s){
 const r=getA(s.year,s.district,s.use,s.area),b=getA(2021,s.district,s.use,s.area),p=getA(s.year-1,s.district,s.use,s.area);
 const vals={'kpi-price':fmt(value(r,4)),'kpi-deposit':money(value(r,5)),
 'kpi-base':pct(change(value(r,4),value(b,4))),'kpi-yoy':pct(change(value(r,4),value(p,4))),
 'kpi-n':num(value(r,6))};
 Object.entries(vals).forEach(([id,t])=>{$(id).textContent=t;$(id).classList.toggle('na',t==='해당 없음');});
 $('selection').textContent=`기준연도 ${s.year} · ${scope(s)}`;
 document.querySelectorAll('.scope-label').forEach(e=>e.textContent=`2021–2025 · ${scope(s)}`);
}
function mapValue(y,d,s){const r=getA(y,d,s.use,s.area);if(!r)return null;
 if(s.metric==='price')return r[4];if(s.metric==='deposit')return r[5];
 return change(r[4],value(getA(s.metric==='base'?2021:y-1,d,s.use,s.area),4));}
function mapScale(s){const vals=[],ns=[];for(let d=1;d<D.districts.length;d++)for(const y of years){const r=getA(y,d,s.use,s.area);if(r)ns.push(r[6]);const v=mapValue(y,d,s);if(v!=null)vals.push(v);}
 const divergent=['base','yoy'].includes(s.metric);let low=vals.length?Math.min(...vals):0,high=vals.length?Math.max(...vals):1;
 if(divergent){high=Math.max(Math.abs(low),Math.abs(high),1);low=-high;}else if(low===high){low=Math.max(0,low-1);high+=1;}
 return {cmin:low,cmax:high,maxN:Math.max(1,...ns),hasCounts:ns.length>0,divergent};}
const metricNames={price:'㎡당 보증금 중앙값',deposit:'전세 보증금 중앙값',base:'2021년 대비 변화율',yoy:'전년 대비 변화율'};
const metricUnits={price:'만원/㎡',deposit:'만원',base:'변화율 (%)',yoy:'변화율 (%)'};
async function renderMap(s){
 const scale=mapScale(s),traces=[],features=D.geo.features;
 for(const f of features){const d=D.districts.indexOf(f.properties.name),r=getA(s.year,d,s.use,s.area);
   const xs=[],ys=[];for(const ring of f.properties.projected_rings){for(const p of ring){xs.push(p[0]);ys.push(p[1]);}xs.push(null);ys.push(null);}
   traces.push({type:'scatter',x:xs,y:ys,mode:'lines',fill:'toself',fillcolor:d===s.district?'#edf3f7':'#fafbfc',
     line:{color:d===s.district?'#315b78':'#bac3ca',width:d===s.district?1.7:.8},showlegend:false,hoverinfo:'skip',
     meta:{district:d},name:f.properties.name});
 }
 const byName=[...features].sort((a,b)=>D.districts.indexOf(a.properties.name)-D.districts.indexOf(b.properties.name));
 const custom=byName.map(f=>{const d=D.districts.indexOf(f.properties.name),r=getA(s.year,d,s.use,s.area),v=mapValue(s.year,d,s);return [d,f.properties.name,value(r,4),value(r,5),r?r[6]:0,v];});
 const colors=custom.map(c=>c[5]),any=colors.some(c=>c!=null);
 const size=custom.map(c=>44*Math.sqrt(c[4]/scale.maxN));
 const hover=custom.map(c=>`<b>${esc(c[1])} · ${s.year}</b><br>㎡당 중앙값 ${fmt(c[2])} 만원/㎡<br>보증금 중앙값 ${money(c[3])} 만원<br>2021년 대비 ${pct(change(c[2],value(getA(2021,c[0],s.use,s.area),4)))}<br>전년 대비 ${pct(change(c[2],value(getA(s.year-1,c[0],s.use,s.area),4)))}<br>관측 ${num(c[4])}행`);
 traces.push({type:'scatter',mode:'markers+text',x:byName.map(f=>f.properties.point[0]),y:byName.map(f=>f.properties.point[1]),
   text:byName.map(f=>f.properties.name),textposition:'bottom center',textfont:{size:10,color:'#414b53'},
   customdata:custom,hovertext:hover,hovertemplate:'%{hovertext}<extra></extra>',showlegend:false,
   marker:{size,sizemode:'diameter',color:any?colors:'#c6cdd2',colorscale:scale.divergent?div:mapSeq,
     cmin:scale.cmin,cmax:scale.cmax,showscale:any,opacity:custom.map(c=>!s.district||c[0]===s.district? .91:.6),
     line:{color:custom.map(c=>c[0]===s.district?'#162f41':'#fff'),width:custom.map(c=>c[0]===s.district?2.5:.7)},
     colorbar:{title:{text:metricUnits[s.metric],font:{size:10}},thickness:10,len:.77,tickfont:{size:9},outlinewidth:0,x:1.01}}});
 const coords=features.flatMap(f=>f.properties.projected_rings.flat());
 const xx=coords.map(p=>p[0]),yy=coords.map(p=>p[1]);
 const mapLayout=layout({margin:{l:7,r:90,t:8,b:7},hovermode:'closest',dragmode:'pan',
   xaxis:{visible:false,range:[Math.min(...xx)-1300,Math.max(...xx)+1300]},
   yaxis:{visible:false,scaleanchor:'x',scaleratio:1,range:[Math.min(...yy)-1200,Math.max(...yy)+1200]},
   uirevision:'map-'+s.use+'-'+s.area,showlegend:false});
 await draw('seoul-map',traces,mapLayout);
 $('map-title').textContent=`${s.year} · ${metricNames[s.metric]}`;
 const scaleFmt=s.metric==='deposit'?money:fmt;
 $('map-scope').textContent=any?`색상 범위 ${scaleFmt(scale.cmin)}–${scaleFmt(scale.cmax)} ${metricUnits[s.metric]} · 5개 연도 공통`:(scale.divergent?'선택 연도의 변화율은 해당 없음입니다.':'선택 조건의 지도 관측 자료가 없습니다.');
 const refs=[.1,.5,1].map(v=>Math.max(1,Math.round(scale.maxN*v)));
 $('size-legend').innerHTML=scale.hasCounts?'<span>관측 건수</span>'+refs.map(n=>`<span class="size-item"><i class="legend-dot" style="width:${44*Math.sqrt(n/scale.maxN)}px;height:${44*Math.sqrt(n/scale.maxN)}px"></i><span>${num(n)}</span></span>`).join(''):'관측 건수: 선택 조건 자료 없음';
 if(!$('seoul-map')._dashboardClickBound){$('seoul-map').on('plotly_click',ev=>{const p=ev.points&&ev.points[0];if(!p)return;const d=p.customdata?p.customdata[0]:p.data.meta?.district;if(d>0){state.district=d;sync();requestRender();}});$('seoul-map')._dashboardClickBound=true;}
}
async function renderOverview(s){
 const rows=months.map((_,m)=>getM(m,s.district,s.use,s.area)),ys=rows.map(r=>value(r,4)),ns=rows.map(r=>r?r[5]:0),any=rows.some(Boolean);
 const traces=any?[
 {type:'scatter',x:months,y:rows.map(r=>value(r,6)),mode:'lines',line:{width:0},name:'25백분위',hoverinfo:'skip',showlegend:false,connectgaps:false},
 {type:'scatter',x:months,y:rows.map(r=>value(r,7)),mode:'lines',line:{width:0},fill:'tonexty',fillcolor:'rgba(65,106,135,.13)',name:'25–75백분위',hoverinfo:'skip',showlegend:false,connectgaps:false},
 {type:'scatter',x:months,y:ys,customdata:ns,mode:'lines',line:{color:'#315b78',width:2},name:'중앙값',connectgaps:false,
 hovertemplate:'%{x|%Y-%m}<br>중앙값 %{y:.2f}만원/㎡<br>N=%{customdata:,}<extra></extra>'}]:[];
 const xl={type:'date',tickformat:'%Y',dtick:'M12',showgrid:false};
 await Promise.all([draw('monthly-price',traces,any?layout({xaxis:xl,yaxis:{title:{text:'만원/㎡',font:{size:10}},gridcolor:'#edf0f2'}}):emptyLayout()),
 draw('monthly-count',any?[{type:'bar',x:months,y:ns,marker:{color:'#8da5b7'},name:'관측 행 수',hovertemplate:'%{x|%Y-%m}<br>N=%{y:,}<extra></extra>'}]:[],any?layout({xaxis:xl,yaxis:{title:{text:'관측 행 수',font:{size:10}},gridcolor:'#edf0f2'}}):emptyLayout())]);
 const valid=rows.map((r,m)=>r?{r,m}:null).filter(Boolean),label=scope(s);
 if(!valid.length){text('interpret-monthly',`<strong>${esc(label)}</strong>: 2021–2025년 자료가 없습니다. 필터를 넓혀 비교하세요.`,true);text('interpret-count','관측이 없는 달의 중앙값은 0으로 대체하지 않고 빈 값으로 표시합니다.',true);}
 else{
 const lo=valid.reduce((a,b)=>a.r[4]<b.r[4]?a:b),hi=valid.reduce((a,b)=>a.r[4]>b.r[4]?a:b),first=valid[0],last=valid.at(-1);
 text('interpret-monthly',`<strong>${esc(label)}</strong>의 관측 월 중 최저는 ${months[lo.m].slice(0,7)} ${fmt(lo.r[4])}, 최고는 ${months[hi.m].slice(0,7)} ${fmt(hi.r[4])}만원/㎡입니다. 처음·마지막 관측 월은 ${months[first.m].slice(0,7)}→${months[last.m].slice(0,7)}(${pct(change(last.r[4],first.r[4]))}). 같은 주택을 추적한 변화가 아니며, 구성·반복 기록의 영향을 받습니다.`);
 const max=valid.reduce((a,b)=>a.r[5]>b.r[5]?a:b),min=valid.reduce((a,b)=>a.r[5]<b.r[5]?a:b),total=ns.reduce((a,b)=>a+b,0);
 text('interpret-count',`같은 조건의 5년간 관측은 <strong>${num(total)}행</strong>입니다. 월별 ${num(min.r[5])}~${num(max.r[5])}행이며 가장 많은 달은 ${months[max.m].slice(0,7)}입니다. 자료가 없는 달은 ${60-valid.length}개입니다. 건수는 고유 계약 수가 아니며 파일 수집 범위와 반복 기록을 함께 읽어야 합니다.`);
 }
 await renderDistributions(s);
}
async function renderDistributions(s){
 const rows=annualSeries(s),has=rows.some(Boolean);
 const box=(deposit)=>({type:'box',x:years.map(String),q1:rows.map(r=>value(r,deposit?12:8)),median:rows.map(r=>value(r,deposit?5:4)),
 q3:rows.map(r=>value(r,deposit?13:9)),lowerfence:rows.map(r=>value(r,deposit?11:7)),upperfence:rows.map(r=>value(r,deposit?14:10)),
 boxpoints:false,name:deposit?'보증금 총액':'㎡당 보증금',line:{color:deposit?'#927e69':'#567e9b'},fillcolor:deposit?'rgba(146,126,105,.18)':'rgba(86,126,155,.16)',showlegend:false});
 await Promise.all([draw('price-distribution',has?[box(false)]:[],has?layout({yaxis:{title:{text:'만원/㎡',font:{size:10}},gridcolor:'#edf0f2'}}):emptyLayout()),
 draw('deposit-distribution',has?[box(true)]:[],has?layout({yaxis:{title:{text:'만원',font:{size:10}},gridcolor:'#edf0f2'}}):emptyLayout())]);
 const r=getA(s.year,s.district,s.use,s.area);
 if(!r){text('interpret-distribution',`${s.year}년 선택 조건의 자료가 없습니다.`,true);text('interpret-deposit','분포는 원자료의 계약별 값을 직접 집계하며 자료가 없으면 표시하지 않습니다.',true);return;}
 text('interpret-distribution',`<strong>${s.year}년 ${esc(scope(s))}</strong>의 ㎡당 보증금 10–90백분위는 ${fmt(r[7])}~${fmt(r[10])}만원/㎡, 중앙 50%는 ${fmt(r[8])}~${fmt(r[9])}만원/㎡입니다. 중앙값 ${fmt(r[4])}만으로 가격 분산을 설명할 수 없습니다. 수염은 10·90백분위이며 이상치 제거 기준이 아닙니다.`);
 text('interpret-deposit',`같은 조건의 보증금 중앙값은 <strong>${money(r[5])}만원</strong>, 10–90백분위는 ${money(r[11])}~${money(r[14])}만원입니다. 총액과 ㎡당 가격은 면적 구성에 따라 다르게 움직일 수 있습니다.`);
}
async function renderDistrict(s){
 const singleDistrict=Boolean(s.district);
 $('district-compare-prompt').hidden=!singleDistrict;
 $('district-comparison-charts').hidden=singleDistrict;
 if(singleDistrict){
   $('district-compare-message').textContent=`현재 ${D.districts[s.district]} 한 곳이 선택되어 있습니다.`;
   return;
 }
 const ds=s.district?[s.district]:Array.from({length:25},(_,i)=>i+1),z=ds.map(d=>years.map(y=>value(getA(y,d,s.use,s.area),4))),n=ds.map(d=>years.map(y=>value(getA(y,d,s.use,s.area),6)));
 const valid=z.flat().filter(v=>v!=null),lo=valid.length?Math.min(...valid):0,hi=valid.length?Math.max(...valid):1;
 const heat=valid.length?[{type:'heatmap',x:years.map(String),y:ds.map(d=>D.districts[d]),z,customdata:n,colorscale:seq,zmin:lo,zmax:hi,
 colorbar:{title:{text:'만원/㎡',font:{size:9}},thickness:9,tickfont:{size:9}},hoverongaps:false,
 hovertemplate:'%{y} · %{x}<br>중앙값 %{z:.2f}만원/㎡<br>N=%{customdata:,}<extra></extra>'}]:[];
 const rank=ds.map(d=>{const a=getA(2021,d,s.use,s.area),b=getA(2025,d,s.use,s.area);return {d,a,b,v:change(value(b,4),value(a,4))};}).filter(r=>r.v!=null).sort((a,b)=>a.v-b.v);
 const rh=rank.map(r=>D.districts[r.d]+((r.a[6]<200||r.b[6]<200)?' †':''));
 await Promise.all([draw('district-heatmap',heat,valid.length?layout({margin:{l:66,r:70,t:12,b:36},xaxis:{type:'category'},yaxis:{autorange:'reversed',tickfont:{size:10}}}):emptyLayout()),
 draw('district-rank',rank.length?[{type:'bar',orientation:'h',x:rank.map(r=>r.v),y:rh,marker:{color:rank.map(r=>r.v>=0?'#ad765c':'#537f9e')},
 customdata:rank.map(r=>[r.a[4],r.b[4],r.a[6],r.b[6]]),
 hovertemplate:'%{y}<br>변화율 %{x:.2f}%<br>중앙값 %{customdata[0]:.2f}→%{customdata[1]:.2f}만원/㎡<br>N=%{customdata[2]:,}→%{customdata[3]:,}<extra></extra>'}]:[],rank.length?layout({margin:{l:80,r:23,t:12,b:40},xaxis:{title:{text:'2021→2025 관측 변화율 (%)',font:{size:10}},gridcolor:'#edf0f2',zeroline:true,zerolinecolor:'#b5bec5'},yaxis:{type:'category',tickfont:{size:10}}}):emptyLayout())]);
 const levels=ds.map(d=>({d,r:getA(s.year,d,s.use,s.area)})).filter(x=>x.r).sort((a,b)=>b.r[4]-a.r[4]);
 if(!levels.length)text('interpret-district-level',`${s.year}년 ${esc(scope(s))} 조건의 자치구 관측이 없습니다.`,true);
 else{const top=levels[0],low=levels.at(-1);text('interpret-district-level',s.district?`<strong>${esc(D.districts[s.district])}</strong>의 ${s.year}년 연간 중앙값은 ${fmt(top.r[4])}만원/㎡(N=${num(top.r[6])})입니다. 각 연도는 연간 계약에서 직접 계산했습니다. 전체 자치구 비교 버튼으로 수준 차이를 볼 수 있습니다.`:`<strong>${s.year}년 ${esc(D.uses[s.use])}·${esc(D.areas[s.area])}</strong>에서 최고 수준은 ${esc(D.districts[top.d])} ${fmt(top.r[4])}, 최저는 ${esc(D.districts[low.d])} ${fmt(low.r[4])}만원/㎡입니다. 높은 가격 수준이 높은 상승률을 뜻하지 않으며 각 구의 주택 구성도 다릅니다.`);}
 if(!rank.length)text('interpret-district-change','2021년과 2025년 모두 자료가 있는 자치구가 없어 변화율을 계산할 수 없습니다. 누락 값을 0으로 대체하지 않습니다.',true);
 else{const top=rank.at(-1),low=rank[0],small=rank.filter(r=>r.a[6]<200||r.b[6]<200).length; text('interpret-district-change',s.district?`<strong>${esc(D.districts[top.d])}</strong>의 변화율은 ${pct(top.v)}(${fmt(top.a[4])}→${fmt(top.b[4])}만원/㎡, N=${num(top.a[6])}→${num(top.b[6])})입니다. 보정된 변화율이나 같은 주택의 변화가 아닙니다. 2021년 또는 2025년 관측이 200건 미만이면 †로 표시합니다.`:`같은 용도·면적 조건에서 변화율 최고는 <strong>${esc(D.districts[top.d])} ${pct(top.v)}</strong>, 최저는 ${esc(D.districts[low.d])} ${pct(low.v)}입니다. † 표시가 있는 ${small}개 구는 2021년 또는 2025년 관측이 200건 미만이므로 비교에 주의가 필요합니다. 순위는 수준 순위와 다르며 반복 기록·입지·면적 구성에 민감합니다.`);}
}
async function renderUse(s){
 const us=s.use?[s.use]:[1,2,3,4],lines=[],share=[];
 if(!us.includes(focusedUse))focusedUse=0;
 const records=us.map(u=>({u,rows:years.map(y=>getA(y,s.district,u,s.area))}));
 const total=years.map((_,j)=>records.reduce((sum,v)=>sum+(v.rows[j]?v.rows[j][6]:0),0));
 for(const {u,rows} of records){const b=rows[0],color=useColors[u-1],values=rows.map(r=>{if(!r)return null;if(s.useMode==='index')return b?r[4]/b[4]*100:null;return r[4];});
 const showValues=focusedUse===u||us.length===1;
 lines.push({type:'scatter',x:years,y:values,mode:showValues?'lines+markers+text':'lines+markers',name:D.uses[u],line:{color,width:2},connectgaps:false,
 text:values.map((v,j)=>showValues&&v!=null&&(j===0||j===4)?fmt(v):''),textposition:'top center',textfont:{size:11,color},cliponaxis:false,
 customdata:rows.map(r=>r?[r[6],r[4]]:[0,null]),hovertemplate:'%{x}년<br>'+(s.useMode==='index'?'지수 %{y:.2f} (2021=100)':'단가 %{y:.2f}만원/㎡')+'<br>N=%{customdata[0]:,}<br>중앙값 %{customdata[1]:.2f}만원/㎡<extra>%{fullData.name}</extra>'});
 share.push({type:'scatter',x:years,y:rows.map((r,j)=>total[j]>0?(r?r[6]:0)/total[j]*100:null),mode:'lines',stackgroup:'share',name:D.uses[u],line:{color,width:1},connectgaps:false,
 customdata:rows.map(r=>r?r[6]:0),hovertemplate:'%{x}년<br>구성비 %{y:.2f}%<br>N=%{customdata:,}<extra>%{fullData.name}</extra>'});
 }
 // 범례 더블클릭 대신 명시적인 단일 클릭 버튼으로 두 그래프를 함께 표시합니다.
 for(const traces of [lines,share])traces.forEach((trace,i)=>{trace.visible=!focusedUse||us[i]===focusedUse?true:'legendonly';});
 for(const id of ['use-price-buttons','use-share-buttons']){
   $(id).innerHTML=us.map(u=>`<button type="button" data-use-series="${u}" aria-pressed="${!focusedUse||focusedUse===u}" class="${focusedUse===u?'is-focused':''}" style="--series-color:${useColors[u-1]}">${esc(D.uses[u])}</button>`).join('');
   $(id).querySelectorAll('[data-use-series]').forEach(button=>button.onclick=()=>{const u=Number(button.dataset.useSeries);focusedUse=focusedUse===u?0:u;requestRender();});
 }
 const has=total.some(n=>n>0),priceHas=lines.some(t=>t.y.some(v=>v!=null)),ytitle=s.useMode==='index'?'관측지수 (각 용도 2021=100)':'중앙값 (만원/㎡)';
 $('use-price-title').textContent=s.useMode==='index'?'건물용도별 가격 변화 (2021년=100)':'건물용도별 가격 수준 (만원/㎡)';
 const visibleRecord=records.find(r=>r.u===(focusedUse||s.use));
 const start=visibleRecord?.rows[0],finish=visibleRecord?.rows[4];
 $('use-price-sub').textContent=visibleRecord&&start&&finish?(s.useMode==='index'?`${D.uses[visibleRecord.u]}: 2021년 100 → 2025년 ${fmt(finish[4]/start[4]*100)} (${pct(change(finish[4],start[4]))})`:`${D.uses[visibleRecord.u]}: 2021년 ${fmt(start[4])} → 2025년 ${fmt(finish[4])}만원/㎡`):(s.useMode==='index'?'왼쪽 가격 그래프만 전환 · 각 용도의 2021년 가격을 100으로 환산':'왼쪽 가격 그래프만 전환 · 실제 단가(만원/㎡)');
 document.querySelectorAll('[data-use-mode]').forEach(b=>b.classList.toggle('active',b.dataset.useMode===s.useMode));
 const priceEmpty=has&&s.useMode==='index'?emptyLayout({annotations:[{text:'2021년 기준 자료가 없어 지수를 계산할 수 없습니다',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false,font:{size:11,color:'#7d858b'}}]}):emptyLayout();
 await Promise.all([draw('use-price',priceHas?lines:[],priceHas?layout({showlegend:false,xaxis:{dtick:1},yaxis:{title:{text:ytitle,font:{size:10}},gridcolor:'#edf0f2'},shapes:s.useMode==='index'?[{type:'line',xref:'paper',x0:0,x1:1,y0:100,y1:100,line:{color:'#aab5be',width:1,dash:'dot'}}]:[]}):priceEmpty),
 draw('use-share',has?share:[],has?layout({showlegend:false,xaxis:{dtick:1},yaxis:{range:[0,100],title:{text:'기록 구성비 (%)',font:{size:10}},gridcolor:'#edf0f2'}}):emptyLayout())]);
 if(!has){text('interpret-use-price',`<strong>${esc(scope(s))}</strong>: 용도별 비교 자료가 없습니다.`,true);text('interpret-use-share','관측이 없는 연도는 구성비를 계산할 수 없습니다.',true);return;}
 const latest=records.map(({u,rows})=>({u,a:rows[0],b:rows[4]})).filter(v=>v.b).sort((a,b)=>b.b[4]-a.b[4]);
 if(latest.length){const hi=latest[0],lo=latest.at(-1),sentence=s.use?`${esc(D.uses[hi.u])}의 2025년 중앙값 ${fmt(hi.b[4])}만원/㎡, 2021년 대비 ${pct(change(hi.b[4],value(hi.a,4)))}입니다.`:`2025년 최고 수준은 ${esc(D.uses[hi.u])} ${fmt(hi.b[4])}, 최저는 ${esc(D.uses[lo.u])} ${fmt(lo.b[4])}만원/㎡입니다.`;
 text('interpret-use-price',`<strong>${esc(D.districts[s.district])}·${esc(D.areas[s.area])}</strong>: ${sentence} ${s.useMode==='index'?'지수는 각 용도의 다른 기준 가격을 100으로 바꾸므로 지수 순위와 가격 수준 순위가 다릅니다.':'단가를 면적으로 나누어도 세부 면적·입지·건물 품질 차이는 남습니다.'}`);
 }else text('interpret-use-price','2025년 자료가 없어 끝 연도 수준 비교를 할 수 없습니다. 이전 연도의 관측만 표시합니다.',true);
 const possible=records.filter(v=>v.rows[0]&&v.rows[4]);
 if(s.use){text('interpret-use-share',`<strong>${esc(D.uses[s.use])}만 선택</strong>되어 자료가 있는 연도의 구성비는 100%입니다. 선택 용도 관측은 ${num(total[0])}→${num(total[4])}행입니다. 용도 간 구성 변화를 보려면 전체 용도를 선택하세요.`);}
 else if(possible.length){const peak=possible.map(v=>({u:v.u,a:v.rows[0][6]/total[0]*100,b:v.rows[4][6]/total[4]*100})).sort((a,b)=>Math.abs(b.b-b.a)-Math.abs(a.b-a.a))[0];
 const cityA=getA(2021,s.district,0,s.area),cityB=getA(2025,s.district,0,s.area);
 text('interpret-use-share',`같은 지역·면적에서 구성비 변화가 가장 큰 용도는 <strong>${esc(D.uses[peak.u])}</strong>(${fmt(peak.a)}%→${fmt(peak.b)}%, ${fmt(peak.b-peak.a)}%p)입니다. 동시에 전체 용도의 관측 중앙값은 ${fmt(value(cityA,4))}→${fmt(value(cityB,4))}만원/㎡입니다. 동반 변화이며 구성 변화가 가격 변화를 일으켰다고 단정할 수 없습니다. 중앙값은 용도별 중앙값의 가중평균이 아닙니다.`);
 }else text('interpret-use-share','2021년이나 2025년 자료가 없는 용도가 있어 구성비 변화 비교를 제한합니다. 관측 건수의 차이는 자료 수집 범위와 반복 기록 영향도 받습니다.');
}
function table(headers,rows){return '<table><thead><tr>'+headers.map(v=>`<th>${esc(v)}</th>`).join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>`<td>${esc(v)}</td>`).join('')+'</tr>').join('')+'</tbody></table>';}
function methodStatic(){
 const P=D.preprocessing;
 $('method-data').innerHTML=`<p>서울 열린데이터광장에서 사용자가 내려받은 2021 TXT와 2022–2025 CSV의 전월세 자료입니다. 원본 다운로드 시점·추출 이력은 알 수 없습니다.</p><ul><li>실제 <b>계약일 → CTRT_DAY</b>, <b>접수년도 → RCPT_YR</b>로 대응합니다. 접수연도로 계약연도를 대체하지 않습니다.</li><li>CTRT_DAY 2021-01-01~2025-12-31, 실제 전월세구분 <b>전세</b>만 선택합니다.</li><li>GRFE(만원) / RENT_AREA(㎡)를 계약별 계산한 뒤 중앙값을 구합니다. 보증금·면적이 결측 또는 0 이하이면 제외합니다.</li><li>전체 ${num(P.raw_N)}행 → 원본 완전일치 추가 행 ${num(P.exact_removed_N)}행 제거 → 유지 ${num(P.unique_record_N)}행 → 기간 내 ${num(P.period_N)}행 → 가격 유효 전세 ${num(P.analysis_N)}행. 날짜 실패 ${num(P.date_invalid_N)}, 기간 밖 ${num(P.out_of_period_N)}, 보증금·면적 조건 탈락 ${num(P.invalid_deposit_area_N)}행입니다.</li><li>전세인데 월 임대료 양수인 ${num(P.positive_monthly_rent_N)}행은 점검 대상으로 유지했습니다. 원본 전체가 같은 행만 정리했고 이상치·일부 특성만 같은 행은 유지했습니다.</li><li>모든 지원 필터 조합의 월별·연간 통계를 원자료에서 각각 계산했습니다. 월별 중앙값의 평균을 연간 중앙값으로 사용하지 않습니다.</li><li>면적 구간은 [0,30), [30,60), [60,85), [85,135), [135,∞)㎡입니다. 비교연도에도 같은 필터를 적용합니다.</li><li>HTML에는 집계 중앙값·분위수·건수와 지도 도형만 포함하며 주소·개별 계약 목록을 포함하지 않습니다.</li></ul>`;
 const q=D.beforeQuality.find(r=>r.YEAR===2025);
 const f=D.fileQuality.find(r=>r.SOURCE_FILE.includes('2025'));
 const S=D.sensitivity,first=S[0],last=S[S.length-1];
 $('method-quality').innerHTML=`<p><b>주 분석은 원본 23개 컬럼이 모두 같은 행만 한 행으로 정리한 결과입니다.</b> 접수년도·계약기간 등 원본 전체를 포함해 비교하고, 숫자 변환·공백 정리 전에 파싱된 문자열이 전부 일치할 때만 파일 2021→2025 순서의 첫 행을 남겼습니다. 출처 파일명·추가 행번호는 비교에서 제외했습니다.</p><p>전체 입력에서 ${num(P.exact_removed_N)}행을 정리했습니다. 2025년 파일의 추가 반복 행은 ${num(f.EXACT_EXTRA_ROWS)}행이며, 기간 내 가격 유효 전세는 전체 ${num(P.baseline_analysis_N)}→${num(P.analysis_N)}행입니다. 일부 주소·날짜·면적·가격만 같은 행과 이상치는 추가 삭제하지 않았습니다.</p><p>이전의 <b>85.18%</b>는 제거 전 2025년 전세에서 주요 특성 12개가 같은 집단의 첫 행까지 센 ${num(q.KEY_REPEAT_N)}/${num(q.N)}입니다. 이번 23필드 완전일치 제거와는 다른 기준입니다. 아래 연도별 특성 반복 표는 <b>제거 후 남은 자료</b>를 같은 12개 기준으로 점검한 것이며 추가 제거 대상으로 간주하지 않습니다.</p><p>원자료 유지 결과도 민감도 비교용으로 보관했습니다. 2021→2025년 연간 중앙값 변화율은 제거 전 ${pct(change(last.BEFORE_MEDIAN,first.BEFORE_MEDIAN))}, 제거 후 ${pct(change(last.AFTER_MEDIAN,first.AFTER_MEDIAN))}입니다. 고유 계약번호가 없어 실제 계약 동일성과 수집 단계의 발생 원인을 완전히 입증한 것은 아니므로, 원본 전체 일치 기록을 반복으로 간주한다는 처리 기준을 명시했습니다.</p><ul><li>같은 주소·날짜·가격만으로는 별개 계약을 배제할 수 없습니다. 일부 특성 일치 행은 유지하며 관측 건수도 고유 계약 수를 보장하지 않습니다.</li><li>늦게 접수된 계약이 존재하며 2025년 계약의 2026년 이후 접수는 입력에서 빠질 수 있습니다. 60개월 자료가 있어도 시장 전체의 완전성을 보장하지 않습니다.</li><li>지역·면적·용도·신규/갱신 구성과 미관측 건물 품질이 바뀌면 중앙값도 달라질 수 있습니다. 같은 주택 가격 변화나 공식 가격지수가 아닙니다.</li><li>가격과 구성비의 동반 움직임을 인과관계로 단정하지 않으며 금리·정책·전세사기 원인을 검증하지 않았습니다.</li><li>일부 구·용도·면적 조합은 적은 표본을 포함합니다. †는 2021년 또는 2025년 관측이 200건 미만이라는 뜻입니다. 관측이 적으면 변화율을 신중하게 해석해야 합니다.</li></ul>`;
 $('method-quality-table').innerHTML=table(['계약연도','관측 N','특성 반복 행','비중'],D.quality.map(r=>[r.YEAR,num(r.N),num(r.KEY_REPEAT_N),pct(r.KEY_REPEAT_PCT)]));
 const G=D.geoSource;
 $('method-geography').innerHTML=`<p><a href="${esc(G.source_documentation_url)}" target="_blank" rel="noopener">${esc(G.original_creator)} · ${esc(G.redistributor)}</a>, <b>${esc(G.boundary_vintage)}</b>. <a href="${esc(G.source_url)}" target="_blank" rel="noopener">원본 GeoJSON</a>의 25개 자치구명으로 결합했습니다.</p><p>EPSG:5179 투영에서 공유 경계를 보존해 25m 단순화했습니다. 원본과 표시 도형 양쪽 내부에 들어가는 대표점을 생성·검증했습니다. 구청·개별 계약 위치가 아닙니다. 지도 타일 없이 경계와 마커를 직접 그립니다.</p><p>2013년 경계를 지도 배경으로 사용하며, 2021~2025년의 연도별 법적 경계를 재현하지 않습니다. 단순화한 경계는 정밀한 위치 판단이나 면적 측정에 적합하지 않습니다. 25개 자치구명이 분석 자료와 일치하지만 미세한 경계 변경 여부까지 확인한 것은 아닙니다. Apache v2.0는 재배포 저장소의 라이선스 선언이며, 통계청 원자료의 별도 이용조건 전체를 확인한 것은 아닙니다.</p>`;
 $('footer-data').textContent=`전세 ${num(P.analysis_N)}행 · 지도: KOSTAT 2013 도식 경계`;
}
function methodDynamic(s){const rows=annualSeries(s);$('method-year-table').innerHTML=table(['계약연도','만원/㎡','보증금(만원)','N','2021 대비','전년 대비'],years.map((y,j)=>[y,fmt(value(rows[j],4)),money(value(rows[j],5)),num(value(rows[j],6)),pct(change(value(rows[j],4),value(rows[0],4))),pct(change(value(rows[j],4),value(rows[j-1],4)))]));
 text('method-selection-note',`<strong>${esc(scope(s))}</strong>의 연간 계약에서 직접 계산했습니다. 현재 기준연도는 ${s.year}입니다. 자치구 미상 ${num(D.preprocessing.unknown_district_N)}행은 전체 서울 집계에는 포함되지만 지도의 구별 집계에서는 제외됩니다. 2021년의 전년 대비는 입력 범위 밖이라 해당 없음입니다.`);}
function setTab(name){state.tab=name;document.querySelectorAll('.tab').forEach(b=>{const active=b.dataset.tab===name;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===name));return requestRender();}
function requestRender(){const id=++serial,s={...state};sync();kpis(s);methodDynamic(s);$('render-status').textContent='갱신 중…';
 queue=queue.catch(()=>{}).then(async()=>{if(id!==serial)return;await renderMap(s);if(id!==serial)return;
 if(s.tab==='overview')await renderOverview(s);else if(s.tab==='district')await renderDistrict(s);else if(s.tab==='use')await renderUse(s);
 if(id!==serial)return;document.querySelectorAll('.tab-panel.active .js-plotly-plot').forEach(p=>{if(p.offsetWidth&&p.offsetHeight)Plotly.Plots.resize(p);});$('render-status').textContent=getA(s.year,s.district,s.use,s.area)?'선택 조건 적용됨':'선택 연도 자료 없음';
 }).catch(e=>{console.error(e);$('render-status').textContent='화면 갱신 오류';throw e;});
 window.__dashboardReady=queue;return queue;}
for(const [id,k] of [['year-select','year'],['district-select','district'],['use-select','use'],['area-select','area'],['map-metric','metric']])$(id).addEventListener('change',e=>{state[k]=k==='metric'?e.target.value:Number(e.target.value);requestRender();});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>setTab(b.dataset.tab)));
document.querySelectorAll('[data-use-mode]').forEach(b=>b.addEventListener('click',()=>{state.useMode=b.dataset.useMode;requestRender();}));
$('reset-district').onclick=()=>{state.district=0;requestRender();};
$('reset-all').onclick=()=>{focusedUse=0;Object.assign(state,{year:2025,district:0,use:0,area:0,metric:'price',useMode:'level'});requestRender();};
$('compare-all-districts').onclick=()=>{state.district=0;requestRender();};
$('compare-all-uses').onclick=()=>{focusedUse=0;state.use=0;requestRender();};
window.dashboard={state,data:D,getAnnual:getA,getMonthly:getM,rate:change,mapScale,
 setFilters:patch=>{Object.assign(state,patch);return requestRender();},setTab,refresh:requestRender};
methodStatic();sync();requestRender();
})();
