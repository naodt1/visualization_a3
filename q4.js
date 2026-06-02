import * as d3 from 'd3';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';

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

    // We will track the full path for each record so we can split the ribbons
    // and color them consistently by the initial Air Pressure category
    const fullPaths = {};

    dailyClimateData.forEach(d => {
        if (d.PRESSURE_AIR === undefined || d.PRESSURE_AIR === null || isNaN(d.PRESSURE_AIR)) return;
        
        const st = stationMap.get(d.STATION_ID);
        if (!st) return;

        const press = getPressureCat(d.PRESSURE_AIR);
        const loc = getLocationCat(st);
        const elev = getElevationCat(st);

        // Track the entire specific combination
        const key = `${press}|${loc}|${elev}`;
        fullPaths[key] = (fullPaths[key] || 0) + 1;
    });

    // -------------------------------------------------------------------------
    // 2. BUILD NODES AND LINKS ARRAYS
    // -------------------------------------------------------------------------
    const nodeNames = [
        "Low Pressure", "Medium Pressure", "High Pressure", // Layer 1
        "Coastal", "Continental",                           // Layer 2
        "Lowland", "Mountain"                               // Layer 3
    ];
    
    const nodes = nodeNames.map(name => ({ name }));
    const nodeIndex = Object.fromEntries(nodeNames.map((n, i) => [n, i]));

    const links = [];

    // By splitting the links up by their full path, d3-sankey will draw individual ribbons 
    // that run all the way through the nodes, allowing us to color them by Air Pressure!
    Object.entries(fullPaths).forEach(([key, count]) => {
        const [press, loc, elev] = key.split('|');

        // Link 1: Pressure -> Location
        links.push({
            source: nodeIndex[press],
            target: nodeIndex[loc],
            value: count,
            pressureCategory: press // Store this to color the ribbon
        });

        // Link 2: Location -> Elevation
        links.push({
            source: nodeIndex[loc],
            target: nodeIndex[elev],
            value: count,
            pressureCategory: press // Keep the exact same color!
        });
    });

    // -------------------------------------------------------------------------
    // 3. DIMENSIONS AND CANVAS SETUP
    // -------------------------------------------------------------------------
    const margin = { top: 20, right: 100, bottom: 20, left: 100 };
    const width = 900 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    d3.select("#parallel-sets-container").html("");

    const svg = d3.select("#parallel-sets-container")
        .append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Define specific colors for Pressure so they are consistent and recognizable
    // Use a unified, clean palette. 
    // Pressure gets distinct colors (Green/Orange/Red), while geographical nodes act as neutral structural anchors.
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
            "#555555", // Coastal: Neutral Dark
            "#555555", // Continental: Neutral Dark
            "#555555", // Lowland: Neutral Dark
            "#555555"  // Mountain: Neutral Dark
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
    const sankeyLayout = sankey()
        .nodeWidth(20)
        .nodePadding(30)
        .nodeSort((a, b) => nodeOrder[a.name] - nodeOrder[b.name])
        .extent([[0, 0], [width, height]]);

    const { nodes: sankeyNodes, links: sankeyLinks } = sankeyLayout({
        nodes: nodes.map(d => Object.assign({}, d)),
        links: links.map(d => Object.assign({}, d))
    });

    // -------------------------------------------------------------------------
    // 5. DRAW LINKS (RIBBONS)
    // -------------------------------------------------------------------------
    const link = svg.append("g")
        .attr("fill", "none")
        .selectAll("g")
        .data(sankeyLinks)
        .join("g")
        .style("mix-blend-mode", "multiply");

    link.append("path")
        .attr("d", sankeyLinkHorizontal())
        // Color the link consistently by its originating Pressure category
        .attr("stroke", d => color(d.pressureCategory))
        .attr("stroke-width", d => Math.max(1, d.width))
        .attr("stroke-opacity", 0.5)
        .on("mouseover", function(event, d) {
            d3.select(this).attr("stroke-opacity", 0.9);
        })
        .on("mouseout", function() {
            d3.select(this).attr("stroke-opacity", 0.5);
        })
        .append("title")
        .text(d => `${d.source.name} → ${d.target.name}\n${d.value.toLocaleString()} records\n(From ${d.pressureCategory})`);

    // -------------------------------------------------------------------------
    // 6. DRAW NODES (RECTANGLES)
    // -------------------------------------------------------------------------
    const node = svg.append("g")
        .selectAll("g")
        .data(sankeyNodes)
        .join("g");

    node.append("rect")
        .attr("x", d => d.x0)
        .attr("y", d => d.y0)
        .attr("height", d => d.y1 - d.y0)
        .attr("width", d => d.x1 - d.x0)
        .attr("fill", d => color(d.name))
        .attr("stroke", "#555")
        .append("title")
        .text(d => `${d.name}\n${d.value.toLocaleString()} records`);

    node.append("text")
        .attr("x", d => d.x0 < width / 2 ? d.x1 + 8 : d.x0 - 8)
        .attr("y", d => (d.y1 + d.y0) / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", d => d.x0 < width / 2 ? "start" : "end")
        .text(d => d.name)
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("fill", "#333");
}
