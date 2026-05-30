import * as d3 from 'd3';
import { createTimeSeries } from './q1_q2.js';
import { createParallelCoordinates } from './q3.js';
import { createParallelSets } from './q4.js';

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

        // Q1 & Q2: Trigger your time-series initialization
        createTimeSeries(dailyClimateData, stationData);

        // Q3: Trigger your parallel coordinates plot
        createParallelCoordinates(dailyClimateData, stationData);
        
        // Q4: Trigger your parallel sets function
        createParallelSets(dailyClimateData, stationData);
    })
    .catch(error => {
        console.error("Error loading the CSV files: ", error);
    });