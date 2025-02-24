// Import modules using ES syntax
import fs from 'fs/promises';
import * as cheerio from 'cheerio';
import { extractRaceData } from './extract_results.js';

// Function to extract race names from HTML
async function extractRaceNames(url) {
    const BASE_URL = 'https://stats.protriathletes.org';
     
    try {
        const $ = await cheerio.fromURL(url);

        const races = new Set();

        $('.race-name-and-tier').each((index, element) => {
            const raceName = $(element).find('a.racename span b').text().trim();
            const raceLink = BASE_URL + $(element).find('a.racename').attr('href')?.trim();
            const raceType = $(element).find('span').last().text().trim();

            if (raceName && raceLink && raceType !== 'Short course') {
                races.add(JSON.stringify({ name: raceName, link: raceLink }));
            }
        });

        return Array.from(races).map(item => JSON.parse(item));
    } catch (error) {
        console.error('Error:', error);
    }
}

// Function to load JSON file (tracked_races.json)
async function loadTrackedRaces(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`File "${filePath}" not found. Using an empty array.`);
            return [];
        } else {
            throw error;
        }
    }
}

// Function to save JSON file (race_names.json)
async function saveNewRaces(filePath, data) {
    try {
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        console.log(`New races have been written to ${filePath}`);
    } catch (error) {
        console.error('Error saving file:', error);
    }
}

// Function to filter only new races
function getNewRaces(scrapedRaces, trackedRaces) {
    const trackedSet = new Set(trackedRaces.map(race => JSON.stringify(race)));
    return scrapedRaces.filter(race => !trackedSet.has(JSON.stringify(race)));
}

// Main script
(async () => {
    const url = 'https://stats.protriathletes.org/results?year=2025&distance=&tier=&sof=&division=BOTH';
    const trackedFile = 'tracked_races.json';

    try {
        const fetchedRaceList = await extractRaceNames(url);
        const trackedRaces = await loadTrackedRaces(trackedFile);

        const newRaces = getNewRaces(fetchedRaceList, trackedRaces);

        if (newRaces.length > 0) {
            newRaces.forEach(race => {
                extractRaceData(race.link)                
            });
        } else {
            console.log('No new races found.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
})();
