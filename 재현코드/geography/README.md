# 서울 자치구 지도 자료

지도는 통계청 센서스용 **2013년** 시군구 경계를 GeoJSON으로 재배포한 [southkorea/seoul-maps](https://github.com/southkorea/seoul-maps/blob/master/README.md)를 사용합니다. 원본 [GeoJSON 다운로드 주소](https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo.json)와 저장본 SHA-256은 `provenance.json`에 있습니다. 원 제공기관의 [SGIS 자료제공 안내](https://sgis.mods.go.kr/view/pss/openDataIntrcn)도 기록했습니다.

저장소 README는 원출처·2013년 시점 및 Apache v2.0 라이선스를 명시합니다. 이는 재배포 저장소의 선언이며 통계청 원자료에 관한 별도 이용조건 전체를 대신 확인한 것은 아닙니다. 원 제작: 통계청(KOSTAT). 재배포/변환: southkorea/seoul-maps, Lucy Park. 대시보드 가공: 미터 단위 EPSG:5179에서 공유 경계를 보존하는 단순화, WGS84 변환, 내부 대표점 생성.

**이 경계는 서울 25개 구의 도식 배경입니다. 2021~2025년의 연도별 법적 경계를 재현하지 않습니다.** 경계의 미세 변경이나 정확한 면적·개별 주소의 소속을 판정하는 용도로 사용하지 않습니다. 자치구명 25개가 기존 분석 `자치구_연간집계.csv`와 일치함을 확인했습니다. 경계 코드와 계약 자료의 자치구 코드는 같은 체계라고 가정하지 않습니다.

대표점은 EPSG:5179 투영의 원 경계와 표시 경계 교집합에서 `representative_point()`로 생성했습니다. 원본과 단순화본 모두에서 **25개 점이 각 구 내부**임을 검증했습니다. 대표점은 구청·행정 중심·개별 계약 위치가 아닌 집계값 표시점입니다. 타일이나 인터넷 연결 없이 경계와 점을 그릴 수 있습니다.

## 파일

- `seoul_municipalities_source_2013.geojson`: 내려받은 파일을 수정하지 않은 출처 저장본.
- `seoul_25_districts_wgs84.geojson`: 표시용 축약 GeoJSON, WGS84 경위도.
- `seoul_districts_compact.geojson`: 위 WGS84 GeoJSON에 평면 지도용 `properties.projected_rings`, 내부 대표점 `properties.point`(EPSG:5179), `representative_lonlat`(WGS84)를 추가한 대시보드 입력본. `geometry` 자체는 WGS84입니다.
- `seoul_map_projected.json`: SVG 등 평면 지도용 EPSG:5179 경계·점·전체 bbox. x는 동쪽, y는 북쪽이며 화면 표시에서 y를 반전합니다.
- `district_representative_points.json` / `.csv`: 25개 내부 대표점 경위도·투영좌표.
- `provenance.json`: 출처·라이선스 선언·가공법·해시·검증 결과.
- `NOTICE.txt` / `APACHE-2.0.txt`: 원출처·기여자·변경사항 및 Apache 2.0 표준 라이선스 본문.
- `prepare_geography.py`: 저장된 출처 GeoJSON을 읽어 모든 표시용 자료를 재생성. 다운로드나 서버가 필요하지 않습니다.

## 재생성

Python 3.11, Shapely 2.1 이상, pyproj가 필요합니다. 이 명령은 이 폴더의 가공 자료만 갱신하며 계약 원자료는 수정하지 않습니다.

```powershell
python prepare_geography.py --district-csv "..\..\집계표\자치구_연간집계.csv"
```

공유 경계 전체를 함께 단순화한 결과가 유효한 polygon coverage인지, 개별 polygon이 유효한지, 내부 대표점이 원 경계·표시 경계 안에 있는지 확인한 후 결과를 기록합니다.
