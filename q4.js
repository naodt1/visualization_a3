import * as d3 from 'd3';
import { sankey } from 'd3-sankey';

export function createParallelSets(dailyClimateData, stationData) {
    // -------------------------------------------------------------------------
    // 1. DATA PRE-PROCESSING & CATEGORIZATION
    // -------------------------------------------------------------------------
    const stationMap = new Map(stationData.map(s => [s.STATION_ID, s]));

    function getPressureCat(pressure) {
        if (pressure < 980) return "Low Pressure";
        if (pressure <= 1013) return "Medium Pressure";
        return "High Pressure";
    }

    function getLocationCat(station) {
        return station.DISTANCE_TO_SEA_KM < 100 ? "Coastal" : "Continental";
    }
    
    function getElevationCat(station) {
        return station.HEIGHT_ABOVE_SEA_LEVEL_M < 200 ? "Lowland" : "Mountain";
    }

    // Track the full path so we can split ribbons and highlight them interactively
    const fullPaths = {};

    dailyClimateData.forEach(d => {
        if (d.PRESSURE_AIR === undefined || d.PRESSURE_AIR === null || isNaN(d.PRESSURE_AIR)) return;
        
        const st = stationMap.get(d.STATION_ID);
        if (!st) return;

        const press = getPressureCat(d.PRESSURE_AIR);
        const loc = getLocationCat(st);
        const elev = getElevationCat(st);

        const key = `${press}|${loc}|${elev}`;
        fullPaths[key] = (fullPaths[key] || 0) + 1;
    });

    // -------------------------------------------------------------------------
    // 2. BUILD NODES AND LINKS ARRAYS
    // -------------------------------------------------------------------------
    const nodeNames = [
        "Low Pressure", "Medium Pressure", "High Pressure",
        "Coastal", "Continental",
        "Lowland", "Mountain"
    ];
    
    const nodes = nodeNames.map(name => ({ name }));
    const nodeIndex = Object.fromEntries(nodeNames.map((n, i) => [n, i]));

    const links = [];

    Object.entries(fullPaths).forEach(([key, count]) => {
        const [press, loc, elev] = key.split('|');

        // Link 1: Pressure -> Location
        links.push({
            source: nodeIndex[press],
            target: nodeIndex[loc],
            value: count,
            pressureCategory: press,
            fullPath: key 
        });

        // Link 2: Location -> Elevation
        links.push({
            source: nodeIndex[loc],
            target: nodeIndex[elev],
            value: count,
            pressureCategory: press,
            fullPath: key 
        });
    });

    // -------------------------------------------------------------------------
    // 3. DIMENSIONS AND CANVAS SETUP (VERTICAL LAYOUT)
    // -------------------------------------------------------------------------
    const margin = { top: 40, right: 20, bottom: 40, left: 20 };
    // We keep a wide aspect ratio since it's going top to bottom now
    const width = 900 - margin.left - margin.right;
    const height = 500 - margin.top - margin.bottom;

    d3.select("#parallel-sets-container").html("");

    const svg = d3.select("#parallel-sets-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const color = d3.scaleOrdinal()
        .domain([
            "Low Pressure", "Medium Pressure", "High Pressure", 
            "Coastal", "Continental", 
            "Lowland", "Mountain"
        ])
        .range([
            "#2ecc71", // Low Pressure: Green
            "#f39c12", // Medium Pressure: Orange
            "#e74c3c", // High Pressure: Red
            "#555555", // Neutral structural anchors
            "#555555",
            "#555555",
            "#555555"
        ]);

    const nodeOrder = {
        "High Pressure": 1,
        "Medium Pressure": 2,
        "Low Pressure": 3,
        "Coastal": 4,
        "Continental": 5,
        "Lowland": 6,
        "Mountain": 7
    };

    // -------------------------------------------------------------------------
    // 4. SANKEY LAYOUT CONFIGURATION
    // -------------------------------------------------------------------------
    // Note: We swap width and height in the extent!
    // Flow is along the first coordinate (now height), transverse is along the second (now width)
    const sankeyLayout = sankey()
        .nodeWidth(20)
        .nodePadding(40)
        .nodeSort((a, b) => nodeOrder[a.name] - nodeOrder[b.name])
        .extent([[0, 0], [height, width]]);

    const { nodes: sankeyNodes, links: sankeyLinks } = sankeyLayout({
        nodes: nodes.map(d => Object.assign({}, d)),
        links: links.map(d => Object.assign({}, d))
    });

    // -------------------------------------------------------------------------
    // 5. DRAW LINKS (VERTICAL RIBBONS)
    // -------------------------------------------------------------------------
    // Custom vertical link generator
    function sankeyLinkVertical(d) {
        const x0 = d.y0;           // Link's transverse (horizontal) start
        const y0 = d.source.x1;    // Link's flow (vertical) start (bottom of source node)
        const x1 = d.y1;           // Link's transverse (horizontal) end
        const y1 = d.target.x0;    // Link's flow (vertical) end (top of target node)
        const halfY = (y0 + y1) / 2;
        return `M${x0},${y0} C${x0},${halfY} ${x1},${halfY} ${x1},${y1}`;
    }

    const linkPaths = svg.append("g")
        .attr("fill", "none")
        .selectAll("path")
        .data(sankeyLinks)
        .join("path")
        .style("mix-blend-mode", "multiply")
        .attr("d", sankeyLinkVertical)
        .attr("stroke", d => color(d.pressureCategory))
        .attr("stroke-width", d => Math.max(1, d.width))
        .attr("stroke-opacity", 0.5);

    linkPaths.append("title")
        .text(d => `${d.source.name} → ${d.target.name}\n${d.value.toLocaleString()} records\n(From ${d.pressureCategory})`);

    // -------------------------------------------------------------------------
    // 6. DRAW NODES (RECTANGLES) & INTERACTION
    // -------------------------------------------------------------------------
    let selectedNode = null;
    
    // Calculate total records (sum of Layer 1 nodes is sufficient, or sum of all fullPaths)
    const totalRecords = Object.values(fullPaths).reduce((a, b) => a + b, 0);

    // Add a dynamic info text at the top right of the chart
    const infoText = svg.append("text")
        .attr("x", width)
        .attr("y", -10)
        .attr("text-anchor", "end")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("fill", "#555")
        .text("Click a node to see details");

    const node = svg.append("g")
        .selectAll("g")
        .data(sankeyNodes)
        .join("g")
        .style("cursor", "pointer")
        .on("click", function(event, d) {
            // Toggle selection logic
            if (selectedNode === d.name) {
                selectedNode = null; // Deselect
                linkPaths.transition().duration(200).attr("stroke-opacity", 0.5);
                node.transition().duration(200).attr("opacity", 1);
                infoText.text("Click a node to see details");
            } else {
                selectedNode = d.name; // Select
                
                // Calculate percentage
                const percentage = ((d.value / totalRecords) * 100).toFixed(1);
                infoText.text(`${d.name}: ${d.value.toLocaleString()} records (${percentage}% of total)`);

                // Dim links that do not pass through this node
                linkPaths.transition().duration(200).attr("stroke-opacity", linkData => {
                    return linkData.fullPath.includes(selectedNode) ? 0.9 : 0.05;
                });
            }
        });

    node.append("rect")
        // Swap x and y logic due to the inverted extent trick
        .attr("x", d => d.y0)
        .attr("y", d => d.x0)
        .attr("width", d => d.y1 - d.y0)
        .attr("height", d => d.x1 - d.x0)
        .attr("fill", d => color(d.name))
        .attr("stroke", "#333")
        .append("title")
        .text(d => `Click to filter: ${d.name}\n${d.value.toLocaleString()} records`);

    node.append("text")
        // Center text horizontally on the node
        .attr("x", d => (d.y0 + d.y1) / 2)
        // Place text above the top layer, and below the bottom layer
        .attr("y", d => d.x0 < height / 2 ? d.x0 - 10 : d.x1 + 15)
        .attr("text-anchor", "middle")
        .text(d => d.name)
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("fill", "#333")
        .style("pointer-events", "none"); // don't interfere with click
}
