// scripts/sync-players.js
// One-time (or repeatable) script to import all unique players from game.db
// into the persistent players.db. Safe to run multiple times — it upserts.
//
// Usage: node scripts/sync-players.js

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const gameDb    = new sqlite3.Database(path.join(__dirname, '../db/game.db'));
const playersDb = new sqlite3.Database(path.join(__dirname, '../db/players.db'));

playersDb.serialize(() => {
    // Create table if this is the first run
    playersDb.run(`
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            first_seen TEXT NOT NULL,
            last_seen TEXT NOT NULL
        )
    `, err => {
        if (err) { console.error('Error creating players table:', err); process.exit(1); }

        // Pull one row per unique email from game.db, grabbing the earliest and latest submission dates
        gameDb.all(`
            SELECT
                player_name,
                LOWER(email) AS email,
                MIN(submission_date) AS first_seen,
                MAX(submission_date) AS last_seen
            FROM entries
            GROUP BY LOWER(email)
            ORDER BY player_name
        `, (err, rows) => {
            if (err) { console.error('Error reading game.db:', err); process.exit(1); }

            if (rows.length === 0) {
                console.log('No entries found in game.db — nothing to sync.');
                cleanup(0);
                return;
            }

            console.log(`Found ${rows.length} unique email(s) in game.db. Syncing...`);

            let done = 0;
            let inserted = 0;
            let errors = 0;

            rows.forEach(row => {
                playersDb.run(
                    `INSERT INTO players (player_name, email, first_seen, last_seen)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(email) DO UPDATE SET
                         player_name = excluded.player_name,
                         last_seen   = MAX(last_seen, excluded.last_seen)`,
                    [row.player_name, row.email, row.first_seen, row.last_seen],
                    function(err) {
                        if (err) {
                            console.error(`  ERROR syncing ${row.email}:`, err.message);
                            errors++;
                        } else {
                            const action = this.changes === 1 && this.lastID ? 'inserted' : 'updated';
                            console.log(`  ${action}: ${row.player_name} <${row.email}>`);
                            inserted++;
                        }
                        done++;
                        if (done === rows.length) {
                            console.log(`\nDone. ${inserted} synced, ${errors} error(s).`);
                            cleanup(errors > 0 ? 1 : 0);
                        }
                    }
                );
            });
        });
    });
});

function cleanup(exitCode) {
    gameDb.close();
    playersDb.close();
    process.exit(exitCode);
}
