import * as d3 from 'd3';

export function createTimeSeries(dailyClimateData, stationData) {
    // -------------------------------------------------------------------------
    // 1. DATA PRE-PROCESSING (Aggregating Stations into 4 Seasons per Year)
    // -------------------------------------------------------------------------

    // Helper function to map a standard JavaScript month (0-11) to a Season name
    function getSeason(month) {
        if (month === 11 || month === 0 || month === 1) return "Winter"; // Dec, Jan, Feb
        if (month >= 2 && month <= 4) return "Spring"; // Mar, Apr, May
        if (month >= 5 && month <= 7) return "Summer"; // Jun, Jul, Aug
        return "Autumn";                                                  // Sep, Oct, Nov
    }

    // Step A: Format daily records into distinct Year-Season buckets
    const entriesBySeason = [];

    dailyClimateData.forEach(d => {
        const year = d.DATE.getFullYear();
        const month = d.DATE.getMonth();
        let seasonYear = year;

        // Meteorological adjustment: December belongs to the *following* year's winter
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

    // Step B: Group by Season Name, then by Year
    const rolledSeasonData = d3.groups(entriesBySeason, d => d.season);

    const formattedSeasonData = rolledSeasonData.map(([seasonName, records]) => {
        // Group the records of this specific season by individual years
        const yearsArray = d3.groups(records, r => r.year)
            .map(([year, dayEntries]) => {
                return {
                    // Create a valid date representation centered in that season for the x-axis
                    date: new Date(year, seasonName === "Winter" ? 0 : seasonName === "Spring" ? 3 : seasonName === "Summer" ? 6 : 9, 1),
                    year: year,
                    // Calculate regional averages/minimums across all stations combined
                    avgHumidity: d3.mean(dayEntries, e => e.humidity),
                    minTemp: d3.min(dayEntries, e => e.tempMin)
                };
            })
            .sort((a, b) => a.date - b.date); // Keep chronological order

        return {
            season: seasonName,
            history: yearsArray
        };
    });

    // Extract Station Map for the Top Chart (Q1 still needs individual station tracking)
    const stationMap = new Map(stationData.map(s => [s.STATION_ID, s.STATION_NAME]));
    const nestedStationData = d3.groups(dailyClimateData, d => d.STATION_ID).map(([stationId, days]) => {

        // 1. Group strictly by the 4-digit Year (e.g., 2011, 2012)
        const yearlyGroups = d3.groups(days, d => d.DATE.getFullYear());

        // 2. Map over each year to extract the absolute lowest temperature night
        const history = yearlyGroups.map(([year, records]) => {
            return {
                // Set the date coordinate to Jan 1st of that year for clean scale placement
                date: new Date(year, 0, 1),

                // This keeps your data integrity safe by picking the single coldest day of that entire year!
                minTemp: d3.min(records, r => r.TEMPERATURE_AIR_MIN)
            };
        }).sort((a, b) => a.date - b.date); // Keep them in chronological order

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

    // Color Scales
    const stationColors = d3.scaleOrdinal(d3.schemeTableau10);

    // Explicit semantic colors for the four seasons
    const seasonColors = d3.scaleOrdinal()
        .domain(["Winter", "Spring", "Summer", "Autumn"])
        .range(["#4a90e2", "#7ed321", "#d0021b", "#f5a623"]);

    const tempFormatter = d3.timeFormat("%B %Y");

    // -------------------------------------------------------------------------
    // 3. AXES & SCALES Setup
    // -------------------------------------------------------------------------
    const xScale = d3.scaleTime()
        .domain(d3.extent(dailyClimateData, d => d.DATE))
        .range([0, width]);

    // Calculate the absolute lowest and highest values present in our yearly roll-up
    const absoluteMinTemp = d3.min(nestedStationData, s => d3.min(s.history, h => h.minTemp));
    const absoluteMaxTemp = d3.max(nestedStationData, s => d3.max(s.history, h => h.minTemp));

    const yTempScale = d3.scaleLinear()
        .domain([absoluteMinTemp - 2, absoluteMaxTemp + 2]) // Adds a clean 2°C breathing room pad at the top and bottom
        .range([height, 0]);

    // Optimize the Y-axis range specifically for seasonal humidity means
    const minHum = d3.min(formattedSeasonData, s => d3.min(s.history, h => h.avgHumidity));
    const maxHum = d3.max(formattedSeasonData, s => d3.max(s.history, h => h.avgHumidity));

    const yHumidScale = d3.scaleLinear()
        .domain([minHum - 3, Math.min(100, maxHum + 3)])
        .range([height, 0]);

    // Define clip path window
    svg.append("defs").append("clipPath")
        .attr("id", "chart-clip")
        .append("rect").attr("width", width).attr("height", height);

    // -------------------------------------------------------------------------
    // 4. PLOT 1: TEMPERATURE TRENDS (TOP)
    // -------------------------------------------------------------------------
    const tempGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Axes setup
    tempGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale).tickFormat(""));
    tempGroup.append("g").call(d3.axisLeft(yTempScale));

    // Axis label
    tempGroup.append("text")
        .attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2)
        .attr("text-anchor", "middle").style("font-size", "12px").text("Min Temp Air (°C)");

    // Line generator
    const tempLine = d3.line().x(d => xScale(d.date)).y(d => yTempScale(d.minTemp)).defined(d => !isNaN(d.minTemp));

    // 1. DRAW LINES FIRST (Bottom Layer)
    tempGroup.append("g").attr("clip-path", "url(#chart-clip)")
        .selectAll(".temp-line").data(nestedStationData).enter().append("path")
        .attr("class", d => `line-${d.stationId} temp-line`)
        .attr("d", d => tempLine(d.history)).attr("fill", "none")
        .attr("stroke", d => stationColors(d.stationName)).attr("stroke-width", 1.2);

    // 2. DRAW BRUSH SECOND (Middle Layer)

    // 3. DRAW INVISIBLE CLICK TARGETS THIRD (Top Layer)
    tempGroup.append("g")
        .attr("clip-path", "url(#chart-clip)")
        .selectAll(".temp-target-group")
        .data(nestedStationData)
        .enter()
        .append("g")
        .attr("class", d => `targets-${d.stationId}`)
        .selectAll("circle")
        .data(d => d.history.map(h => ({ ...h, stationName: d.stationName })))
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yTempScale(d.minTemp))
        .attr("r", 5)
        .attr("fill", "transparent")
        .attr("stroke", "none")
        .style("cursor", "pointer")
        .style("pointer-events", "all")
        .on("mouseenter", function (event, d) {
            // Remove any existing ring first to prevent duplicates
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
                .html(`<strong>${d.stationName}</strong><br/>
                           Date: ${tempFormatter(d.date)}<br/>
                           Min Temp: ${d.minTemp.toFixed(1)} °C`)
                .style("left", (event.pageX + 12) + "px") // Added a tiny bit more padding
                .style("top", (event.pageY - 15) + "px");
        })
        // --- HOVER OUT: HIDE TOOLTIP AND RING ---
        .on("mouseleave", function () {
            d3.selectAll(".temp-target-highlight").remove();
            d3.select("#chart-tooltip").style("opacity", 0);
        });

    // -------------------------------------------------------------------------
    // 5. PLOT 2: SEASONAL HUMIDITY TRENDS (BOTTOM) - New Design
    // -------------------------------------------------------------------------
    const humidGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top + height + 40})`);
    humidGroup.append("g").attr("class", "x-axis").attr("transform", `translate(0,${height})`).call(d3.axisBottom(xScale));
    humidGroup.append("g").call(d3.axisLeft(yHumidScale));

    humidGroup.append("text")
        .attr("transform", "rotate(-90)").attr("y", -margin.left + 20).attr("x", -height / 2)
        .attr("text-anchor", "middle").style("font-size", "12px").text("Mean Humidity (%)");

    const humidLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yHumidScale(d.avgHumidity))
        .curve(d3.curveMonotoneX) // Smooth curves to make trends easier to follow
        .defined(d => !isNaN(d.avgHumidity));

    // Draw the 4 clean seasonal timelines
    humidGroup.append("g").attr("clip-path", "url(#chart-clip)")
        .selectAll(".humid-line")
        .data(formattedSeasonData)
        .enter()
        .append("path")
        .attr("class", d => `season-${d.season} humid-line`)
        .attr("d", d => humidLine(d.history))
        .attr("fill", "none")
        .attr("stroke", d => seasonColors(d.season))
        .attr("stroke-width", 3); // Slightly thicker lines for visibility

    // Add visual dots to clearly mark individual years
    formattedSeasonData.forEach(s => {
        humidGroup.append("g")
            .attr("clip-path", "url(#chart-clip)")
            .selectAll(`.dot-${s.season}`)
            .data(s.history.map(h => ({ ...h, season: s.season }))) // <-- ADD .map HERE so the dots know their season!
            .enter()
            .append("circle")
            .attr("class", `dot-marker dot-${s.season}`) // Added a generic class name for easier selection
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yHumidScale(d.avgHumidity))
            .attr("r", 3.5)
            .attr("fill", seasonColors(s.season));
    });

    const seasonalTargetGroup = humidGroup.append("g")
        .attr("clip-path", "url(#chart-clip)");

    formattedSeasonData.forEach(s => {
        seasonalTargetGroup.selectAll(`.target-dots-${s.season}`)
            .data(s.history.map(h => ({ ...h, season: s.season })))
            .enter()
            .append("circle")
            .attr("class", `humid-target-clicker humid-target-${s.season}`)
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yHumidScale(d.avgHumidity))
            .attr("r", 6)
            .attr("fill", "transparent")
            .style("cursor", "pointer")
            .style("pointer-events", "all")
            .on("mouseenter", function (event, d) {
                d3.selectAll(".humid-target-highlight").remove();

                humidGroup.append("circle")
                    .attr("class", "humid-target-highlight")
                    .attr("cx", xScale(d.date))
                    .attr("cy", yHumidScale(d.avgHumidity))
                    .attr("r", 6)
                    .attr("fill", "none")
                    .attr("stroke", "#333")
                    .attr("stroke-width", 2)
                    .attr("clip-path", "url(#chart-clip)");

                d3.select("#chart-tooltip")
                    .style("opacity", 1)
                    .html(`<strong>Season: ${d.season}</strong><br/>
                               Year: ${d.date.getFullYear()}<br/>
                               Mean Humidity: ${d.avgHumidity.toFixed(1)}%`)
                    .style("left", (event.pageX + 12) + "px")
                    .style("top", (event.pageY - 15) + "px");
            })
            // --- HOVER OUT: HIDE TOOLTIP AND RING ---
            .on("mouseleave", function () {
                d3.selectAll(".humid-target-highlight").remove();
                d3.select("#chart-tooltip").style("opacity", 0);
            });
    });

    // -------------------------------------------------------------------------
    // 6. VISUAL INTERACTION ELEMENT (The New Custom Legend)
    // -------------------------------------------------------------------------
    const masterLegendContainer = d3.select("#timeline-legend").html(""); // Clear layout container

    // --- PART A: STATION SELECTION CONTROLS (TOP PLOT) ---
    masterLegendContainer.append("div")
        .style("font-weight", "bold")
        .style("font-size", "13px")
        .style("margin-bottom", "4px")
        .text("Filter by Station (Temperature Plot):");

    const stationLegendRow = masterLegendContainer.append("div")
        .style("display", "flex").style("gap", "8px").style("flex-wrap", "wrap").style("margin-bottom", "15px");

    let selectedStationId = null; // Selection tracking variable

    nestedStationData.forEach(d => {
        const item = stationLegendRow.append("div")
            .attr("class", `station-item station-${d.stationId}`)
            .style("display", "flex").style("align-items", "center").style("gap", "5px")
            .style("cursor", "pointer").style("padding", "3px 8px")
            .style("border", "1px solid #ccc").style("border-radius", "3px").style("font-size", "12px")
            .style("transition", "all 0.2s");

        item.append("span")
            .style("display", "inline-block").style("width", "10px").style("height", "10px")
            .style("background-color", stationColors(d.stationName));

        item.append("span").text(d.stationName);

        // Persistent Click Selection Interaction
        item.on("click", function () {
            if (selectedStationId === d.stationId) {
                selectedStationId = null; // Toggle off
            } else {
                selectedStationId = d.stationId; // Toggle on
            }
            updateStationVisuals();
        });
    });

    function updateStationVisuals() {
        if (selectedStationId === null) {
            // --- DEFAULT STATE: No active selection ---
            // 1. Reset line styles
            svg.selectAll("path.temp-line").style("opacity", 1).style("stroke-width", 1.2);

            // 2. Reactivate pointer events for EVERY station's dots
            nestedStationData.forEach(d => {
                tempGroup.selectAll(`.targets-${d.stationId} circle`)
                    .style("pointer-events", "all")
                    .style("cursor", "pointer");
            });

            // 3. Reset Legend buttons
            d3.selectAll(".station-item").style("background-color", "transparent").style("border-color", "#ccc");
        } else {
            // --- FILTERED STATE: One station is locked ---
            // 1. Dim all lines except the active selection
            svg.selectAll("path.temp-line").style("opacity", 0.1).style("stroke-width", 1);
            svg.selectAll(`.line-${selectedStationId}`).style("opacity", 1).style("stroke-width", 2.5);

            // 2. DISABLE pointer events for hidden stations, ENABLE only for the selected one
            nestedStationData.forEach(d => {
                if (d.stationId === selectedStationId) {
                    tempGroup.selectAll(`.targets-${d.stationId} circle`)
                        .style("pointer-events", "all")
                        .style("cursor", "pointer");
                } else {
                    tempGroup.selectAll(`.targets-${d.stationId} circle`)
                        .style("pointer-events", "none") // <-- This forces the mouse to ignore these dots!
                        .style("cursor", "default");
                }
            });

            // 3. Update Legend Box UI highlights
            d3.selectAll(".station-item").style("background-color", "transparent").style("border-color", "#ccc");
            d3.select(`.station-${selectedStationId}`).style("background-color", "#f0f0f0").style("border-color", "#333");
        }
    }

    // --- PART B: SEASON CONTROLS (BOTTOM PLOT) ---
    masterLegendContainer.append("div")
        .style("font-weight", "600")
        .style("font-size", "13px")
        .style("color", "#444")
        .style("margin-bottom", "6px")
        .text("Filter by Season (Humidity Plot):");

    const seasonLegendRow = masterLegendContainer.append("div")
        .style("display", "flex")
        .style("gap", "10px")
        .style("flex-wrap", "wrap");

    // Track the currently active seasonal selection state
    let selectedSeasonName = null;

    formattedSeasonData.forEach(d => {
        const item = seasonLegendRow.append("div")
            .attr("class", `season-item season-btn-${d.season}`)
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "5px")
            .style("cursor", "pointer")
            .style("padding", "3px 8px")
            .style("border", `1px solid ${seasonColors(d.season)}`)
            .style("border-radius", "3px")
            .style("font-size", "12px")
            .style("transition", "all 0.2s");

        item.append("span")
            .style("display", "inline-block")
            .style("width", "10px")
            .style("height", "10px")
            .style("background-color", seasonColors(d.season));

        item.append("span").text(d.season);

        // Persistent Click Selection Interaction for Seasons
        item.on("click", function () {
            if (selectedSeasonName === d.season) {
                selectedSeasonName = null; // Toggle off if clicking the active season
            } else {
                selectedSeasonName = d.season; // Toggle on new season
            }
            updateSeasonVisuals();
        });
    });

    function updateSeasonVisuals() {
        if (selectedSeasonName === null) {
            // --- DEFAULT STATE: Reset everything ---
            svg.selectAll("path.humid-line").style("opacity", 1).style("stroke-width", 3);
            svg.selectAll(".dot-marker").style("opacity", 1);

            // Reactivate click capability for ALL seasonal target dots
            svg.selectAll(".humid-target-clicker")
                .style("pointer-events", "all")
                .style("cursor", "pointer");

            formattedSeasonData.forEach(s => {
                d3.select(`.season-btn-${s.season}`)
                    .style("background-color", "transparent")
                    .style("border-color", seasonColors(s.season));
            });
        } else {
            // --- FILTERED STATE: One season locked ---
            // 1. Dim all seasonal lines and points
            svg.selectAll("path.humid-line").style("opacity", 0.15).style("stroke-width", 2);
            svg.selectAll(".dot-marker").style("opacity", 0.15);

            // 2. Pop out the selected seasonal line and its explicit dot markers
            svg.selectAll(`path.season-${selectedSeasonName}`).style("opacity", 1).style("stroke-width", 4.5);
            svg.selectAll(`.dot-${selectedSeasonName}`).style("opacity", 1);

            // 3. DISABLE pointer events for hidden seasons, ENABLE only for the active one
            svg.selectAll(".humid-target-clicker")
                .style("pointer-events", "none")
                .style("cursor", "default");

            svg.selectAll(`.humid-target-${selectedSeasonName}`)
                .style("pointer-events", "all")
                .style("cursor", "pointer");

            // 4. Update Legend Button UI frames
            formattedSeasonData.forEach(s => {
                const btn = d3.select(`.season-btn-${s.season}`);
                if (s.season === selectedSeasonName) {
                    btn.style("background-color", "#f0f0f0")
                        .style("border-color", "#333");
                } else {
                    btn.style("background-color", "transparent")
                        .style("border-color", seasonColors(s.season));
                }
            });
        }
    }

    // Dismiss tooltip and clear all selections if clicking the empty canvas space
    svg.on("click", function (event) {
        // Check if the user clicked the actual background canvas or axis space
        if (event.target.tagName === "svg" || event.target.tagName === "rect") {

            // 1. Hide the floating tooltip card
            d3.select("#chart-tooltip").style("opacity", 0);

            // 2. Remove any active target highlight rings
            d3.selectAll(".temp-target-highlight, .humid-target-highlight").remove();

            // 3. RESET TEMPERATURE PLOT VISUALS
            // Bring back full opacity to all lines
            svg.selectAll("path.temp-line").style("opacity", 1).style("stroke-width", 1.2);
            // Reactivate pointer events for all hidden dots
            nestedStationData.forEach(d => {
                tempGroup.selectAll(`.targets-${d.stationId} circle`)
                    .style("pointer-events", "all")
                    .style("cursor", "pointer");
            });
            // Clear station legend active styles
            d3.selectAll(".station-item").style("background-color", "transparent").style("border-color", "#ccc");
            selectedStationId = null; // Clear tracking variable

            // 4. RESET HUMIDITY PLOT VISUALS
            // Bring back full opacity to lines and trend dots
            svg.selectAll("path.humid-line").style("opacity", 1).style("stroke-width", 3);
            svg.selectAll(".dot-marker").style("opacity", 1);
            // Reactivate pointer events for humidity targets
            svg.selectAll(".humid-target-clicker").style("pointer-events", "all").style("cursor", "pointer");
            // Clear season legend active styles
            formattedSeasonData.forEach(s => {
                d3.select(`.season-btn-${s.season}`)
                    .style("background-color", "transparent")
                    .style("border-color", seasonColors(s.season));
            });
            selectedSeasonName = null; // Clear tracking variable
        }
    });
}