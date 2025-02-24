// Import modules using ES syntax
import { writeFile } from 'fs/promises';
import { load } from 'cheerio';

// Function to convert time strings to LocalTime format (HH:mm:ss)
function convertToLocalTime(time) {
    if (!time) return null;
    const parts = time.split(':').map(Number);
    if (parts.length === 2) parts.unshift(0); // Add hours if missing
    return parts.map(num => String(num).padStart(2, '0')).join(':');
}

// Function to extract numeric value inside parentheses
function extractRank(value) {
    const match = value.match(/\((\d+)\)/);
    return match ? parseInt(match[1], 10) : null;
}

// Function to parse race info with dynamic fields
function parseRaceInfo($) {
    const raceInfo = {};
    raceInfo.name = $('h1').text().trim();
    $('.race-info div > div').each((_, element) => {
        const label = $(element).find('b').text().replace(':', '').trim().toLowerCase();
        const value = $(element).find('a span').length
            ? $(element).find('a span').text().trim()
            : $(element).contents().filter((_, el) => el.nodeType === 3).text().trim();

        if (value) {
            switch (label) {
                case 'location':
                    raceInfo.location = value;
                    break;
                case 'distance':
                    raceInfo.distance = value;
                    break;
                case 'organizer':
                    raceInfo.organizer = value;
                    break;
                case 'dates':
                case 'date':
                    const dateMatches = value.match(/\d{2}\s\w{3}\s\d{4}.*?\)/g);
                    if (dateMatches && dateMatches.length > 1) {
                        dateMatches.forEach(dateString => {
                            const [day, month, year] = dateString.match(/\d{2}\s\w{3}\s\d{4}/)[0].split(' ');
                            const monthMap = {
                                Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                                Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
                            };
                            const formattedDate = `${year}-${monthMap[month]}-${day}`;

                            if (dateString.includes('(FPRO)')) {
                                raceInfo.femaleProDate = formattedDate;
                            } else if (dateString.includes('(MPRO)')) {
                                raceInfo.maleProDate = formattedDate;
                            }
                        });
                    } else {
                        const dateMatch = value.match(/\d{2}\s\w{3}\s\d{4}/);
                        if (dateMatch) {
                            const [day, month, year] = dateMatch[0].split(' ');
                            const monthMap = {
                                Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
                                Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12'
                            };
                            raceInfo.date = `${year}-${monthMap[month]}-${day}`;
                        }
                    }
                    break;
                case 'tier':
                    raceInfo.tier = value;
                    break;
                case 'prize money':
                    const match = value.match(/([\d,.]+)\s*(\w+)/);
                    if (match) {
                        raceInfo.prizeMoney = {
                            amount: parseFloat(match[1].replace(',', '')),
                            currency: match[2]
                        };
                    }
                    break;
                default:
                    raceInfo[label] = value;
            }
        }
    });
    return raceInfo;
}

// Function to parse athlete data
// Function to parse athlete data
function parseAthleteData($, element, hasTransitions) {
    const position = parseInt($(element).find('td').eq(0).text().trim(), 10);
    const athlete = $(element).find('.name').text().trim();

    const swimElement = $(element).find('td').eq(2);
    const swim = {
        time: convertToLocalTime(swimElement.text().split(' ')[0].trim()),
        rank: swimElement.attr('data-sort') ? parseInt(swimElement.attr('data-sort'), 10) : null
    };

    const bikeElement = hasTransitions
        ? $(element).find('td').eq(4)
        : $(element).find('td').eq(3);
    const bike = {
        time: convertToLocalTime(bikeElement.text().split(' ')[0].trim()),
        rank: bikeElement.attr('data-sort') ? parseInt(bikeElement.attr('data-sort'), 10) : null
    };

    const runElement = hasTransitions
        ? $(element).find('td').eq(6)
        : $(element).find('td').eq(4);
    const run = {
        time: convertToLocalTime(runElement.text().split(' ')[0].trim()),
        rank: runElement.attr('data-sort') ? parseInt(runElement.attr('data-sort'), 10) : null
    };

    const overallElement = hasTransitions
        ? $(element).find('td').eq(7)
        : $(element).find('td').eq(5);
    const overall = convertToLocalTime(overallElement.text().trim());

    const ptoPtsRaw = hasTransitions
        ? $(element).find('td').eq(8).text().trim()
        : $(element).find('td').eq(6).text().trim();
    const ptoPts = parseFloat(ptoPtsRaw);

    // Store data for each athlete in the desired order
    const athleteData = {
        position,
        athlete,
        swim
    };

    if (hasTransitions) {
        athleteData.t1 = convertToLocalTime($(element).find('td').eq(3).text().trim());
    }

    athleteData.bike = bike;

    if (hasTransitions) {
        athleteData.t2 = convertToLocalTime($(element).find('td').eq(5).text().trim());
    }

    athleteData.run = run;
    athleteData.overall = overall;
    athleteData.ptoPts = ptoPts;

    return athleteData;
}

// Function to extract data from HTML
async function extractData(url) {
    try {
        // Fetch HTML content using fetch
        const response = await fetch(url);
        const html = await response.text();

        // Load HTML content into Cheerio
        const $ = load(html);

        // Extract Race Info
        const raceInfo = parseRaceInfo($);

        // Initialize an array to store extracted results
        const triathlonResults = [];

        // Extract data for exact matches "Women" and "Men"
        $('h2').each((index, section) => {
            const gender = $(section).text().trim();
            if (gender === "Women" || gender === "Men") {
                const results = [];

                // Extract SOF
                const sof = $(section).closest('.d-flex').find('.h3').text().match(/SOF:\s([\d.]+)/);
                const sofValue = sof ? parseFloat(sof[1]) : null;

                // Determine the correct date
                let date = raceInfo.date || null;
                if (gender === "Women" && raceInfo.femaleProDate) {
                    date = raceInfo.femaleProDate;
                } else if (gender === "Men" && raceInfo.maleProDate) {
                    date = raceInfo.maleProDate;
                }

                // Check if T1 and T2 are present
                const headerRow = $(section).closest('.section-bottom').find('tr').first();
                const hasTransitions = headerRow.find('td:contains("T1")').length > 0;

                $(section).closest('.section-bottom').find('tr').each((index, element) => {
                    if (index !== 0) {
                        results.push(parseAthleteData($, element, hasTransitions));
                    }
                });

                // Store results for this gender category
                triathlonResults.push({ gender, sof: sofValue, date, results });
            }
        });

        // Remove dates from raceInfo since they're now inside gender objects
        delete raceInfo.date;
        delete raceInfo.femaleProDate;
        delete raceInfo.maleProDate;

        // Return the extracted data with race info
        return { raceInfo, triathlonResults };
    } catch (error) {
        console.error('Error:', error);
    }
}

// URL of the page to scrape
// const url = 'https://stats.protriathletes.org/race/ironman-703-valdivia/2024/results';

// Call the function to extract data and write to JSON file
export function extractRaceData(url) {

    extractData(url)
    .then(async (data) => {
        if (data) {
            const outputFile = data.raceInfo.name.replace(/\s/g, '_').toLowerCase() + '.json';

            // Write the data to JSON file
            await writeFile(outputFile, JSON.stringify(data, null, 2));
            console.log(`Data has been written to ${outputFile}`);
        } else {
            console.error('No data to write');
        }
    })
    .catch(error => {
        console.error('Error:', error);
    });
}
