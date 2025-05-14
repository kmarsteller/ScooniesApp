// scripts/download-logos.js
// make sure teams.csv is ready, then run to pull team logos into public/images/logos
// run with "node download-logos.js"

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const csv = require('csv-parser');

// Create directories if they don't exist
const logoDir = path.join(__dirname, '..', 'public', 'images', 'logos');
if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
    console.log('Created logos directory:', logoDir);
}

// Function to download a file from a URL
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        // Determine whether to use http or https
        const protocol = url.startsWith('https') ? https : http;
        
        const file = fs.createWriteStream(destPath);
        
        protocol.get(url, response => {
            // Handle redirects
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                console.log(`Redirected to ${redirectUrl}`);
                downloadFile(redirectUrl, destPath).then(resolve).catch(reject);
                return;
            }
            
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}, status code: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                console.log(`Downloaded: ${path.basename(destPath)}`);
                resolve();
            });
            
            file.on('error', err => {
                fs.unlink(destPath, () => {}); // Delete the file if there was an error
                reject(err);
            });
        }).on('error', err => {
            fs.unlink(destPath, () => {}); // Delete the file if there was an error
            reject(err);
        });
    });
}

// Read teams.csv and download logos
const results = [];
fs.createReadStream(path.join(__dirname, '..', 'public', 'teams.csv'))
    .pipe(csv())
    .on('data', data => results.push(data))
    .on('end', async () => {
        console.log(`Found ${results.length} teams in CSV file`);
        
        // Create a map to track team name and region combinations
        const teamMap = new Map();
        
        // Process each team
        for (const team of results) {
            // Create safe filename
            const teamName = team.team_name || '';
            const region = team.region || '';
            const seed = team.seed || '';
            
            // Skip if missing data
            if (!teamName || !region || !seed) {
                console.warn('Skipping team with missing data:', team);
                continue;
            }
            
            // Skip if no logo URL
            if (!team.logo_url) {
                console.warn(`No logo URL for ${teamName} (${region})`);
                continue;
            }
            
            // Create unique key for this team
            const key = `${teamName}-${region}`;
            
            // Check if we've already processed this team
            if (teamMap.has(key)) {
                console.warn(`Duplicate team entry: ${key}`);
                continue;
            }
            
            teamMap.set(key, true);
            
            // Create safe filename
            const safeTeamName = teamName.toLowerCase().replace(/[^a-z0-9]/g, '-');
            const filename = `${safeTeamName}.png`;
            const destPath = path.join(logoDir, filename);
            
            try {
                await downloadFile(team.logo_url, destPath);
            } catch (error) {
                console.error(`Error downloading logo for ${teamName} (${region}):`, error.message);
            }
        }
        
        console.log('Finished downloading team logos');
    });
