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
    return d.gdp / 1e6;
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


  //Correlation cal
  var corrStatsByRegion = regionIdDim.group().reduce(
    function(p, v) {
      p.n += 1;

      var c = v.crime_rate, k = v.park_area, g = v.gdp;

      p.sumCrime += c; p.sumSqCrime += c * c;
      p.sumPark += k;  p.sumSqPark += k * k;
      p.sumGdp += g;  p.sumSqGdp += g * g;

      p.sumCrimePark += c * k;
      p.sumCrimeGdp += c * g;
      
      return p;
    },
    function(p, v) {
      p.n -= 1;

      var c = v.crime_rate, k = v.park_area, g = v.gdp;

      p.sumCrime -= c; p.sumSqCrime -= c * c;
      p.sumPark -= k;  p.sumSqPark -= k * k;
      p.sumGdp -= g;  p.sumSqGdp -= g * g; 

      p.sumCrimePark -= c * k;
      p.sumCrimeGdp -= c * g;

      return p;
    },
    function() {
      return {
        n: 0,
        sumCrime: 0, sumSqCrime: 0,
        sumPark: 0,  sumSqPark: 0,
        sumGdp: 0,    sumSqGdp: 0,
        sumCrimePark: 0,
        sumCrimeGdp: 0
      };
    }
  );

  // --------------------------------------------------
  // 6) Person

  function pearsonFromSums(n, sumX, sumY, sumXX, sumYY, sumXY) {
    if (n < 2)  return null;
    var num = (n * sumXY) - (sumX * sumY);
    var denX = (n * sumXX) - (sumX * sumX);
    var denY = (n * sumYY) - (sumY * sumY);
    var den = Math.sqrt(denX * denY);
    if (!isFinite(den) || den === 0) return null;
    var r = num/den;
    return Math.max(-1, Math.min(1, r));
  }

  function getRegionCorrelation(p, m1, m2) {
    if (!p) return null;

    if ((m1 === "crime_rate") && (m2 === "park_area") || (m1=== "park_area" && m2 === "crime_rate")) {
      return pearsonFromSums(
        p.n,
        p.sumCrime,
        p.sumPark,
        p.sumSqCrime,
        p.sumSqPark,
        p.sumCrimePark
      );
    }

    if ((m1 === "crime_rate") && (m2 === "gdp") || (m1=== "gdp" && m2 === "crime_rate")) {
      return pearsonFromSums(
        p.n,
        p.sumCrime,
        p.sumGdp,
        p.sumSqCrime,
        p.sumSqGdp,
        p.sumCrimeGdp
      );
    }
    return null;
  }


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
  var selectedMetrics = ["crime_rate"];
  var currentMetric = "crime_rate"; // metricMapGroup

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
      extent: d3.extent(data, function(d){ return d.gdp / 1e6; }),
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


  var corrMapGroup = {
    all : function() {
      if (!selectedMetrics || selectedMetrics.length !==2) return [];
      var m1 = selectedMetrics[0], m2 = selectedMetrics[1];

      return corrStatsByRegion.all().map(function(d) {
        return {key: d.key, value: getRegionCorrelation(d.value, m1, m2)};
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
    .height(200)
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
    .colorAccessor(function(v) {
      return v;
    })
    .overlayGeoJson(seoulJson.features, "region", featureKey)
    .projection(projection);



  // --------------------------------------------------
  // 14) Single Metric
  // --------------------------------------------------
  function applySingleMetricMode(metric) {
    currentMetric = metric;
    var conf = metricConfig[metric];

    var vals = metricMapGroup.all().map(d => d.value).filter(v => v != null);
    var minVal = d3.min(vals), maxVal = d3.max(vals);
    if (!isFinite(minVal) || !isFinite(maxVal) || minVal === maxVal) {
      minVal = 0;
      maxVal = 1;
    }

    var scale = d3.scale.quantize()
      .domain([minVal, maxVal])
      .range(conf.colors);


    seoulMap
      .group(metricMapGroup)
      .colors(scale)
      .colorDomain([minVal, maxVal])
      .colorAccessor(function(v) { return v;})
      .title(function(d) {
        var name = regionNameMap[d.key] || d.key;
        if (d.value == null) return "region: " + name + "\nNo data";

        var fmt = (metric === "gdp") ? d3.format(".2s") : d3.format(".2f");
        return "Region: " + name + "\nAverage " + conf.label + ": " + fmt(d.value);
      });

    // 1) distribution chart update
    rateChart
      .dimension(conf.dim)
      .group(conf.group)
      .x(d3.scale.linear().domain(conf.extent))
      .xAxisLabel(conf.label);

    if (metric === "gdp") {
      rateChart.xAxis().tickFormat(function(v){ return v + "M"; });
    } else {
      rateChart.xAxis().tickFormat(d3.format("d"));
    }

    totalND
      .formatNumber(metric === "gdp" ? d3.format(",.2s") : d3.format(",.0f"))
      .group(totalsGroup)
      .valueAccessor(function(d) { return d[conf.totalKey] || 0; });

    updateLegend(conf.label + " (avg)", scale);
  
  }

  // --------------------------------------------------
  // 14) correlation metric
  // --------------------------------------------------

  function applyCorrelationMode(m1, m2) {
    var label = metricConfig[m1].label + "x" + metricConfig[m2].label;

    var corrColors = [
      "#67001f","#b2182b","#d6604d","#f4a582",
      "#f7f7f7",
      "#92c5de","#4393c3","#2166ac","#053061"
    ]

    var corrScale = d3.scale.quantize()
      .domain([-1, 1])
      .range(corrColors);


    seoulMap
      .group(corrMapGroup)
      .colors(corrScale)
      .colorDomain([-1, 1])
      .colorAccessor(function(v) {return v; })
      .title(function(d) {
        var name = regionNameMap[d.key] || d.key;
        if (d.value === null) return "region: " + name + "\nCorrelation: N/A";
        return "Region: " + name + "\n" + label + " correlation (r): " + d3.format(".2f")(d.value);
      });

    rateChart.group({ all: function(){ return []; } });
    totalND.valueAccessor(function(){ return 0; });

    updateLegend(label + " (Pearson r)", corrScale);
  
  }

  function updateLegend(title, scale) {
    var legend = d3.select("#map-legend");
    legend.selectAll("*").remove();


    legend.append("div")
      .attr("class", "map-legend-title")
      .text(title);

    var items = legend.selectAll(".legend-item")
      .data(scale.range())
      .enter()
      .append("div")
      .attr("class", "legend-item");

    items.append("span")
      .attr("class", "legend-swatch")
      .style("background-color", function(d){ return d;});

    items.append("span")
      .attr("class", "legend-label")
      .text(function(c) {
        var e = scale.invertExtent(c);
        return d3.format(".2f")(e[0]) + " - " + d3.format(".2f")(e[1]);
      });
  }
  // --------------------------------------------------
  // 19) UI + metric logic (모두 setMetric 밖에!)
  // --------------------------------------------------
  function updateMetricUI() {
    d3.selectAll('#metric-selector button').classed('active', false);

    selectedMetrics.forEach(function(m) {
      d3.select('#metric-btn-' + m).classed('active', true);
    });
  }

  function applyMetricLogic() {
    // 0개 선택 허용
    if (selectedMetrics.length === 0) {
      seoulMap
        .group({ all: function(){ return []; } })
        .title(function(){ return "Select a metric"; });

      rateChart.group({ all: function(){ return []; } });
      totalND.valueAccessor(function(){ return 0; });

      updateLegend("Select a metric", d3.scale.quantize().domain([0,1]).range(["#ffffff"]));
      return;
    }

    if (selectedMetrics.length === 1) {
      applySingleMetricMode(selectedMetrics[0]);
    } else if (selectedMetrics.length === 2) {
      applyCorrelationMode(selectedMetrics[0], selectedMetrics[1]);
    }
  }

  // --------------------------------------------------
  // 20) 전역 metric 변경 함수 (HTML에서 직접 호출)
  // --------------------------------------------------
  window.setMetric = function(metric) {
    if (!metricConfig[metric]) {
      console.warn("Unknown metric:", metric);
      return;
    }

    var idx = selectedMetrics.indexOf(metric);

    if (idx !== -1) {
      // ✅ 다시 누르면 무조건 취소 (마지막도 취소 가능)
      selectedMetrics.splice(idx, 1);
    } else {
      // ✅ 새 선택 (최대 2개)
      if (selectedMetrics.length < 2) selectedMetrics.push(metric);
      else return;
    }

    console.log("AFTER:", selectedMetrics);

    updateMetricUI();
    applyMetricLogic();
    dc.redrawAll();
  };

  // 초기 렌더
  updateMetricUI();
  applyMetricLogic();
  dc.renderAll();
  
  // 디버깅용: 지역별 값 확인
  console.log("metricMapGroup sample:", metricMapGroup.all().slice(0, 10));
}