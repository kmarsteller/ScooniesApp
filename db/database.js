// db/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Make sure the db directory exists
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Database connection
const dbPath = path.join(__dirname, 'game.db');
const db = new sqlite3.Database(dbPath);

// Initialize database tables
function initializeDatabase() {
    db.serialize(() => {
        // Create tables if they don't exist
        
        // Entries table
        db.run(`
            CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                player_name TEXT NOT NULL,
                email TEXT NOT NULL,
                nickname TEXT NOT NULL,
                score INTEGER DEFAULT 0,
                submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Team selections table
        db.run(`
            CREATE TABLE IF NOT EXISTS team_selections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                entry_id INTEGER NOT NULL,
                team_name TEXT NOT NULL,
                seed INTEGER NOT NULL,
                region TEXT NOT NULL,
                cost INTEGER NOT NULL,
                points_earned INTEGER DEFAULT 0,
                FOREIGN KEY (entry_id) REFERENCES entries (id) ON DELETE CASCADE
            )
        `);
        
        // Tournament progress table
        db.run(`
            CREATE TABLE IF NOT EXISTS tournament_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                team_name TEXT NOT NULL,
                region TEXT NOT NULL,
                seed INTEGER NOT NULL,
                round_reached INTEGER DEFAULT 1,
                is_eliminated BOOLEAN DEFAULT 0,
                is_final_four BOOLEAN DEFAULT 0,
                is_finalist BOOLEAN DEFAULT 0,
                is_champion BOOLEAN DEFAULT 0
            )
        `);
        
        // Add this to your database.js file in the initializeDatabase function
        // After creating the tournament_progress table:

        // Check if tournament_progress table is empty
        db.get("SELECT COUNT(*) as count FROM tournament_progress", (err, row) => {
            if (err) {
                console.error("Error checking tournament progress data:", err);
                return;
            }
            
            if (row.count === 0) {
                console.log("Initializing tournament teams from teams.csv...");
                // Read teams CSV file and insert teams
                const fs = require('fs');
                const path = require('path');
                const csvPath = path.join(__dirname, '../public/teams.csv');
                
                fs.readFile(csvPath, 'utf8', (err, data) => {
                    if (err) {
                        console.error("Error reading teams.csv:", err);
                        return;
                    }
                    
                    const rows = data.split('\n').filter(row => row.trim());
                    const headers = rows[0].split(',');
                    const teamData = rows.slice(1).map(row => {
                        const values = row.split(',');
                        return {
                            seed: parseInt(values[0]),
                            logoUrl: values[1],
                            teamName: values[2],
                            region: values[3]
                        };
                    });
                    
                    // Begin transaction
                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');
                        
                        const stmt = db.prepare(
                            'INSERT INTO tournament_progress (team_name, region, seed) VALUES (?, ?, ?)'
                        );
                        
                        let errorOccurred = false;
                        
                        teamData.forEach(team => {
                            stmt.run([team.teamName, team.region, team.seed], err => {
                                if (err) {
                                    errorOccurred = true;
                                    console.error("Error inserting team:", err.message);
                                }
                            });
                        });
                        
                        stmt.finalize();
                        
                        if (errorOccurred) {
                            db.run('ROLLBACK');
                            console.error("Error initializing tournament teams");
                        } else {
                            db.run('COMMIT', err => {
                                if (err) {
                                    console.error("Error committing tournament teams:", err.message);
                                } else {
                                    console.log(`${teamData.length} teams initialized in tournament_progress table`);
                                }
                            });
                        }
                    });
                });
            } else {
                console.log(`Tournament progress table already has ${row.count} teams`);
            }
        });
        // Admin credentials table
        db.run(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            )
        `);
        
        // Insert default admin if none exists
        db.get("SELECT COUNT(*) as count FROM admin_users", (err, row) => {
            if (err) {
                console.error("Error checking admin users:", err);
                return;
            }
            
            if (row.count === 0) {
                // Insert default admin (username: admin, password: admin123)
                // NOTE: In a real app, NEVER store plain text passwords
                db.run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)", 
                    ["keith", "6969"]);
            }
        });
    });
    
    console.log("Database initialized");
}

module.exports = {
    db,
    initializeDatabase
};