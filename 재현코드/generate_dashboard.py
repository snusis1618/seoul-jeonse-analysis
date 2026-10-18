"""원자료에서 필터 조합별 통계를 계산하여 오프라인 단일 HTML을 생성합니다."""
from pathlib import Path
import argparse, itertools, ast, json, hashlib, sys
import numpy as np
import pandas as pd
import nbformat
import plotly
from plotly.offline import get_plotlyjs

HERE = Path(__file__).resolve().parent
PACKAGE_DIR = HERE.parent
parser = argparse.ArgumentParser()
parser.add_argument('--data-dir',type=Path,default=PACKAGE_DIR / '자료')
parser.add_argument('--output-dir',type=Path,default=PACKAGE_DIR / '재실행결과' / '대시보드')
parser.add_argument('--render-only',action='store_true',help='기존 집계 JSON으로 HTML 화면만 다시 생성')
args = parser.parse_args()
DATA, OUT = args.data_dir, args.output_dir
OUT.mkdir(parents=True,exist_ok=True)

def render_html(payload):
    html=(HERE/'dashboard_template.html').read_text(encoding='utf-8')
    html=html.replace('__CSS__',(HERE/'dashboard.css').read_text(encoding='utf-8'))
    html=html.replace('__PLOTLY__',get_plotlyjs())
    html=html.replace('__DATA__',json.dumps(payload,ensure_ascii=False,separators=(',',':')).replace('</','<\\/'))
    html=html.replace('__APP__',(HERE/'dashboard.js').read_text(encoding='utf-8'))
    (OUT/'서울시_전세가격_인터랙티브_대시보드.html').write_text(html,encoding='utf-8')

if args.render_only:
    payload_path = OUT/'dashboard_data.json'
    if not payload_path.exists(): payload_path = HERE/'dashboard_data.json'
    render_html(json.loads(payload_path.read_text(encoding='utf-8')))
    print('HTML assembled from existing aggregate data')
    sys.exit(0)

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def save(d,name):
    d.to_csv(OUT/(name+'.csv'),index=False,encoding='utf-8-sig')

# 원본 23개 컬럼 전체의 문자열 값으로만 중복을 판정합니다.
from data_pipeline import load_and_clean
result=load_and_clean(DATA, OUT)
clean=result['clean']
baseline=result['baseline']
preprocessing=result['preprocessing']
quality=result['quality']
before_quality=result['before_quality']
file_quality=result['file_quality']
manifest=result['manifest']
old_keys=result['legacy_keys']
overlap=result['dedup_file_summary']
save(quality,'연도별_관측건수_특성반복')
save(pd.DataFrame(manifest),'원본파일_매니페스트')
save(file_quality,'원본파일별_완전일치반복')
save(result['dedup_file_summary'],'중복제거_파일별')
save(result['sensitivity'],'중복제거_전후_연간민감도')
save(result['coverage'],'월별건수_날짜범위')
save(pd.DataFrame(preprocessing.items(),columns=['item','value']),'전처리요약')

districts=sorted(clean.DISTRICT.dropna().unique())
uses=sorted(clean.BUILDING_USE.dropna().unique())
assert len(districts)==25 and len(uses)==4
area_labels=['30㎡ 미만','30~60㎡ 미만','60~85㎡ 미만','85~135㎡ 미만','135㎡ 이상']
clean['AREA']=pd.cut(clean.RENT_AREA,[0,30,60,85,135,np.inf],right=False,labels=area_labels)
assert clean.AREA.notna().all()
maps={'DISTRICT':{v:i+1 for i,v in enumerate(districts)},'BUILDING_USE':{v:i+1 for i,v in enumerate(uses)},
      'AREA':{v:i+1 for i,v in enumerate(area_labels)}}
monthly_parts,annual_parts=[],[]
dims=['DISTRICT','BUILDING_USE','AREA']
for bits in itertools.product([False,True],repeat=3):
    group_dims=[d for d,on in zip(dims,bits) if on]
    # 각 필터 조합을 원자료에서 직접 집계합니다. 중앙값끼리 재집계하지 않습니다.
    g=clean.groupby(['MONTH']+group_dims,observed=True,dropna=True)
    m=g.agg(MEDIAN=('PRICE','median'),N=('PRICE','size')).reset_index()
    mq=g['PRICE'].quantile([.25,.75]).unstack().reset_index().rename(columns={.25:'P25',.75:'P75'})
    m=m.merge(mq,on=['MONTH']+group_dims)
    gy=clean.groupby(['YEAR']+group_dims,observed=True,dropna=True)
    a=gy.agg(MEDIAN=('PRICE','median'),DEPOSIT_MEDIAN=('GRFE','median'),N=('PRICE','size')).reset_index()
    aq=gy[['PRICE','GRFE']].quantile([.1,.25,.75,.9]).unstack()
    aq.columns=[('PRICE' if c=='PRICE' else 'DEPOSIT')+'_P'+str(int(q*100)) for c,q in aq.columns]
    a=a.merge(aq.reset_index(),on=['YEAR']+group_dims)
    for name,on in zip(dims,bits):
        if not on:
            m[name]='전체'; a[name]='전체'
        m[name+'_ID']=0 if not on else m[name].map(maps[name]).astype(int)
        a[name+'_ID']=0 if not on else a[name].map(maps[name]).astype(int)
    monthly_parts.append(m); annual_parts.append(a)
    print('Aggregated',group_dims,len(m),len(a),flush=True)
monthly=pd.concat(monthly_parts,ignore_index=True)
annual=pd.concat(annual_parts,ignore_index=True)
monthly['TIME_ID']=pd.PeriodIndex(monthly.MONTH,freq='M').asi8-pd.Period('2021-01',freq='M').ordinal
annual['TIME_ID']=annual.YEAR-2021
save(monthly,'월별_전체필터조합_집계')
save(annual,'연간_전체필터조합_집계_분포')
base=annual.loc[annual.TIME_ID.eq(0),['DISTRICT_ID','BUILDING_USE_ID','AREA_ID','MEDIAN']].rename(columns={'MEDIAN':'MEDIAN_2021'})
changes=annual.merge(base,on=['DISTRICT_ID','BUILDING_USE_ID','AREA_ID'],how='left')
changes['CHANGE_2021_PCT']=(changes.MEDIAN/changes.MEDIAN_2021-1)*100
prior=annual[['TIME_ID','DISTRICT_ID','BUILDING_USE_ID','AREA_ID','MEDIAN']].copy()
prior.TIME_ID+=1
prior=prior.rename(columns={'MEDIAN':'PRIOR_MEDIAN'})
changes=changes.merge(prior,on=['TIME_ID','DISTRICT_ID','BUILDING_USE_ID','AREA_ID'],how='left')
changes['YOY_PCT']=(changes.MEDIAN/changes.PRIOR_MEDIAN-1)*100
save(changes[['YEAR','DISTRICT','BUILDING_USE','AREA','MEDIAN','DEPOSIT_MEDIAN','N','CHANGE_2021_PCT','YOY_PCT']],'연간_변화율_전체필터조합')

geo=json.loads((HERE/'geography'/'seoul_districts_compact.geojson').read_text(encoding='utf-8'))
geo_meta=json.loads((HERE/'geography'/'provenance.json').read_text(encoding='utf-8'))
assert sorted(f['properties']['name'] for f in geo['features'])==districts
monthly_columns=['TIME_ID','DISTRICT_ID','BUILDING_USE_ID','AREA_ID','MEDIAN','N','P25','P75']
annual_columns=['TIME_ID','DISTRICT_ID','BUILDING_USE_ID','AREA_ID','MEDIAN','DEPOSIT_MEDIAN','N',
    'PRICE_P10','PRICE_P25','PRICE_P75','PRICE_P90','DEPOSIT_P10','DEPOSIT_P25','DEPOSIT_P75','DEPOSIT_P90']
def pack(d,columns):
    # NaN은 JSON null로 바꾸며 실제 관측 행은 HTML에 넣지 않습니다.
    return json.loads(d[columns].to_json(orient='values',double_precision=15))
payload={'districts':['전체 서울']+districts,'uses':['전체 용도']+uses,'areas':['전체 면적']+area_labels,
    'monthlyColumns':monthly_columns,'annualColumns':annual_columns,
    'monthly':pack(monthly,monthly_columns),'annual':pack(annual,annual_columns),
    'geo':geo,'geoSource':geo_meta,'quality':json.loads(quality.to_json(orient='records')),
    'fileQuality':json.loads(file_quality.to_json(orient='records')),'overlap':json.loads(overlap.to_json(orient='records')),
    'preprocessing':preprocessing,'duplicateKeys':old_keys,'files':manifest,
    'beforeQuality':json.loads(before_quality.to_json(orient='records')),
    'sensitivity':json.loads(result['sensitivity'].to_json(orient='records')),
    'dedupColumns':result['original_columns'],
    'notes':{'aggregation':'all supported filter combinations calculated directly from raw rows; yearly medians are not averages of monthly medians',
             'records':'full raw contracts not embedded; only grouped statistics and geographic geometry',
             'duplicates':'strict exact equality of all 23 original fields: keep first; partial-characteristic matches retained; raw-preserved sensitivity reported'}}
(OUT/'dashboard_data.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
render_html(payload)
(OUT/'build_environment.json').write_text(json.dumps({'python':sys.version,'pandas':pd.__version__,'numpy':np.__version__,
    'plotly':plotly.__version__,'rows':len(clean),'monthly_aggregate_rows':len(monthly),'annual_aggregate_rows':len(annual)},ensure_ascii=False,indent=2),encoding='utf-8')
assert int(annual.loc[(annual.DISTRICT_ID==0)&(annual.BUILDING_USE_ID==0)&(annual.AREA_ID==0),'N'].sum())==len(clean)
assert len(monthly.loc[(monthly.DISTRICT_ID==0)&(monthly.BUILDING_USE_ID==0)&(monthly.AREA_ID==0)])==60
print('Built offline dashboard:',len(monthly),'monthly groups;',len(annual),'annual groups',flush=True)
