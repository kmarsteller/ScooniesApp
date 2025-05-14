// Run this file with: node fix-database.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Get the database path
const dbPath = path.join(__dirname, '..','db', 'game.db');
console.log('Database path:', dbPath);

// Check if database file exists
if (!fs.existsSync(dbPath)) {
    console.error('Database file does not exist at:', dbPath);
    process.exit(1);
}

// Open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database');
});

// First, create a backup of the entries table
console.log('Creating backup of entries table...');

db.serialize(() => {
    // Check if entries table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='entries'", (err, row) => {
        if (err) {
            console.error('Error checking entries table:', err.message);
            closeDb();
            return;
        }
        
        if (!row) {
            console.log('Entries table does not exist, creating it...');
            createEntriesTable();
            return;
        }
        
        // Table exists, create backup
        db.run("CREATE TABLE IF NOT EXISTS entries_backup AS SELECT * FROM entries", (err) => {
            if (err) {
                console.error('Error creating backup table:', err.message);
                closeDb();
                return;
            }
            
            console.log('Backup created successfully');
            
            // Drop and recreate the entries table
            db.run("DROP TABLE entries", (err) => {
                if (err) {
                    console.error('Error dropping entries table:', err.message);
                    closeDb();
                    return;
                }
                
                console.log('Entries table dropped');
                createEntriesTable();
            });
        });
    });
});

// Function to create entries table with correct schema
function createEntriesTable() {
    db.run(`
        CREATE TABLE entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            email TEXT NOT NULL,
            nickname TEXT NOT NULL,
            score INTEGER DEFAULT 0,
            submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            has_paid INTEGER DEFAULT 0
        )
    `, (err) => {
        if (err) {
            console.error('Error creating entries table:', err.message);
            closeDb();
            return;
        }
        
        console.log('Entries table created with correct schema');
        
        // Restore data from backup if it exists
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='entries_backup'", (err, row) => {
            if (err || !row) {
                console.log('No backup data to restore');
                closeDb();
                return;
            }
            
            db.run("INSERT INTO entries SELECT * FROM entries_backup", (err) => {
                if (err) {
                    console.error('Error restoring data:', err.message);
                } else {
                    console.log('Data restored from backup');
                    
                    // Check restored data
                    db.all("SELECT * FROM entries LIMIT 5", (err, rows) => {
                        if (err) {
                            console.error('Error checking restored data:', err.message);
                        } else {
                            console.log('Restored data sample:');
                            console.log(rows);
                        }
                        
                        // You can drop the backup table if everything is ok
                        // db.run("DROP TABLE entries_backup");
                        closeDb();
                    });
                }
            });
        });
    });
}

// Close database connection
function closeDb() {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed');
        }
    });
}