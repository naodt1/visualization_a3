import * as d3 from 'd3';

// Load data
// This time, we will load mutliple files at once using Promises
const base_path = 'data/'
const files = ['reduced_daily_climate_summary.csv', 'station.csv'];

// We load each file and wait until all files are loaded
Promise.all(files.map(d => d3.csv(base_path + d, d3.autoType)))
    .then(data => {
        const dailyClimateData = data[0];
        const stationData = data[1];
        console.log(dailyClimateData);
        console.log(stationData);

        // Trigger your time-series initialization
        createTimeSeries(dailyClimateData, stationData);

        // (You will add your PCP and Parallel Sets functions here later!)
    })
    .catch(error => {
        console.error("Error loading the CSV files: ", error);
    })

function createTimeSeries(dailyClimateData, stationData) {
    // -------------------------------------------------------------------------
    // 1. DATA PRE-PROCESSING (Aggregation by Month)
    // -------------------------------------------------------------------------

    // Create a lookup map for Station ID -> Station Name
    const stationMap = new Map(stationData.map(s => [s.STATION_ID, s.STATION_NAME]));

    // Group rows by Station and then by Year-Month
    const nestedData = d3.groups(dailyClimateData,
        d => d.STATION_ID,
        d => {
            // d.DATE is already a Date object thanks to d3.autoType
            return `${d.DATE.getFullYear()}-${String(d.DATE.getMonth() + 1).padStart(2, '0')}`;
        }
    );

    // Format the aggregated data for D3 line generator
    const formattedData = nestedData.map(([stationId, months]) => {
        const stationName = stationMap.get(stationId) || `Station ${stationId}`;

        const history = months.map(([yearMonth, days]) => {
            const [year, month] = yearMonth.split("-").map(Number);
            const date = new Date(year, month - 1, 1);

            return {
                date: date,
                // Q1: Target the absolute minimum recorded temperature
                minTemp: d3.min(days, d => d.TEMPERATURE_AIR_MIN),
                // Q2: Average out the humidity metrics
                avgHumidity: d3.mean(days, d => d.HUMIDITY)
            };
        }).sort((a, b) => a.date - b.date);

        return {
            stationId: stationId,
            stationName: stationName,
            history: history
        };
    });

    // -------------------------------------------------------------------------
    // 2. DIMENSIONS AND CANVAS SETUP
    // -------------------------------------------------------------------------
    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom; // Shrunk slightly to fit the brush area
    const contextHeight = 40; // Height for the mini zoom slider timeline

    const svg = d3.select("#timeline-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", (height * 2) + contextHeight + margin.top + margin.bottom + 100);

    const colors = d3.scaleOrdinal(d3.schemeTableau10)
        .domain(formattedData.map(d => d.stationName));

    // -------------------------------------------------------------------------
    // 3. AXES & SCALES Setup
    // -------------------------------------------------------------------------
    // We can use d3.extent directly on the raw array since autoType handled it
    const xScale = d3.scaleTime()
        .domain(d3.extent(dailyClimateData, d => d.DATE))
        .range([0, width]);

    const xScaleContext = d3.scaleTime()
        .domain(xScale.domain())
        .range([0, width]);

    const yTempScale = d3.scaleLinear()
        .domain([
            d3.min(formattedData, s => d3.min(s.history, h => h.minTemp)) - 2,
            d3.max(formattedData, s => d3.max(s.history, h => h.minTemp)) + 2
        ])
        .range([height, 0]);

    const minHumidity = d3.min(formattedData, s => d3.min(s.history, h => h.avgHumidity));
    const maxHumidity = d3.max(formattedData, s => d3.max(s.history, h => h.avgHumidity));

    const yHumidScale = d3.scaleLinear()
        .domain([
            minHumidity - 5, // Adds breathing room at the bottom (e.g., if min is 40%, starts at 35%)
            Math.min(100, maxHumidity + 5) // Caps the top ceiling safely at 100%
        ])
        .range([height, 0]);

    // -------------------------------------------------------------------------
    // 4. PLOT 1: TEMPERATURE TRENDS (TOP)
    // -------------------------------------------------------------------------
    const tempGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    tempGroup.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale).tickFormat(""));

    tempGroup.append("g")
        .call(d3.axisLeft(yTempScale));

    tempGroup.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 20)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Min Temp Air (°C)");

    const tempLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yTempScale(d.minTemp))
        .defined(d => d.minTemp !== undefined && !isNaN(d.minTemp));

    tempGroup.selectAll(".temp-line")
        .data(formattedData)
        .enter()
        .append("path")
        .attr("class", d => `line-${d.stationId} temp-line`)
        .attr("d", d => tempLine(d.history))
        .attr("fill", "none")
        .attr("stroke", d => colors(d.stationName))
        .attr("stroke-width", 1.5);

    // -------------------------------------------------------------------------
    // 5. PLOT 2: HUMIDITY TRENDS (BOTTOM)
    // -------------------------------------------------------------------------
    const humidGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top + height + 40})`);

    humidGroup.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(xScale));

    humidGroup.append("g")
        .call(d3.axisLeft(yHumidScale));

    humidGroup.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -margin.left + 20)
        .attr("x", -height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .text("Avg Humidity (%)");

    const humidLine = d3.line()
        .x(d => xScale(d.date))
        .y(d => yHumidScale(d.avgHumidity))
        .defined(d => d.avgHumidity !== undefined && !isNaN(d.avgHumidity));

    humidGroup.selectAll(".humid-line")
        .data(formattedData)
        .enter()
        .append("path")
        .attr("class", d => `line-${d.stationId} humid-line`)
        .attr("d", d => humidLine(d.history))
        .attr("fill", "none")
        .attr("stroke", d => colors(d.stationName))
        .attr("stroke-width", 1.5);

    // -------------------------------------------------------------------------
    // 6. VISUAL INTERACTION ELEMENT (The Custom Legend)
    // -------------------------------------------------------------------------
    const legendContainer = d3.select("#timeline-legend");

    let selectedStationId = null;

    formattedData.forEach(d => {
        const item = legendContainer.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "5px")
            .style("cursor", "pointer")
            .style("padding", "2px 6px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "3px")
            .style("font-size", "12px");

        item.append("span")
            .style("display", "inline-block")
            .style("width", "12px")
            .style("height", "12px")
            .style("background-color", colors(d.stationName));

        item.append("span").text(d.stationName);

        item.on("click", function () {
            // Toggle Logic: If clicking the already selected station, deselect it
            if (selectedStationId === d.stationId) {
                selectedStationId = null;
            } else {
                selectedStationId = d.stationId;
            }

            updateSelectionVisuals();
        });
    });

    function updateSelectionVisuals() {
        if (selectedStationId === null) {
            // DEFAULT STATE: No active selection -> Reset all lines and legend boxes
            svg.selectAll("path.temp-line, path.humid-line")
                .style("opacity", 1)
                .style("stroke-width", 1.5);

            d3.selectAll(".legend-item")
                .style("background-color", "transparent")
                .style("border-color", "#ccc");
        } else {
            // FILTERED STATE: Highlight only the selected lines
            svg.selectAll("path.temp-line, path.humid-line")
                .style("opacity", 0.1)
                .style("stroke-width", 1);

            // Pop out the selected station's curves
            svg.selectAll(`.line-${selectedStationId}`)
                .style("opacity", 1)
                .style("stroke-width", 2.5);

            // Provide clear feedback on the legend interface
            d3.selectAll(".legend-item")
                .style("background-color", "transparent")
                .style("border-color", "#ccc");

            d3.select(`.legend-${selectedStationId}`)
                .style("background-color", "#f0f0f0")
                .style("border-color", "#333");
        }
    }

    // -------------------------------------------------------------------------
    // 7. BRUSH / ZOOM CONTROLLER (CONTEXT TRACK)
    // -------------------------------------------------------------------------
    const contextGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top + (height * 2) + 80})`);

    // Render a simple horizontal baseline axis for the brush tracker
    const contextAxis = d3.axisBottom(xScaleContext);
    contextGroup.append("g")
        .attr("transform", `translate(0,${contextHeight})`)
        .call(contextAxis);

    // Instantiate the D3 brush tool restricted along the horizontal plane
    const brush = d3.brushX()
        .extent([[0, 0], [width, contextHeight]])
        .on("brush end", brushed);

    // Append the structural brush block element to the context canvas
    contextGroup.append("g")
        .attr("class", "brush")
        .call(brush);

    // The Zoom Execution Function
    function brushed(event) {
        const selection = event.selection;

        // If there is no active selection window, default back to the entire 10-year domain
        if (!selection) {
            xScale.domain(xScaleContext.domain());
        } else {
            // Convert the structural pixel coordinates back into real calendar Dates
            xScale.domain([xScaleContext.invert(selection[0]), xScaleContext.invert(selection[1])]);
        }

        // 1. Redraw both of the primary top and bottom time-axes using the newly scaled window
        tempGroup.select(".x-axis").call(d3.axisBottom(xScale).tickFormat(""));
        humidGroup.select(".x-axis").call(d3.axisBottom(xScale));

        // 2. Smoothly map the path vectors coordinates across the recalculated domain mapping 
        tempGroup.selectAll(".temp-line")
            .attr("d", d => tempLine(d.history));

        humidGroup.selectAll(".humid-line")
            .attr("d", d => humidLine(d.history));
    }
}