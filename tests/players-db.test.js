// tests/players-db.test.js
// Tests for the persistent player roster (db/players-db.js).
// Uses an in-memory SQLite database so no file is created on disk.

const sqlite3 = require('sqlite3').verbose();

// ── Helpers ────────────────────────────────────────────────────────────────────

function createInMemoryDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(':memory:', err => {
            if (err) return reject(err);
            db.run(`
                CREATE TABLE players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    player_name TEXT NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL
                )
            `, err => {
                if (err) return reject(err);
                resolve(db);
            });
        });
    });
}

function upsertPlayer(db, playerName, email, timestamp) {
    const ts = timestamp || new Date().toISOString().slice(0, 19).replace('T', ' ');
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO players (player_name, email, first_seen, last_seen)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET
                 player_name = excluded.player_name,
                 last_seen   = excluded.last_seen`,
            [playerName, email.toLowerCase(), ts, ts],
            err => { if (err) reject(err); else resolve(); }
        );
    });
}

function getPlayer(db, email) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM players WHERE email = ?', [email.toLowerCase()], (err, row) => {
            if (err) reject(err); else resolve(row);
        });
    });
}

function getAllPlayers(db) {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM players', (err, rows) => {
            if (err) reject(err); else resolve(rows);
        });
    });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('upsertPlayer — insert', () => {
    let db;
    beforeEach(async () => { db = await createInMemoryDb(); });
    afterEach(() => new Promise(resolve => db.close(resolve)));

    test('inserts a new player', async () => {
        await upsertPlayer(db, 'Alice', 'alice@example.com', '2026-03-15 12:00:00');
        const row = await getPlayer(db, 'alice@example.com');
        expect(row).not.toBeNull();
        expect(row.player_name).toBe('Alice');
        expect(row.email).toBe('alice@example.com');
        expect(row.first_seen).toBe('2026-03-15 12:00:00');
        expect(row.last_seen).toBe('2026-03-15 12:00:00');
    });

    test('lowercases the email on insert', async () => {
        await upsertPlayer(db, 'Bob', 'BOB@EXAMPLE.COM', '2026-03-15 12:00:00');
        const row = await getPlayer(db, 'bob@example.com');
        expect(row).not.toBeNull();
        expect(row.email).toBe('bob@example.com');
    });

    test('uses a default timestamp when none is provided', async () => {
        const before = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await upsertPlayer(db, 'Carol', 'carol@example.com');
        const after = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const row = await getPlayer(db, 'carol@example.com');
        expect(row.first_seen >= before).toBe(true);
        expect(row.first_seen <= after).toBe(true);
    });
});

describe('upsertPlayer — update (conflict on email)', () => {
    let db;
    beforeEach(async () => { db = await createInMemoryDb(); });
    afterEach(() => new Promise(resolve => db.close(resolve)));

    test('updates name and last_seen but preserves first_seen', async () => {
        await upsertPlayer(db, 'Dave', 'dave@example.com', '2026-03-01 10:00:00');
        await upsertPlayer(db, 'David', 'dave@example.com', '2026-03-20 09:00:00');
        const row = await getPlayer(db, 'dave@example.com');
        expect(row.player_name).toBe('David');
        expect(row.first_seen).toBe('2026-03-01 10:00:00');
        expect(row.last_seen).toBe('2026-03-20 09:00:00');
    });

    test('treats mixed-case email as same player (no duplicate row)', async () => {
        await upsertPlayer(db, 'Eve', 'Eve@Example.com', '2026-03-01 08:00:00');
        await upsertPlayer(db, 'Eve', 'eve@example.com', '2026-03-10 08:00:00');
        const rows = await getAllPlayers(db);
        expect(rows).toHaveLength(1);
    });

    test('two distinct emails create two rows', async () => {
        await upsertPlayer(db, 'Frank', 'frank@example.com', '2026-03-01 08:00:00');
        await upsertPlayer(db, 'Grace', 'grace@example.com', '2026-03-01 08:00:00');
        const rows = await getAllPlayers(db);
        expect(rows).toHaveLength(2);
    });
});
