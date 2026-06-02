import * as d3 from 'd3';

export function createParallelCoordinates(dailyClimateData, stationData) {
    // -------------------------------------------------------------------------
    // 1. DATA PRE-PROCESSING
    // -------------------------------------------------------------------------
    const stationMap = new Map(stationData.map(s => [s.STATION_ID, s.STATION_NAME]));

    // Aggregate daily data into monthly averages
    const nestedData = d3.groups(dailyClimateData,
        d => d.STATION_ID,
        d => `${d.DATE.getFullYear()}-${String(d.DATE.getMonth() + 1).padStart(2, '0')}`
    );

    const aggregatedData = [];
    nestedData.forEach(([stationId, months]) => {
        const stationName = stationMap.get(stationId) || `Station ${stationId}`;
        months.forEach(([yearMonth, days]) => {
            const avgTemp = d3.mean(days, d => d.TEMPERATURE_AIR);
            const avgHumidity = d3.mean(days, d => d.HUMIDITY);
            const avgPressure = d3.mean(days, d => d.PRESSURE_AIR);
            
            if (avgTemp !== undefined && avgHumidity !== undefined && avgPressure !== undefined) {
                aggregatedData.push({
                    stationId: stationId,
                    stationName: stationName,
                    yearMonth: yearMonth,
                    "Temperature": avgTemp,
                    "Humidity": avgHumidity,
                    "Air Pressure": avgPressure
                });
            }
        });
    });

    // -------------------------------------------------------------------------
    // 2. DIMENSIONS AND CANVAS SETUP
    // -------------------------------------------------------------------------
    const margin = { top: 40, right: 60, bottom: 20, left: 60 };
    const width = 900 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    // Clear any previous container content if called multiple times
    d3.select("#pcp-container").html("");

    const svg = d3.select("#pcp-container")
        .style("position", "relative") // to bound the absolute tooltip
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create a continuous color scale based on Temperature
    const colorScale = d3.scaleSequential(d3.interpolateTurbo)
        .domain(d3.extent(aggregatedData, d => d["Temperature"]));

    // Create Tooltip
    const tooltip = d3.select("body").append("div")
        .attr("class", "pcp-tooltip")
        .style("position", "absolute")
        .style("background", "rgba(255, 255, 255, 0.95)")
        .style("border", "1px solid #ccc")
        .style("border-radius", "8px")
        .style("padding", "10px")
        .style("pointer-events", "none")
        .style("opacity", 0)
        .style("box-shadow", "0 4px 6px rgba(0,0,0,0.1)")
        .style("font-size", "12px")
        .style("z-index", 1000);

    // -------------------------------------------------------------------------
    // 3. AXES & SCALES
    // -------------------------------------------------------------------------
    const dimensions = ["Temperature", "Humidity", "Air Pressure"];

    const yScales = {};
    dimensions.forEach(dim => {
        // Quantitative scale based on min/max of the data
        yScales[dim] = d3.scaleLinear()
            .domain(d3.extent(aggregatedData, d => d[dim]))
            .range([height, 0]);
    });

    const xScale = d3.scalePoint()
        .range([0, width])
        .padding(0.1)
        .domain(dimensions);

    // -------------------------------------------------------------------------
    // 4. DRAW LINES AND HOVER INTERACTIONS
    // -------------------------------------------------------------------------
    function path(d) {
        return d3.line()(dimensions.map(p => [xScale(p), yScales[p](d[p])]));
    }

    const lines = svg.selectAll("path.pcp-line")
        .data(aggregatedData)
        .enter()
        .append("path")
        .attr("class", d => `pcp-line pcp-line-${d.stationId}`)
        .attr("d", path)
        .style("fill", "none")
        // Color lines based on their exact temperature value
        .style("stroke", d => colorScale(d["Temperature"]))
        .style("stroke-width", 1.5)
        .style("opacity", 0.4)
        .on("mouseover", function(event, d) {
            // Highlight hovered line
            d3.select(this)
                .style("stroke-width", 4)
                .style("opacity", 1)
                .raise(); // bring to front

            // Show Tooltip with real raw info
            tooltip.transition().duration(200).style("opacity", 1);
            tooltip.html(`
                <strong>${d.stationName}</strong> (${d.yearMonth})<br/>
                <hr style="margin: 4px 0; border-top: 1px solid #ddd;" />
                Temperature: ${d["Temperature"].toFixed(1)} °C<br/>
                Humidity: ${d["Humidity"].toFixed(1)} %<br/>
                Pressure: ${d["Air Pressure"].toFixed(1)} hPa
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 28) + "px");
        })
        .on("mousemove", function(event) {
            tooltip.style("left", (event.pageX + 15) + "px")
                   .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function(event, d) {
            // Un-highlight line
            d3.select(this)
                .style("stroke-width", 1.5)
                // If there are active brushes, we must respect their opacity, otherwise revert to 0.4
                .style("opacity", function() {
                    return d3.select(this).classed("brushed-hidden") ? 0.05 : 0.4;
                });

            tooltip.transition().duration(500).style("opacity", 0);
        });

    // -------------------------------------------------------------------------
    // 5. DRAW AXES AND BRUSHING
    // -------------------------------------------------------------------------
    const axes = svg.selectAll(".dimension")
        .data(dimensions)
        .enter()
        .append("g")
        .attr("class", "dimension")
        .attr("transform", d => `translate(${xScale(d)},0)`);

    axes.append("g")
        .each(function(d) { 
            // Standard linear numeric axes
            d3.select(this).call(d3.axisLeft().scale(yScales[d])); 
        })
        .append("text")
        .style("text-anchor", "middle")
        .attr("y", -20)
        .text(d => d)
        .style("fill", "black")
        .style("font-size", "14px")
        .style("font-weight", "bold");

    // Add and store a brush for each axis
    const brushes = {};
    const extents = {};

    axes.each(function(d) {
        extents[d] = null; 
        brushes[d] = d3.brushY()
            .extent([[-15, 0], [15, height]])
            .on("brush end", (event) => brushed(event, d));
        
        d3.select(this).append("g")
            .attr("class", "brush")
            .call(brushes[d]);
    });

    function brushed(event, dimension) {
        if (!event.selection) {
            extents[dimension] = null;
        } else {
            extents[dimension] = [
                yScales[dimension].invert(event.selection[1]),
                yScales[dimension].invert(event.selection[0])
            ];
        }

        // Check which lines are selected
        lines.each(function(d) {
            const isSelected = dimensions.every(p => {
                if (!extents[p]) return true;
                const val = d[p];
                return val >= extents[p][0] && val <= extents[p][1];
            });

            // We use a CSS class approach so mouseout knows whether to stay hidden or visible
            d3.select(this).classed("brushed-hidden", !isSelected);

            d3.select(this)
                .style("opacity", isSelected ? 0.8 : 0.05)
                .style("stroke-width", isSelected ? 2 : 1);
        });
    }
}
