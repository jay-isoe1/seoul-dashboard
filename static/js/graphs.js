// --------------------------------------------------
// 1) 데이터와 GeoJSON을 동시에 로드
// --------------------------------------------------
queue()
  .defer(d3.json, "/seoul/crime")
  .defer(d3.json, "/static/geojson/seoul-gu.json")
  .await(makeGraphs);

function makeGraphs(error, crimeJson, seoulJson) {
  if (error) {
    console.error("Error loading data:", error);
    return;
  }

  // --------------------------------------------------
  // 2) 데이터 정제 (region_id 반드시 문자열!)
  // --------------------------------------------------
  var data = crimeJson;
  var dateFormat = d3.time.format("%Y-%m-%d");

  data.forEach(function(d) {
    d.year       = +d.year;
    d.crime_rate = +d.crime_rate;
    d.crime_count = +d.crime_count;
    d.pop        = +d.pop;
    d.park_area  = +d.park_area;
    d.gdp        = +d.gdp;
    d.region_id  = String(d.region_id).trim();
    d.region_name = d.region_name;
  });

  // --------------------------------------------------
  // 3) crossfilter 생성
  // --------------------------------------------------
  var ndx = crossfilter(data);


  // --------------------------------------------------
  // region
  // --------------------------------------------------

  var regionNameMap = {};
  data.forEach(function(d) {
    regionNameMap[d.region_id] = d.region_name;
  });
  console.log("regionNameMap:", regionNameMap);


  // --------------------------------------------------
  // sum of crime
  // --------------------------------------------------

  var totalCrimeCount = ndx.groupAll().reduceSum(function(d) {
    return d.crime_count;
  });


  // --------------------------------------------------
  // 4) dimensions
  // --------------------------------------------------
  var yearDim      = ndx.dimension(function(d) { return d.year; });
  var regionIdDim  = ndx.dimension(function(d) { return d.region_id; });
  var crimeRateDim = ndx.dimension(function(d) {
    return Math.round(d.crime_rate / 100) * 100;
  });

  // --------------------------------------------------
  // 5) groups
  // --------------------------------------------------
  var countByYear = yearDim.group().reduceCount();
  var countByRate = crimeRateDim.group().reduceCount();

  // region별로 {sum, count, avg} 유지
  var crimeByRegion = regionIdDim.group().reduce(
    function(p, v) {
      p.sum   += v.crime_rate;
      p.count += 1;
      p.avg    = p.sum / p.count;
      return p;
    },
    function(p, v) {
      p.sum   -= v.crime_rate;
      p.count -= 1;
      p.avg    = p.count ? p.sum / p.count : 0;
      return p;
    },
    function() {
      return { sum: 0, count: 0, avg: 0 };
    }
  );

  // 👉 geoChoropleth에서 쓰기 위한 "평균값 전용 그룹"
  var avgCrimeByRegion = {
    all: function() {
      return crimeByRegion.all().map(function(d) {
        return {
          key:   d.key,
          value: (d.value && !isNaN(d.value.avg)) ? d.value.avg : 0
        };
      });
    }
  };

  // ★★★ 디버깅 로그 추가 ★★★
  console.log("=== avgCrimeByRegion sample ===");
  console.log(avgCrimeByRegion.all().slice(0, 10));

  console.log("rows for 11110:", data.filter(function(d) { return d.region_id === "11110"; }));
  console.log("rows for 11290:", data.filter(function(d) { return d.region_id === "11290"; }));


  var all = ndx.groupAll();

  // domain 계산 (평균값 기준)
  var avgValues = avgCrimeByRegion.all().map(function(d) { return d.value; });
  var yearExtent = d3.extent(data, function(d) { return d.year; });
  var rateExtent = d3.extent(data, function(d) { return d.crime_rate; });
  var minAvg     = d3.min(avgValues);
  var maxAvg     = d3.max(avgValues);

  console.log("minAvg, maxAvg =", minAvg, maxAvg);

  // --------------------------------------------------
  // 6) 차트 선언
  // --------------------------------------------------
  var totalND   = dc.numberDisplay("#total-count-nd");
  var yearChart = dc.barChart("#year-chart");
  var rateChart = dc.barChart("#crime-rate-chart");
  var seoulMap  = dc.geoChoroplethChart("#seoul-map");

  // --------------------------------------------------
  // 7) 총 레코드 수
  // --------------------------------------------------
  totalND
    .formatNumber(d3.format("d"))
    .valueAccessor(function(d) { return d; })
    .group(totalCrimeCount);

  // --------------------------------------------------
  // 8) 연도 BarChart
  // --------------------------------------------------
  yearChart
    .width(600)
    .height(250)
    .dimension(yearDim)
    .group(countByYear)
    .x(d3.scale.linear().domain(yearExtent))
    .elasticY(true)
    .xAxisLabel("Year");

  // --------------------------------------------------
  // 9) 범죄율 히스토그램
  // --------------------------------------------------
  rateChart
    .width(600)
    .height(250)
    .dimension(crimeRateDim)
    .group(countByRate)
    .x(d3.scale.linear().domain(rateExtent))
    .elasticY(true)
    .xAxisLabel("Crime rate");

  // --------------------------------------------------
  // 10) GeoJSON 키 (SIG_CD)
  // --------------------------------------------------
  function featureKey(f) {
    return String(f.properties.SIG_CD).trim();
  }

  // --------------------------------------------------
  // 11) 색 scale (평균값 domain)
  // --------------------------------------------------
  var colorScale = d3.scale.quantize()
    .domain([minAvg, maxAvg])
    .range([
      "#c6dbef",
      "#9ecae1",
      "#6baed6",
      "#4292c6",
      "#2171b5",
      "#08519c",
      "#08306b"
    ]);

  // --------------------------------------------------
  // 12) 지도 크기 + Projection 자동 맞춤
  // --------------------------------------------------
  var mapContainer = document.getElementById("seoul-map");
  var mapWidth  = mapContainer ? mapContainer.clientWidth : 600;
  var mapHeight = 350;

  var projection = d3.geo.mercator()
    .scale(1)
    .translate([0, 0]);

  var path = d3.geo.path().projection(projection);

  var b = path.bounds(seoulJson),
      s = 0.95 / Math.max(
        (b[1][0] - b[0][0]) / mapWidth,
        (b[1][1] - b[0][1]) / mapHeight
      ),
      t = [
        (mapWidth  - s * (b[1][0] + b[0][0])) / 2,
        (mapHeight - s * (b[1][1] + b[0][1])) / 2
      ];

  projection
    .scale(s)
    .translate(t);

  // --------------------------------------------------
  // 13) GeoChoroplethChart
  // --------------------------------------------------
  seoulMap
    .width(mapWidth)
    .height(mapHeight)
    .dimension(regionIdDim)
    .group(avgCrimeByRegion)          // {key, value} 형태, value는 숫자 (평균값)
    .colors(colorScale)
    .colorDomain([minAvg, maxAvg])
    .colorAccessor(function(d) {      // 🔥 d는 "숫자 value" 그대로!
      return d || minAvg;             // d가 0이면 0, undefined면 minAvg
    })
    .overlayGeoJson(seoulJson.features, "region", featureKey)
    .projection(projection)
    .title(function(d) {
      var id = d.key;
      var name = regionNameMap[id] || id;
      var avg = d.value;

      if (!avg || isNaN(avg)) {
        return "Region: " + name + "\nNo data";
      }
      return "Region: " + name + "\nAverage Crime Rate: " + avg.toFixed(2);
    });
  // --------------------------------------------------
  // 14) 모든 차트 렌더링
  // --------------------------------------------------
  dc.renderAll();
}
