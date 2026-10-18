"""원자료 보존 + 원본 23필드 완전일치 행만 1행 유지하는 공통 전처리."""
from pathlib import Path
import hashlib, gc, json
import numpy as np
import pandas as pd

RENAME={'접수년도':'RCPT_YR','계약일':'CTRT_DAY','자치구명':'DISTRICT','법정동명':'DONG',
        '본번':'MAIN_NO','부번':'SUB_NO','층':'FLOOR','건물명':'BUILDING','전월세구분':'RENT_TYPE',
        '임대면적':'RENT_AREA','보증금(만원)':'GRFE','임대료(만원)':'MONTHLY_RENT','건물용도':'BUILDING_USE'}
LEGACY_KEYS=['DISTRICT','DONG','MAIN_NO','SUB_NO','FLOOR','BUILDING','CONTRACT_DATE',
             'RENT_TYPE','GRFE','RENT_AREA','MONTHLY_RENT','BUILDING_USE']
def sha256(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def load_and_clean(data_dir,output_dir=None):
    data_dir=Path(data_dir)
    out=Path(output_dir) if output_dir is not None else None
    if out is not None:out.mkdir(parents=True,exist_ok=True)
    def save(table,name):
        if out is not None:table.to_csv(out/(name+'.csv'),index=False,encoding='utf-8-sig')
    parts,manifest,columns=[],[],None
    for year in range(2021,2026):
        path=data_dir/f'서울특별시_전월세가_{year}.{"txt" if year==2021 else "csv"}'
        encoding='utf-8-sig' if year==2023 else 'cp949'
        # 문자열 그대로 읽습니다. 빈칸과 'NA' 문자열을 합치거나 공백을 지우지 않습니다.
        frame=pd.read_csv(path,encoding=encoding,dtype=str,keep_default_na=False)
        if columns is None:columns=frame.columns.tolist()
        assert frame.columns.tolist()==columns,'파일별 원본 컬럼 구조가 다릅니다.'
        assert len(columns)==23 and set(RENAME).issubset(columns)
        manifest.append({'file':path.name,'encoding':encoding,'N':len(frame),'sha256':sha256(path)})
        # 같은 문자열의 반복 저장을 줄이는 메모리 절약 방식이며 관측 삭제가 아닙니다.
        frame=frame.astype('category')
        frame['SOURCE_FILE']=path.name
        frame['SOURCE_ROW']=np.arange(2,len(frame)+2,dtype=np.uint32)
        parts.append(frame)
        print('Read original',year,len(frame),flush=True)
    raw=pd.DataFrame({c:pd.api.types.union_categoricals([p[c].array for p in parts]) for c in columns})
    raw['SOURCE_FILE']=pd.Categorical(np.concatenate([p['SOURCE_FILE'].to_numpy() for p in parts]))
    raw['SOURCE_ROW']=np.concatenate([p['SOURCE_ROW'].to_numpy() for p in parts])
    del parts,frame
    gc.collect()

    # 판정은 파생 변수 생성/형변환/공백 정리 전에 원본 23필드에만 적용합니다.
    # 접수년도도 포함합니다. 출처 파일명과 추가 행번호는 비교 대상이 아닙니다.
    # 같은 집단의 첫 행을 남깁니다(파일 2021→2025, 파일 내 기존 행 순서).
    extra=raw.duplicated(subset=columns,keep='first')
    repeated=raw.duplicated(subset=columns,keep=False)
    within_extra=raw.duplicated(subset=columns+['SOURCE_FILE'],keep='first')
    within_all=raw.duplicated(subset=columns+['SOURCE_FILE'],keep=False)
    file_work=pd.DataFrame({'SOURCE_FILE':raw.SOURCE_FILE,'N':1,'EXACT_EXTRA_ROWS':extra.astype(int),
        'EXACT_REPEAT_ROWS':repeated.astype(int),'WITHIN_FILE_REPEAT_ROWS':within_all.astype(int),
        'WITHIN_FILE_EXTRA_ROWS':within_extra.astype(int)})
    file_quality=file_work.groupby('SOURCE_FILE',observed=True).sum().reset_index()
    dedup_files=file_quality[['SOURCE_FILE','N','EXACT_EXTRA_ROWS','WITHIN_FILE_EXTRA_ROWS']].copy()
    dedup_files['CROSS_FILE_EXTRA_ROWS']=dedup_files.EXACT_EXTRA_ROWS-dedup_files.WITHIN_FILE_EXTRA_ROWS
    dedup_files['RETAINED_N']=dedup_files.N-dedup_files.EXACT_EXTRA_ROWS
    save(dedup_files,'중복제거_파일별')
    save(pd.DataFrame({'원본 비교 컬럼':columns}),'중복제거_비교컬럼23개')
    save(pd.DataFrame(manifest),'원본파일_매니페스트')
    raw_n=len(raw)
    # 이미 원본 전체로 판정한 유지/제외 표시를 이후 분석 필터에 적용합니다.
    d=raw[list(RENAME)+['SOURCE_FILE','SOURCE_ROW']].rename(columns=RENAME).copy()
    d['EXACT_EXTRA']=extra.to_numpy()
    del raw,file_work,within_extra,within_all
    gc.collect()
    d['CTRT_DAY']=pd.to_datetime(d.CTRT_DAY.astype('string'),format='%Y%m%d',errors='coerce')
    d['RCPT_YR']=pd.to_numeric(d.RCPT_YR.astype('string'),errors='coerce')
    for c in ['DISTRICT','BUILDING_USE','RENT_TYPE']:
        d[c]=d[c].astype('string').str.strip().replace('',pd.NA).astype('category')
    for c in ['GRFE','RENT_AREA','MONTHLY_RENT']:
        d[c]=pd.to_numeric(d[c].astype('string').str.replace(',','',regex=False),errors='coerce').astype(float)
    period=d.CTRT_DAY.between('2021-01-01','2025-12-31')
    is_jeonse=d.RENT_TYPE.eq('전세')
    valid_price=d.GRFE.gt(0)&d.RENT_AREA.gt(0)
    keep=~d.EXACT_EXTRA
    base=d.loc[period&is_jeonse&valid_price].copy()
    base['PRICE']=base.GRFE/base.RENT_AREA
    base['YEAR']=base.CTRT_DAY.dt.year.astype(int)
    base['MONTH']=base.CTRT_DAY.dt.to_period('M').astype(str)
    base['QUARTER']=base.CTRT_DAY.dt.to_period('Q').astype(str)
    keys=['CTRT_DAY' if k=='CONTRACT_DATE' else k for k in LEGACY_KEYS]
    comparison=base[keys].copy()
    for c in ['DONG','MAIN_NO','SUB_NO','FLOOR','BUILDING']:
        comparison[c]=comparison[c].astype('string').replace(['','NA','N/A','NULL','NaN','nan'],pd.NA)
    base['KEY_REPEAT']=comparison.duplicated(keys,keep=False)
    before_quality=base.groupby('YEAR').agg(N=('PRICE','size'),KEY_REPEAT_N=('KEY_REPEAT','sum')).reset_index()
    before_quality['KEY_REPEAT_PCT']=before_quality.KEY_REPEAT_N/before_quality.N*100
    clean=base.loc[~base.EXACT_EXTRA].copy()
    clean['KEY_REPEAT']=comparison.loc[clean.index].duplicated(keys,keep=False)
    quality=clean.groupby('YEAR').agg(N=('PRICE','size'),KEY_REPEAT_N=('KEY_REPEAT','sum')).reset_index()
    quality['KEY_REPEAT_PCT']=quality.KEY_REPEAT_N/quality.N*100
    # 일부 특성이 같은 집단은 점검만 하고 추가 삭제하지 않습니다.
    assert len(clean)==int((period&is_jeonse&valid_price&keep).sum())
    reasons={
        '보증금 결측/숫자변환 실패':d.GRFE.isna(), '보증금 0 이하':d.GRFE.le(0),
        '면적 결측/숫자변환 실패':d.RENT_AREA.isna(), '면적 0 이하':d.RENT_AREA.le(0)}
    exclusions=pd.DataFrame([{'이유':name,'N':int((mask&period&is_jeonse&keep).sum())} for name,mask in reasons.items()])
    save(exclusions,'보증금면적_제외이유별')
    preprocessing={'raw_N':raw_n,'exact_removed_N':int(extra.sum()),'unique_record_N':int(keep.sum()),
        'period_N':int((period&keep).sum()),'date_invalid_N':int((d.CTRT_DAY.isna()&keep).sum()),
        'out_of_period_N':int((~period&d.CTRT_DAY.notna()&keep).sum()),'jeonse_N':int((period&is_jeonse&keep).sum()),
        'invalid_deposit_area_N':int((period&is_jeonse&~valid_price&keep).sum()),'analysis_N':len(clean),
        'baseline_analysis_N':len(base),'analysis_removed_N':len(base)-len(clean),
        'positive_monthly_rent_N':int(clean.MONTHLY_RENT.gt(0).sum()),'unknown_district_N':int(clean.DISTRICT.isna().sum()),
        'rent_type_values':d.RENT_TYPE.astype('string').fillna('(결측)').value_counts().to_dict(),
        'dedup_rule':'원본 23개 컬럼의 파싱된 문자열 값이 전부 같은 경우 첫 행만 유지'}
    annual_before=base.groupby('YEAR').agg(BEFORE_N=('PRICE','size'),BEFORE_MEDIAN=('PRICE','median'),
        BEFORE_DEPOSIT_MEDIAN=('GRFE','median')).reset_index()
    annual_after=clean.groupby('YEAR').agg(AFTER_N=('PRICE','size'),AFTER_MEDIAN=('PRICE','median'),
        AFTER_DEPOSIT_MEDIAN=('GRFE','median')).reset_index()
    sensitivity=annual_before.merge(annual_after,on='YEAR')
    sensitivity['REMOVED_N']=sensitivity.BEFORE_N-sensitivity.AFTER_N
    sensitivity['MEDIAN_DIFF']=sensitivity.AFTER_MEDIAN-sensitivity.BEFORE_MEDIAN
    sensitivity['BEFORE_INDEX_2021']=sensitivity.BEFORE_MEDIAN/sensitivity.BEFORE_MEDIAN.iloc[0]*100
    sensitivity['AFTER_INDEX_2021']=sensitivity.AFTER_MEDIAN/sensitivity.AFTER_MEDIAN.iloc[0]*100
    calendar=pd.period_range('2021-01','2025-12',freq='M').astype(str)
    coverage=clean.groupby('MONTH').agg(N=('PRICE','size'),FIRST_DATE=('CTRT_DAY','min'),LAST_DATE=('CTRT_DAY','max')).reindex(calendar).rename_axis('MONTH').reset_index()
    coverage['N']=coverage.N.fillna(0).astype(int)
    late=clean.assign(RECEIPT_GAP=clean.RCPT_YR-clean.YEAR)
    save(pd.crosstab(late.YEAR,late.RECEIPT_GAP).reset_index(),'계약연도별_접수연도차')
    # 추적 가능한 표와 정책을 함께 보관합니다. 원본 파일은 수정하지 않습니다.
    save(pd.DataFrame(preprocessing.items(),columns=['item','value']),'전처리요약')
    save(sensitivity,'중복제거_전후_연간민감도')
    save(quality,'연도별_관측건수_특성반복')
    save(before_quality,'제거전_연도별_특성반복')
    save(coverage,'월별건수_날짜범위')
    monthly_s=[]
    for label,frame in [('원자료 유지',base),('원본23개 완전일치 제거',clean)]:
        q=frame.groupby('MONTH').agg(MEDIAN=('PRICE','median'),N=('PRICE','size')).reset_index()
        q['SCENARIO']=label
        monthly_s.append(q)
    save(pd.concat(monthly_s,ignore_index=True),'중복제거_전후_월별민감도')
    print('Exact removed all types:',int(extra.sum()),'price-valid jeonse:',len(base),'->',len(clean),flush=True)
    return {'clean':clean,'baseline':base,'preprocessing':preprocessing,'manifest':manifest,
        'quality':quality,'before_quality':before_quality,'file_quality':file_quality,'dedup_file_summary':dedup_files,
        'sensitivity':sensitivity,'coverage':coverage,'original_columns':columns,'legacy_keys':LEGACY_KEYS}
