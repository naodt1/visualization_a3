import * as d3 from 'd3';

export function createParallelCoordinates(dailyClimateData, stationData) {
    // -------------------------------------------------------------------------
    // 1. DATA PRE-PROCESSING & CATEGORIZATION
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
                // Categorize into 1 (Low), 2 (Medium), 3 (High) based on meteorological standards
                let tempLevel = avgTemp > 15 ? 3 : (avgTemp >= 5 ? 2 : 1);
                let humLevel = avgHumidity > 70 ? 3 : (avgHumidity >= 40 ? 2 : 1);
                let pressLevel = avgPressure > 1013 ? 3 : (avgPressure >= 980 ? 2 : 1);

                // We add a small random jitter so lines don't completely overlap
                const jitter = () => (Math.random() - 0.5) * 0.3;

                aggregatedData.push({
                    stationId: stationId,
                    stationName: stationName,
                    yearMonth: yearMonth,
                    "Temperature": tempLevel + jitter(),
                    "Humidity": humLevel + jitter(),
                    "Air Pressure": pressLevel + jitter(),
                    // Store raw values for the tooltip
                    rawTemp: avgTemp,
                    rawHum: avgHumidity,
                    rawPress: avgPressure,
                    // Store the base temp level to determine line color
                    baseTempLevel: tempLevel 
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

    // Create a color scale based on the Temperature level
    // 1 = Low (Blue), 2 = Medium (Orange), 3 = High (Red)
    const colorScale = d3.scaleOrdinal()
        .domain([1, 2, 3])
        .range(["#3498db", "#e67e22", "#e74c3c"]);

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
        // We use a linear scale from 0.5 to 3.5 to give breathing room for the jittered 1, 2, 3 values
        yScales[dim] = d3.scaleLinear()
            .domain([0.5, 3.5])
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
        // Color lines based on their temperature scale level
        .style("stroke", d => colorScale(d.baseTempLevel))
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
                Temperature: ${d.rawTemp.toFixed(1)} °C<br/>
                Humidity: ${d.rawHum.toFixed(1)} %<br/>
                Pressure: ${d.rawPress.toFixed(1)} hPa
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

    const tickFormatter = (val) => {
        if (val === 1) return "Low";
        if (val === 2) return "Medium";
        if (val === 3) return "High";
        return "";
    };

    axes.append("g")
        .each(function(d) { 
            d3.select(this).call(
                d3.axisLeft()
                  .scale(yScales[d])
                  .tickValues([1, 2, 3])
                  .tickFormat(tickFormatter)
            ); 
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
