import * as d3 from 'd3';

// Load data
// This time, we will load mutliple files at once using Promises
const base_path = 'data/'
const files = ['reduced_daily_climate_summary.csv', 'station.csv'];

// We load each file and wait until all files are loaded
Promise.all(files.map(d => d3.csv(base_path + d, d3.autoType)))
    .then(data => {
        console.log(data)

        // Your visualizations code here
    })

