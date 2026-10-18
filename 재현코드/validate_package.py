"""제출 파일 사이의 수치 일치, 원자료 보존, 실행 결과를 확인합니다."""
from pathlib import Path
import hashlib, json, re
import nbformat
import numpy as np
import pandas as pd

PACK=Path(__file__).resolve().parent.parent
TABLE=PACK/'집계표'
checks=[]
def check(name, condition):
    assert bool(condition), name
    checks.append({'name':name,'passed':True})
def read(name):return pd.read_csv(TABLE/(name+'.csv'))
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

manifest=read('원본파일_매니페스트')
for row in manifest.itertuples():
    check('입력 보존 SHA256: '+row.file,sha(PACK/'자료'/row.file)==row.sha256)
files=read('중복제거_파일별')
check('입력 3,238,096행',files.N.sum()==3238096)
check('원본23필드 추가 반복 452,458행',files.EXACT_EXTRA_ROWS.sum()==452458)
check('파일내/파일간 반복 구분', (files.EXACT_EXTRA_ROWS==files.WITHIN_FILE_EXTRA_ROWS+files.CROSS_FILE_EXTRA_ROWS).all())
check('중복 비교컬럼 23개',len(read('중복제거_비교컬럼23개'))==23)
sens=read('중복제거_전후_연간민감도')
annual=read('서울_연간집계')
monthly=read('서울_월별집계')
check('주분석 1,279,501행',annual.N.sum()==1279501)
check('원자료 유지 비교 1,457,785행',sens.BEFORE_N.sum()==1457785)
check('민감도와 주분석 건수 일치',np.array_equal(annual.N,sens.AFTER_N))
check('민감도와 주분석 중앙값 일치',np.allclose(annual.MEDIAN,sens.AFTER_MEDIAN))
check('60개월 관측',len(monthly)==60 and monthly.N.gt(0).all())
check('연간/월간 건수 합 일치',np.array_equal(monthly.assign(YEAR=monthly.MONTH.str[:4].astype(int)).groupby('YEAR').N.sum(),annual.N))
quality=read('연도별_관측건수_특성반복')
check('일부 특성만 같은 기록 유지',quality.KEY_REPEAT_N.gt(0).all())

payload=json.loads((PACK/'재현코드'/'dashboard_data.json').read_text(encoding='utf-8'))
a=pd.DataFrame(payload['annual'],columns=payload['annualColumns'])
m=pd.DataFrame(payload['monthly'],columns=payload['monthlyColumns'])
ids=['DISTRICT_ID','BUILDING_USE_ID','AREA_ID']
whole=a[a[ids].eq(0).all(axis=1)].sort_values('TIME_ID')
whole_m=m[m[ids].eq(0).all(axis=1)].sort_values('TIME_ID')
check('HTML용 집계와 Notebook 연간 일치',np.allclose(whole.MEDIAN,annual.MEDIAN) and np.array_equal(whole.N,annual.N))
check('HTML용 집계와 Notebook 월간 일치',np.allclose(whole_m.MEDIAN,monthly.MEDIAN) and np.array_equal(whole_m.N,monthly.N))
for dimension in ids:
    rest=[c for c in ids if c!=dimension]
    q=a[a[dimension].gt(0)&a[rest].eq(0).all(axis=1)].groupby('TIME_ID').N.sum()
    if dimension=='DISTRICT_ID':
        # 자치구 미상은 서울 전체에는 포함하고 구별 비교에서만 제외했습니다.
        missing=whole.set_index('TIME_ID').N-q
        check('자치구별 합 차이는 미상 2행',missing.ge(0).all() and missing.sum()==payload['preprocessing']['unknown_district_N']==2)
    else:
        check(dimension+'별 건수 분할 합 일치',np.array_equal(q,whole.N))
check('가격 분위수 순서',a[['PRICE_P10','PRICE_P25','MEDIAN','PRICE_P75','PRICE_P90']].diff(axis=1).iloc[:,1:].ge(0).all().all())
check('자치구25개/용도4개',len(payload['districts'])==26 and len(payload['uses'])==5)
changes=read('연간_변화율_전체필터조합')
check('2021년 전년 대비 없음',changes.loc[changes.YEAR.eq(2021),'YOY_PCT'].isna().all())
check('2021년 기준 대비 0',changes.loc[changes.YEAR.eq(2021),'CHANGE_2021_PCT'].eq(0).all())
html=(PACK/'서울시_전세가격_인터랙티브_대시보드.html').read_text(encoding='utf-8')
match=re.search(r'<script[^>]*id="dashboard-data"[^>]*>(.*?)</script>',html,re.S)
check('완성 HTML에 최신 집계 내장',match is not None and json.loads(match.group(1))==payload)
check('원자료 비내장',len(payload['annual'])<4000 and len(payload['monthly'])<50000 and 'SOURCE_ROW' not in html)
nb=nbformat.read(PACK/'서울시_전세가격분석.ipynb',as_version=4)
nbformat.validate(nb)
code_cells=[c for c in nb.cells if c.cell_type=='code']
check('Notebook 모든 코드 실행됨',all(c.execution_count is not None for c in code_cells))
check('Notebook 실행 오류 없음',all(o.output_type!='error' for c in code_cells for o in c.outputs))
check('write_html 그래프3개',sum(c.source.count('.write_html(') for c in code_cells)==3 and len(list((PACK/'개별그래프_HTML').glob('*.html')))==3)
for f in (PACK/'개별그래프_HTML').glob('*.html'):
    check('독립 실행 Plotly: '+f.name,'plotly.js' in f.read_text(encoding='utf-8') and f.stat().st_size>4000000)
pdf=(PACK/'분석보고서.pdf').read_bytes()
check('보고서 A4 한 페이지',len(re.findall(rb'/Type\s*/Page\b',pdf))==1)
output=PACK/'재현코드'/'검증기록'/'data_validation.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
print('PASS:',len(checks),'data/package checks')
