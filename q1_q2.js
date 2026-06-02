import * as d3 from 'd3';

export function createTimeSeries(dailyClimateData, stationData) {
    // -------------------------------------------------------------------------
    // 1. DATA PRE-PROCESSING
    // -------------------------------------------------------------------------

    function getSeason(month) {
        if (month === 11 || month === 0 || month === 1) return "Winter"; 
        if (month >= 2 && month <= 4) return "Spring"; 
        if (month >= 5 && month <= 7) return "Summer"; 
        return "Autumn";                                                  
    }

    const entriesBySeason = [];
    dailyClimateData.forEach(d => {
        const year = d.DATE.getFullYear();
        const month = d.DATE.getMonth();
        let seasonYear = year;

        if (month === 11) {
            seasonYear = year + 1;
        }

        const seasonName = getSeason(month);
        entriesBySeason.push({
            key: `${seasonYear}-${seasonName}`,
            year: seasonYear,
            season: seasonName,
            tempMin: d.TEMPERATURE_AIR_MIN,
            humidity: d.HUMIDITY
        });
    });

    const rolledSeasonData = d3.groups(entriesBySeason, d => d.season);
    const formattedSeasonData = rolledSeasonData.map(([seasonName, records]) => {
        const yearsArray = d3.groups(records, r => r.year)
            .map(([year, dayEntries]) => {
                return {
                    date: new Date(year, seasonName === "Winter" ? 0 : seasonName === "Spring" ? 3 : seasonName === "Summer" ? 6 : 9, 1),
                    year: year,
                    avgHumidity: d3.mean(dayEntries, e => e.humidity),
                    minTemp: d3.min(dayEntries, e => e.tempMin)
                };
            })
            .sort((a, b) => a.date - b.date);

        return { season: seasonName, history: yearsArray };
    });

    const stationMap = new Map(stationData.map(s => [s.STATION_ID, s.STATION_NAME]));
    const nestedStationData = d3.groups(dailyClimateData, d => d.STATION_ID).map(([stationId, days]) => {
        const yearlyGroups = d3.groups(days, d => d.DATE.getFullYear());
        const history = yearlyGroups.map(([year, records]) => {
            return {
                date: new Date(year, 0, 1),
                minTemp: d3.min(records, r => r.TEMPERATURE_AIR_MIN)
            };
        }).sort((a, b) => a.date - b.date);

        return { stationId, stationName: stationMap.get(stationId), history };
    });

    // -------------------------------------------------------------------------
    // 2. DIMENSIONS AND CANVAS SETUP
    // -------------------------------------------------------------------------
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 250 - margin.top - margin.bottom;

    const svg = d3.select("#timeline-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", (height * 2) + margin.top + margin.bottom + 100);

    const stationColors = d3.scaleOrdinal(d3.schemeTableau10);
    const seasonColors = d3.scaleOrdinal()
        .domain(["Winter", "Spring", "Summer", "Autumn"])
        .range(["#4a90e2", "#7ed321", "#d0021b", "#f5a623"]);

    const tempFormatter = d3.timeFormat("%B %Y");

    // State Tracking Variables
    let selectedStationId = null; 
    let selectedSeasonName = null;

    // -------------------------------------------------------------------------
    // 3. AXES & SCALES Setup
    // -------------------------------------------------------------------------
    const xScale = d3.scaleTime()
        .domain(d3.extent(dailyClimateData, d => d.DATE))
        .range([0, width]);

    const absoluteMinTemp = d3.min(nestedStationData, s => d3.min(s.history, h => h.minTemp));
    const absoluteMaxTemp = d3.max(nestedStationData, s => d3.max(s.history, h => h.minTemp));

    const yTempScale = d3.scaleLinear()
        .domain([absoluteMinTemp - 2, absoluteMaxTemp + 2])
        .range([height, 0]);

    const minHum = d3.min(formattedSeasonData, s => d3.min(s.history, h => h.avgHumidity));
    const maxHum = d3.max(formattedSeasonData, s => d3.max(s.history, h => h.avgHumidity));

    const yHumidScale = d3.scaleLinear()
        .domain([minHum - 3, Math.min(100, maxHum + 3)])
        .range([height, 0]);

    svg.append("defs").append("clipPath")
        .attr("id", "chart-clip")
        .append("rect").attr("width", width).attr("height", height);

    // -------------------------------------------------------------------------
    // 4. PLOT 1: TEMPERATURE TRENDS (TOP)
    // -------------------------------------------------------------------------
    const tempGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    tempGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale).tickFormat(""));
    tempGroup.append("g").call(d3.axisLeft(yTempScale));

    tempGroup.append("text")
        .attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2)
        .attr("text-anchor", "middle").style("font-size", "12px").text("Min Temp Air (°C)");

    const tempLine = d3.line().x(d => xScale(d.date)).y(d => yTempScale(d.minTemp)).defined(d => !isNaN(d.minTemp));

    // Draw lines once with click pointer handlers attached
    tempGroup.append("g").attr("clip-path", "url(#chart-clip)")
        .selectAll(".temp-line").data(nestedStationData).enter().append("path")
        .attr("class", d => `line-${d.stationId} temp-line`)
        .attr("d", d => tempLine(d.history)).attr("fill", "none")
        .attr("stroke", d => stationColors(d.stationName)).attr("stroke-width", 2.5)
        .style("cursor", "pointer")
        .style("pointer-events", "stroke")
        .on("click", function (event, d) {
            event.stopPropagation();
            selectedStationId = (selectedStationId === d.stationId) ? null : d.stationId;
            updateStationVisuals();
        });

    // Hover Targets (Tooltips Only)
    tempGroup.append("g").attr("clip-path", "url(#chart-clip)")
        .selectAll(".temp-target-group")
        .data(nestedStationData).enter().append("g")
        .attr("class", d => `targets-${d.stationId}`)
        .selectAll("circle")
        .data(d => d.history.map(h => ({ ...h, stationName: d.stationName, stationId: d.stationId })))
        .enter().append("circle")
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yTempScale(d.minTemp))
        .attr("r", 6)
        .attr("fill", "transparent")
        .style("cursor", "pointer")
        .style("pointer-events", "all")
        .on("mouseenter", function (event, d) {
            d3.selectAll(".temp-target-highlight").remove();

            tempGroup.append("circle")
                .attr("class", "temp-target-highlight")
                .attr("cx", xScale(d.date))
                .attr("cy", yTempScale(d.minTemp))
                .attr("r", 6)
                .attr("fill", "none")
                .attr("stroke", "#333")
                .attr("stroke-width", 2)
                .attr("clip-path", "url(#chart-clip)");

            d3.select("#chart-tooltip")
                .style("opacity", 1)
                .html(`<strong>${d.stationName}</strong><br/>Date: ${tempFormatter(d.date)}<br/>Min Temp: ${d.minTemp.toFixed(1)} °C`)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 15) + "px");
        })
        .on("mouseleave", function () {
            d3.selectAll(".temp-target-highlight").remove();
            d3.select("#chart-tooltip").style("opacity", 0);
        });

    // -------------------------------------------------------------------------
    // 5. PLOT 2: SEASONAL HUMIDITY TRENDS (BOTTOM)
    // -------------------------------------------------------------------------
    const humidGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + height + 40})`);
    humidGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    humidGroup.append("g").call(d3.axisLeft(yHumidScale));

    humidGroup.append("text")
        .attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2)
        .attr("text-anchor", "middle").style("font-size", "12px").text("Mean Humidity (%)");

    const humidLine = d3.line().x(d => xScale(d.date)).y(d => yHumidScale(d.avgHumidity)).curve(d3.curveMonotoneX).defined(d => !isNaN(d.avgHumidity));

    // Draw lines
    humidGroup.append("g").attr("clip-path", "url(#chart-clip)")
        .selectAll(".humid-line").data(formattedSeasonData).enter().append("path")
        .attr("class", d => `season-${d.season} humid-line`)
        .attr("d", d => humidLine(d.history)).attr("fill", "none")
        .attr("stroke", d => seasonColors(d.season)).attr("stroke-width", 3)
        .style("cursor", "pointer")
        .style("pointer-events", "stroke")
        .on("click", function(event, d) {
            event.stopPropagation();
            selectedSeasonName = (selectedSeasonName === d.season) ? null : d.season;
            updateSeasonVisuals();
        });

    // Draw points (Tooltips Only)
    humidGroup.append("g").attr("clip-path", "url(#chart-clip)")
        .selectAll(".dot-marker")
        .data(formattedSeasonData.flatMap(s => s.history.map(h => ({ ...h, season: s.season }))))
        .enter().append("circle")
        .attr("class", d => `dot-marker dot-${d.season}`)
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yHumidScale(d.avgHumidity))
        .attr("r", 4)
        .attr("fill", d => seasonColors(d.season))
        .style("cursor", "pointer")
        .style("pointer-events", "all")
        .on("mouseenter", function (event, d) {
            d3.selectAll(".humid-target-highlight").remove();

            humidGroup.append("circle")
                .attr("class", "humid-target-highlight")
                .attr("cx", xScale(d.date))
                .attr("cy", yHumidScale(d.avgHumidity))
                .attr("r", 7)
                .attr("fill", "none")
                .attr("stroke", "#333")
                .attr("stroke-width", 2)
                .attr("clip-path", "url(#chart-clip)");

            d3.select("#chart-tooltip")
                .style("opacity", 1)
                .html(`<strong>Season: ${d.season}</strong><br/>Year: ${d.date.getFullYear()}<br/>Mean Humidity: ${d.avgHumidity.toFixed(1)}%`)
                .style("left", (event.pageX + 12) + "px")
                .style("top", (event.pageY - 15) + "px");
        })
        .on("mouseleave", function () {
            d3.selectAll(".humid-target-highlight").remove();
            d3.select("#chart-tooltip").style("opacity", 0);
        });

    // -------------------------------------------------------------------------
    // 6. VISUAL INTERACTION ELEMENT (The New Custom Legend)
    // -------------------------------------------------------------------------
    const masterLegendContainer = d3.select("#timeline-legend").html(""); 

    // --- PART A: STATION SELECTION CONTROLS ---
    masterLegendContainer.append("div")
        .style("font-weight", "bold").style("font-size", "13px").style("margin-bottom", "4px")
        .text("Filter by Station (Temperature Plot):");

    const stationLegendRow = masterLegendContainer.append("div")
        .style("display", "flex").style("gap", "8px").style("flex-wrap", "wrap").style("margin-bottom", "15px");

    nestedStationData.forEach(station => {
        const item = stationLegendRow.append("div")
            .attr("class", `station-item station-${station.stationId}`)
            .style("display", "flex").style("align-items", "center").style("gap", "5px")
            .style("cursor", "pointer").style("padding", "3px 8px")
            .style("border", "1px solid #ccc").style("border-radius", "3px").style("font-size", "12px")
            .style("transition", "all 0.2s");

        item.append("span").style("display", "inline-block").style("width", "10px").style("height", "10px").style("background-color", stationColors(station.stationName));
        item.append("span").text(station.stationName);

        item.on("click", function (event) {
            event.stopPropagation();
            selectedStationId = (selectedStationId === station.stationId) ? null : station.stationId;
            updateStationVisuals();
        });
    });

    // --- PART B: SEASON SELECTION CONTROLS ---
    masterLegendContainer.append("div")
        .style("font-weight", "600").style("font-size", "13px").style("color", "#444").style("margin-bottom", "6px")
        .text("Filter by Season (Humidity Plot):");

    const seasonLegendRow = masterLegendContainer.append("div").style("display", "flex").style("gap", "10px").style("flex-wrap", "wrap");

    formattedSeasonData.forEach(sNode => {
        const item = seasonLegendRow.append("div")
            .attr("class", `season-item season-btn-${sNode.season}`)
            .style("display", "flex").style("align-items", "center").style("gap", "5px")
            .style("cursor", "pointer").style("padding", "3px 8px")
            .style("border", `1px solid ${seasonColors(sNode.season)}`).style("border-radius", "3px").style("font-size", "12px")
            .style("transition", "all 0.2s");

        item.append("span").style("display", "inline-block").style("width", "10px").style("height", "10px").style("background-color", seasonColors(sNode.season));
        item.append("span").text(sNode.season);

        item.on("click", function (event) {
            event.stopPropagation();
            selectedSeasonName = (selectedSeasonName === sNode.season) ? null : sNode.season;
            updateSeasonVisuals();
        });
    });

    // -------------------------------------------------------------------------
    // 7. CENTRALIZED STATE VISUAL UPDATERS
    // -------------------------------------------------------------------------
    function updateStationVisuals() {
        // Reset all buttons first
        d3.selectAll(".station-item").style("background-color", "transparent").style("color", "#333").style("border-color", "#ccc");

        if (selectedStationId === null) {
            svg.selectAll("path.temp-line").style("opacity", 1).style("stroke-width", 2.5);
            nestedStationData.forEach(d => {
                tempGroup.selectAll(`.targets-${d.stationId} circle`).style("pointer-events", "all").style("cursor", "pointer");
            });
        } else {
            svg.selectAll("path.temp-line").style("opacity", 0.15).style("stroke-width", 2.0);
            svg.selectAll(`.line-${selectedStationId}`).style("opacity", 1).style("stroke-width", 4.5);

            nestedStationData.forEach(d => {
                const isSelected = (d.stationId === selectedStationId);
                tempGroup.selectAll(`.targets-${d.stationId} circle`)
                    .style("pointer-events", isSelected ? "all" : "none")
                    .style("cursor", isSelected ? "pointer" : "default");
            });

            const activeStation = nestedStationData.find(s => s.stationId === selectedStationId);
            d3.select(`.station-${selectedStationId}`)
                .style("background-color", stationColors(activeStation.stationName))
                .style("color", "#fff")
                .style("border-color", stationColors(activeStation.stationName));
        }
    }

    function updateSeasonVisuals() {
        // Reset all buttons first
        formattedSeasonData.forEach(s => {
            d3.select(`.season-btn-${s.season}`)
                .style("background-color", "transparent")
                .style("color", "#333")
                .style("border-color", seasonColors(s.season));
        });

        if (selectedSeasonName === null) {
            svg.selectAll("path.humid-line").style("opacity", 1).style("stroke-width", 3);
            svg.selectAll(".dot-marker").style("opacity", 1).style("pointer-events", "all");
        } else {
            svg.selectAll("path.humid-line").style("opacity", 0.15).style("stroke-width", 2);
            svg.selectAll(".dot-marker").style("opacity", 0.15).style("pointer-events", "none");

            svg.selectAll(`path.season-${selectedSeasonName}`).style("opacity", 1).style("stroke-width", 4.5);
            svg.selectAll(`.dot-${selectedSeasonName}`).style("opacity", 1).style("pointer-events", "all");

            d3.select(`.season-btn-${selectedSeasonName}`)
                .style("background-color", seasonColors(selectedSeasonName))
                .style("color", "#fff")
                .style("border-color", seasonColors(selectedSeasonName));
        }
        window.dispatchEvent(new CustomEvent('q1-season-selected', { detail: { selectedSeason: selectedSeasonName } }));
    }

    // Canvas Background Reset Click Handler
    svg.on("click", function (event) {
        if (event.target.tagName === "svg" || event.target.tagName === "rect") {
            d3.select("#chart-tooltip").style("opacity", 0);
            d3.selectAll(".temp-target-highlight, .humid-target-highlight").remove();
            selectedStationId = null;
            selectedSeasonName = null;
            updateStationVisuals();
            updateSeasonVisuals();
        }
    });
}