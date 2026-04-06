// db/players-db.js
// Persistent player roster — survives season resets of game.db
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'players.db');
const playersDb = new sqlite3.Database(dbPath);

function initializePlayersDatabase() {
    playersDb.serialize(() => {
        playersDb.run(`
            CREATE TABLE IF NOT EXISTS players (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                first_seen TEXT NOT NULL,
                last_seen TEXT NOT NULL
            )
        `, err => {
            if (err) console.error('Error creating players table:', err);
            else console.log('Players database initialized');
        });
    });
}

// Upsert a player by email. Updates name and last_seen if already present.
function upsertPlayer(playerName, email, timestamp) {
    const ts = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');
    playersDb.run(
        `INSERT INTO players (player_name, email, first_seen, last_seen)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET
             player_name = excluded.player_name,
             last_seen   = excluded.last_seen`,
        [playerName, email.toLowerCase(), ts, ts],
        err => {
            if (err) console.error(`Failed to upsert player ${email}:`, err.message);
        }
    );
}

module.exports = { playersDb, initializePlayersDatabase, upsertPlayer };
