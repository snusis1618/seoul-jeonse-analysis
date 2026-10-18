"""저장된 출처 경계에서 오프라인 대시보드용 지도 자료를 재생성합니다."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

import shapely
from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "seoul_municipalities_source_2013.geojson"
SOURCE_URL = "https://raw.githubusercontent.com/southkorea/seoul-maps/master/kostat/2013/json/seoul_municipalities_geo.json"
REPOSITORY_URL = "https://github.com/southkorea/seoul-maps/blob/master/README.md"


def save_json(path: Path, value: object, pretty: bool = False) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               indent=2 if pretty else None,
                               separators=None if pretty else (",", ":")), encoding="utf-8")


def rounded_coordinates(value, digits=7):
    if isinstance(value, (float, int)):
        return round(value, digits)
    return [rounded_coordinates(child, digits) for child in value]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(district_csv: Path | None = None, tolerance: float = 25.0):
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    features = source["features"]
    names = [f["properties"]["name"] for f in features]
    assert len(features) == len(set(names)) == 25, "서울 25개 구 이름이 고유해야 합니다."

    # 경위도 대신 미터 단위 UTM-K 투영에서 경계 축약과 내부 대표점을 계산합니다.
    to_meters = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)
    to_lonlat = Transformer.from_crs("EPSG:5179", "EPSG:4326", always_xy=True)
    original_wgs = [shape(f["geometry"]) for f in features]
    original_meters = [transform(to_meters.transform, geom) for geom in original_wgs]
    assert all(geom.is_valid for geom in original_meters)
    assert shapely.coverage_is_valid(original_meters)

    # 공유 경계를 함께 축약하므로 구 사이에 틈이나 중첩을 만드는 개별 축약을 피합니다.
    # tolerance는 이 함수의 Visvalingam 기반 축약 허용량이며 정밀 측량 오차가 아닙니다.
    simplified = shapely.coverage_simplify(original_meters, tolerance)
    assert shapely.coverage_is_valid(simplified)
    assert all(geom.is_valid and not geom.is_empty for geom in simplified)

    compact, dashboard_compact, points, projected, validation = [], [], [], [], []
    for feature, raw_wgs, raw_m, simple_m in zip(features, original_wgs, original_meters, simplified):
        props = feature["properties"]
        district = props["name"]
        simple_wgs = transform(to_lonlat.transform, simple_m)
        geo = mapping(simple_wgs)
        geo["coordinates"] = rounded_coordinates(geo["coordinates"], 7)
        displayed = shape(geo)

        # 대표점은 원 경계와 표시 경계의 교집합 내부에서 만들고 세 좌표계에서 확인합니다.
        shared = raw_m.intersection(simple_m)
        point_m = shared.representative_point()
        lon, lat = to_lonlat.transform(point_m.x, point_m.y)
        point_wgs = Point(lon, lat)
        assert raw_m.contains(point_m) and simple_m.contains(point_m)
        assert raw_wgs.contains(point_wgs) and displayed.contains(point_wgs)

        compact.append({"type": "Feature", "id": district, "properties": {
            "district": district, "name": district, "source_code": props["code"],
            "source_base_year": props.get("base_year", "2013")}, "geometry": geo})
        points.append({"district": district, "source_code": props["code"],
                       "longitude": lon, "latitude": lat,
                       "x_5179": point_m.x, "y_5179": point_m.y,
                       "inside_source": True, "inside_display": True})
        meter_geo = mapping(simple_m)
        rings = meter_geo["coordinates"] if meter_geo["type"] == "Polygon" else [ring for polygon in meter_geo["coordinates"] for ring in polygon]
        dashboard_compact.append({"type": "Feature", "id": district, "properties": {
            **compact[-1]["properties"], "point": [round(point_m.x, 2), round(point_m.y, 2)],
            "representative_lonlat": [lon, lat], "projected_crs": "EPSG:5179",
            "projected_rings": rounded_coordinates(rings, 2),
            "point_inside_source": True, "point_inside_display": True}, "geometry": geo})
        projected.append({"district": district, "type": meter_geo["type"],
                          "coordinates": rounded_coordinates(meter_geo["coordinates"], 2),
                          "x": round(point_m.x, 2), "y": round(point_m.y, 2)})
        validation.append({"district": district, "valid_source": raw_wgs.is_valid,
                           "valid_display": displayed.is_valid,
                           "representative_point_inside_source": raw_wgs.contains(point_wgs),
                           "representative_point_inside_display": displayed.contains(point_wgs),
                           "area_ratio_display_to_source": simple_m.area / raw_m.area})

    match = None
    if district_csv:
        with district_csv.open(encoding="utf-8-sig", newline="") as file:
            table = list(csv.DictReader(file))
        key = next((key for key in ("DISTRICT", "district", "SGG_NM", "자치구명") if key in table[0]), None)
        if key is None:
            raise ValueError("확인할 자치구명 열이 없습니다.")
        expected = {row[key] for row in table if row[key]}
        match = {"file": str(district_csv), "column": key,
                 "geography_only": sorted(set(names) - expected),
                 "analysis_only": sorted(expected - set(names)),
                 "matched_count": len(set(names) & expected)}
        assert set(names) == expected, match

    save_json(HERE / "seoul_25_districts_wgs84.geojson", {"type": "FeatureCollection", "features": compact})
    save_json(HERE / "seoul_districts_compact.geojson", {"type": "FeatureCollection", "features": dashboard_compact})
    save_json(HERE / "district_representative_points.json", points)
    with (HERE / "district_representative_points.csv").open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=list(points[0]))
        writer.writeheader()
        writer.writerows(points)
    bounds = [min(g.bounds[0] for g in simplified), min(g.bounds[1] for g in simplified),
              max(g.bounds[2] for g in simplified), max(g.bounds[3] for g in simplified)]
    save_json(HERE / "seoul_map_projected.json", {"crs": "EPSG:5179", "units": "meters",
                                                "bbox": bounds, "districts": projected})

    metadata = {
        "asset_title": "서울 25개 자치구 도식 경계 및 내부 대표점",
        "original_creator": "통계청(KOSTAT), 센서스용 행정구역경계",
        "redistributor": "southkorea/seoul-maps; contributor Lucy Park",
        "boundary_vintage": "2013 (저장소 base_year 값과 README에서 확인)",
        "source_url": SOURCE_URL,
        "source_documentation_url": REPOSITORY_URL,
        "upstream_service_url": "https://sgis.mods.go.kr/view/pss/openDataIntrcn",
        "repository_declared_license": "Apache License v2.0 (repository README declaration)",
        "license_caution": "Apache v2.0는 재배포 저장소의 선언이다. 통계청 원자료의 별도 법적 이용조건 전체를 이 확인으로 대체하지 않는다.",
        "retrieved_date_client_context": "2026-10-10",
        "source_coordinates": "WGS84 경위도 EPSG:4326, x=경도 y=위도",
        "projection_for_preparation": "EPSG:5179 / Korea 2000 Unified CS, 미터",
        "display_simplification": {"method": "shapely.coverage_simplify (shared-boundary preserving)",
                                   "tolerance": tolerance, "projection_units": "meters",
                                   "rounding_wgs84_decimals": 7},
        "representative_point_method": "EPSG:5179 원 경계와 표시 경계 교집합의 Shapely representative_point(), 양쪽 polygon 내부 검증",
        "point_interpretation": "자치구 집계값 표시를 위한 내부 대표점이며 구청 위치·행정 중심·개별 계약 위치가 아니다.",
        "source_code_caution": "source_code는 2013 KOSTAT 경계 식별 코드이며 전월세 원자료 SGG_CD와 동일한 코드 체계라고 가정하지 않는다. 결합은 검증된 자치구명으로 수행한다.",
        "limitations": ["2013년 경계를 도식 배경으로 사용하며 2021~2025년의 연도별 법적 경계를 재현하지 않는다.",
                        "경계 축약은 정밀 위치 판단 또는 면적 측정에 적합하지 않다.",
                        "25개 자치구명은 분석 결과와 일치하지만 미세 경계 변경 여부를 뜻하지 않는다."],
        "validation": {"features": 25, "all_unique_district_names": True,
                       "source_projected_coverage_valid": True, "display_projected_coverage_valid": True,
                       "all_points_inside_source_and_display": True, "analysis_name_match": match,
                       "by_district": validation},
        "sha256": {name: sha256(HERE / name) for name in (
            "seoul_municipalities_source_2013.geojson", "seoul_25_districts_wgs84.geojson", "seoul_districts_compact.geojson",
            "district_representative_points.json", "seoul_map_projected.json")},
        "software": {"shapely": shapely.__version__},
    }
    save_json(HERE / "provenance.json", metadata, pretty=True)
    print(json.dumps({"features": 25, "matched_analysis_districts": match and match["matched_count"],
                      "compact_geojson_bytes": (HERE / "seoul_25_districts_wgs84.geojson").stat().st_size,
                      "all_points_inside": True}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--district-csv", type=Path)
    parser.add_argument("--tolerance", type=float, default=25.0)
    args = parser.parse_args()
    build(args.district_csv, args.tolerance)
