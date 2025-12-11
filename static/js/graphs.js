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
  // 4) dimensions
  // --------------------------------------------------
  var yearDim      = ndx.dimension(function(d) { return d.year; });
  var regionIdDim  = ndx.dimension(function(d) { return d.region_id; });
  
  //distribution dimensions
  var crimeRateDim = ndx.dimension(function(d) {
    return Math.round(d.crime_rate / 100) * 100;
  });
  
  var parkAreaDim = ndx.dimension(function(d) {
    return d.park_area;
  });

  var gdpDim = ndx.dimension(function(d) {
    return d.gdp;
  }); 

  // --------------------------------------------------
  // 5) groups
  // --------------------------------------------------
  var countByYear = yearDim.group().reduceCount();
  var crimeRateGroup = crimeRateDim.group().reduceCount();
  var parkAReaGroup = parkAreaDim.group().reduceCount();
  var gdpGroup = gdpDim.group().reduceCount();

  

  // region-specific {sum, count, avg} 유지
  var statsByRegion = regionIdDim.group().reduce(
    function(p, v) {
      p.crime_sum   += v.crime_rate;
      p.park_sum  += v.park_area;
      p.gdp_sum    += v.gdp;
      p.count += 1;
      
      
      p.crime_avg    = p.crime_sum / p.count;
      p.park_avg    = p.park_sum / p.count;
      p.gdp_avg    = p.gdp_sum / p.count;
      return p;
    },
    //remove
    function(p, v) {
      p.crime_sum   -= v.crime_rate;
      p.park_sum  -= v.park_area;
      p.gdp_sum    -= v.gdp; 
      p.count -= 1;

      p.crime_avg    = p.count ? p.crime_sum / p.count : 0;
      p.park_avg   = p.count ? p.park_sum / p.count : 0;
      p.gdp_avg    = p.count ? p.gdp_sum / p.count : 0;
      return p;
    },

    //init
    function() {
      return { 
        crime_sum: 0, park_sum: 0, gdp_sum: 0,
        crime_avg: 0, park_avg: 0, gdp_avg: 0,
        count: 0
      };
    }
  );

  var totalCrime = ndx.groupAll().reduceSum(function(d) {
    return d.crime_rate;
  });

  var totalPark = ndx.groupAll().reduceSum(function(d) { 
    return d.park_area;
  });

  var totalGdp = ndx.groupAll().reduceSum(function(d) {
    return d.gdp;
  });


  var totalsGroup = ndx.groupAll().reduce(
    function(p, v) {
      p.crime_sum   += v.crime_rate;
      p.park_sum  += v.park_area;
      p.gdp_sum    += v.gdp;
      return p;
    },
    function(p, v) {
      p.crime_sum   -= v.crime_rate;
      p.park_sum -= v.park_area;
      p.gdp_sum   -= v.gdp;
      return p;
    },
    function() {
      return { 
        crime_sum: 0, park_sum: 0, gdp_sum: 0
      };
    }
  );

  //Extent cal
  var yearExtent = d3.extent(data, function(d) {
    return d.year;
  });
  
  var rateExtent = d3.extent(data, function(d) {
    return d.crime_rate;
  });

  var parkExtent = d3.extent(data, function(d) {
    return d.park_area;
  });

  var gdpExtent = d3.extent(data, function(d) {
    return d.gdp;
  });
  
  // --------------------------------------------------
  // Metric
  // --------------------------------------------------
  var currentMetric = "crime_rate";

  var metricConfig = {
    "crime_rate": {
      label: "Crime Rate",
      dim: crimeRateDim,
      group: crimeRateGroup,
      extent: rateExtent,
      mapAccessor: function(stats) {
        return stats.crime_avg;
      },
      totalKey: "crime_sum",
      colors: [
      "#fee5d9",
      "#fcbba1",
      "#fc9272",
      "#fb6a4a",
      "#de2d26",
      "#a50f15"
      ]
   },

    "park_area": {
      label: "Park Area",
      dim: parkAreaDim,
      group: parkAReaGroup,
      extent: parkExtent,
      mapAccessor: function(stats) {
        return stats.park_avg;
      },
      totalKey: "park_sum",
      colors: [
      "#e5f5e0",
      "#c7e9c0",
      "#a1d99b",
      "#74c476",
      "#31a354",
      "#006d2c"
      ] 
  }, 

    "gdp": { 
      label: "GDP",
      dim: gdpDim,
      group: gdpGroup,
      extent: gdpExtent,
      mapAccessor: function(stats) {
        return stats.gdp_avg;
      },
      totalKey: "gdp_sum",
      colors: [
      "#c6dbef",
      "#9ecae1",
      "#6baed6",
      "#4292c6",
      "#2171b5",
      "#08519c"
     ] 
    } 
  };

  // --------------------------------------------------
  // map-group
  // --------------------------------------------------

  var metricMapGroup = {
    all: function () {
      var conf = metricConfig[currentMetric];
      return statsByRegion.all().map(function(d) {
        var stats = d.value || {};
        var val = conf.mapAccessor(stats) || 0;
        return { key: d.key, value: val };
      });
    }
  };

  // --------------------------------------------------
  // 9) chart
  // --------------------------------------------------
  var totalND   = dc.numberDisplay("#total-count-nd");
  var yearChart = dc.barChart("#year-chart");
  var rateChart = dc.barChart("#crime-rate-chart");
  var seoulMap  = dc.geoChoroplethChart("#seoul-map");

  // --------------------------------------------------
  // 10) total
  // --------------------------------------------------
  totalND
    .formatNumber(d3.format(",.0f"))
    .group(totalsGroup)
    .valueAccessor(function(d) {
      var conf = metricConfig[currentMetric];
      return d[conf.totalKey] || 0;
    });

  // --------------------------------------------------
  // 11) 연도 BarChart
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
  // 12) distribution Chart
  // --------------------------------------------------
  rateChart
    .width(600)
    .height(250)
    .elasticY(true)

  // --------------------------------------------------
  // 13) color scale 
  // --------------------------------------------------
  var colorScale = d3.scale.quantize()
    .domain([0,1])
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
  // 14) GeoJSON key (SIG_CD)
  // --------------------------------------------------
  function featureKey(f) {
    return String(f.properties.SIG_CD).trim();
  }

  // --------------------------------------------------
  // 15) map scale & projection
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
  // 16) GeoChoroplethChart
  // --------------------------------------------------
  seoulMap
    .width(mapWidth)
    .height(mapHeight)
    .dimension(regionIdDim)
    .group(metricMapGroup)          // {key, value} 형태, value는 숫자 (평균값)
    .valueAccessor(function(d) {      // 🔥 d는 "숫자 value" 그대로!
      return d.value;            
    })
    .colors(colorScale)
    .colorAccessor(function(v) {
      return v;
    })
    .overlayGeoJson(seoulJson.features, "region", featureKey)
    .projection(projection)
    .title(function(d) {
      var id = d.key;
      var name = regionNameMap[id] || id;
      var value = d.value;

      var conf = metricConfig[currentMetric];
      var label = conf.label;

      if (!value || isNaN(value)) {
        return "Region: " + name + "\nNo data";
      }
      return "Region: " + name + 
              "\nAverage " + label + ": " + value.toFixed(2);
    });
  // --------------------------------------------------
  // 14) 모든 차트 렌더링
  // --------------------------------------------------
  function applyMetricToCharts() {
    var conf = metricConfig[currentMetric];

    // 1) distribution chart update
    rateChart
      .dimension(conf.dim)
      .group(conf.group)
      .x(d3.scale.linear().domain(conf.extent))
      .xAxisLabel(conf.label);

    // 2) color domain update
    var vals = metricMapGroup.all().map(d => d.value);
    var minVal = d3.min(vals);
    var maxVal = d3.max(vals);

    if (!isFinite(minVal) || !isFinite(maxVal) || minVal === maxVal) {
      minVal = 0;
      maxVal = 1;
    }
    var newColorScale = d3.scale.quantize()
    .domain([minVal, maxVal])
    .range(conf.colors);

    seoulMap
      .colors(newColorScale)
      .colorDomain([minVal, maxVal]);


    var legendContainer = d3.select("#map-legend");
    legendContainer.selectAll("*").remove(); // 기존 범례 비우기

    legendContainer
      .append("div")
      .attr("class", "map-legend-title")
      .text(conf.label + " (avg)");

    var legendItem = legendContainer.selectAll(".legend-item")
      .data(newColorScale.range())
      .enter()
      .append("div")
      .attr("class", "legend-item");

    legendItem.append("span")
      .attr("class", "legend-swatch")
      .style("background-color", function(c) { return c; });

    var formatLegend = d3.format(".2s");  // 1.2k, 3.4M 이런 식 표기

    legendItem.append("span")
      .attr("class", "legend-label")
      .text(function(c) {
        var ext = newColorScale.invertExtent(c); // [low, high]
        var from = ext[0] == null ? minVal : ext[0];
        var to   = ext[1] == null ? maxVal : ext[1];
        return formatLegend(from) + " – " + formatLegend(to);
      });
  }
  // --------------------------------------------------
  // 19) 전역 metric 변경 함수 (HTML에서 직접 호출)
  // --------------------------------------------------
  window.setMetric = function(metric) {
    if (!metricConfig[metric]) {
      console.warn("Unknown metric:", metric);
      return;
    }

    currentMetric = metric;
    console.log(">>> setMetric called:", metric);

    // 버튼 활성화 스타일 업데이트
    d3.selectAll('#metric-selector button').classed("active", false);
    d3.select('#metric-btn-' + metric).classed("active", true);

    // 차트 / 지도 / total 업데이트
    applyMetricToCharts();
    dc.redrawAll();
  };
  applyMetricToCharts();
  dc.renderAll();

  
  // 디버깅용: 지역별 값 확인
  console.log("metricMapGroup sample:", metricMapGroup.all().slice(0, 10));
}


