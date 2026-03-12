// scripts/download-logos.js
// Reads public/teams.csv and downloads each team logo into public/images/logos/
// Run from the ScooniesApp directory: node scripts/download-logos.js
// CSV format: seed,logo_url,team_name,region  (header row optional)

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const csvPath = path.join(__dirname, '..', 'public', 'teams.csv');
const logoDir = path.join(__dirname, '..', 'public', 'images', 'logos');

// Create logos directory if it doesn't exist
if (!fs.existsSync(logoDir)) {
    fs.mkdirSync(logoDir, { recursive: true });
    console.log('Created logos directory:', logoDir);
}

// Parse CSV manually — no external dependencies needed
function parseCsv(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

    const teams = [];
    lines.forEach((line, i) => {
        // Skip header row
        if (i === 0 && line.toLowerCase().startsWith('seed')) return;
        const parts = line.split(',').map(p => p.trim());
        if (parts.length < 3) return;

        // Support both formats:
        //   4-col: seed, logo_url, team_name, region
        //   3-col: seed, team_name, region  (no logo — will be skipped)
        const hasLogoCol = parts.length >= 4 && (parts[1].startsWith('http') || parts[1] === '');
        const seed     = parseInt(parts[0]);
        const logoUrl  = hasLogoCol ? parts[1] : null;
        const teamName = hasLogoCol ? parts[2] : parts[1];
        const region   = hasLogoCol ? parts[3] : parts[2];

        if (!teamName || !region || isNaN(seed)) return;
        teams.push({ seed, logo_url: logoUrl, team_name: teamName, region });
    });
    return teams;
}

// Download a single file, following redirects
function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);

        protocol.get(url, response => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                fs.unlink(destPath, () => {});
                downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(destPath, () => {});
                reject(new Error(`HTTP ${response.statusCode} for ${url}`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
            file.on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
        }).on('error', err => { fs.unlink(destPath, () => {}); reject(err); });
    });
}

// Convert team name to logo filename (matches the pattern used in entries.js)
function safeFilename(teamName) {
    return teamName
        .toLowerCase()
        .replace(/[''']/g, '-')
        .replace(/&/g, ' ')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

// Main
(async () => {
    console.log(`Reading ${csvPath}...`);
    const teams = parseCsv(csvPath);
    console.log(`Found ${teams.length} teams`);

    let downloaded = 0, skipped = 0, errors = 0;
    const seen = new Set();

    for (const team of teams) {
        const key = `${team.team_name}-${team.region}`;
        if (seen.has(key)) {
            console.warn(`Duplicate skipped: ${key}`);
            skipped++;
            continue;
        }
        seen.add(key);

        if (!team.logo_url) {
            console.warn(`No logo URL for ${team.team_name} — skipped`);
            skipped++;
            continue;
        }

        const filename = safeFilename(team.team_name) + '.png';
        const destPath = path.join(logoDir, filename);

        try {
            await downloadFile(team.logo_url, destPath);
            console.log(`✓  ${team.team_name} → ${filename}`);
            downloaded++;
        } catch (err) {
            console.error(`✗  ${team.team_name}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped, ${errors} errors`);
})();
