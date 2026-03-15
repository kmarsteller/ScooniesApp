// scripts/rename-first-four.js
// Renames a First Four placeholder team to the actual winner after the game is played.
// Updates tournament_progress, team_selections, AND teams.csv atomically.
//
// Usage (run from ScooniesApp directory):
//   node scripts/rename-first-four.js "<old name>" "<new name>" <region> "<logo url>"
//
// Examples:
//   node scripts/rename-first-four.js "Texas/NC State" "Texas" West "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/251.png"
//   node scripts/rename-first-four.js "SMU/Miami (OH)" "SMU" Midwest "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2567.png"
//   node scripts/rename-first-four.js "UMBC/Howard" "UMBC" Midwest "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2378.png"
//   node scripts/rename-first-four.js "Prairie View A&M/Lehigh" "Prairie View A&M" South "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2504.png"

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

const [,, oldName, newName, region, logoUrl] = process.argv;

if (!oldName || !newName || !region || !logoUrl) {
    console.error('Usage: node scripts/rename-first-four.js "<old name>" "<new name>" <region> "<logo url>"');
    process.exit(1);
}

const dbPath  = path.join(__dirname, '..', 'db', 'game.db');
const csvPath = path.join(__dirname, '..', 'public', 'teams.csv');

// --- Update teams.csv ---
function updateCsv() {
    const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
    let matched = 0;
    const updated = lines.map(line => {
        const parts = line.split(',');
        // Format: seed,logo_url,team_name,region
        if (parts.length < 4) return line;
        const csvTeam   = parts[2].trim();
        const csvRegion = parts[3].trim();
        if (csvTeam === oldName && csvRegion === region) {
            matched++;
            parts[1] = logoUrl;
            parts[2] = newName;
            return parts.join(',');
        }
        return line;
    });
    fs.writeFileSync(csvPath, updated.join('\n'), 'utf8');
    console.log(`✓ teams.csv:           ${matched} row(s) updated`);
    if (matched === 0) {
        console.warn('  (No rows matched in teams.csv — check name and region)');
    }
}

// --- Update database ---
const db = new sqlite3.Database(dbPath, err => {
    if (err) { console.error('Could not open database:', err.message); process.exit(1); }
});

console.log(`\nRenaming "${oldName}" → "${newName}" in region "${region}"`);
console.log(`Logo: ${logoUrl}`);
console.log('─'.repeat(60));

db.serialize(() => {
    db.run('BEGIN TRANSACTION');

    // 1. Rename + update logo in tournament_progress
    db.run(
        `UPDATE tournament_progress SET team_name = ?, logo_url = ? WHERE team_name = ? AND region = ?`,
        [newName, logoUrl, oldName, region],
        function(err) {
            if (err) {
                db.run('ROLLBACK');
                console.error('✗ Error updating tournament_progress:', err.message);
                process.exit(1);
            }
            console.log(`✓ tournament_progress: ${this.changes} row(s) updated`);
            if (this.changes === 0) console.warn('  (No rows matched — check name and region)');
        }
    );

    // 2. Rename in team_selections (user picks)
    db.run(
        `UPDATE team_selections SET team_name = ? WHERE team_name = ? AND region = ?`,
        [newName, oldName, region],
        function(err) {
            if (err) {
                db.run('ROLLBACK');
                console.error('✗ Error updating team_selections:', err.message);
                process.exit(1);
            }
            console.log(`✓ team_selections:     ${this.changes} row(s) updated (user picks)`);
        }
    );

    db.run('COMMIT', err => {
        if (err) {
            console.error('✗ Commit failed:', err.message);
            process.exit(1);
        }
        // 3. Update teams.csv after DB commit succeeds
        updateCsv();
        console.log('\n✓ All done.');
        db.close();
    });
});
