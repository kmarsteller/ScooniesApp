// check-entry.js - A script to verify if an entry exists and check ID handling
// Run with: node check-entry.js <entryId>

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Get entry ID from command line
const entryId = process.argv[2];
if (!entryId) {
    console.error('Please provide an entry ID as a command line argument');
    console.error('Usage: node check-entry.js <entryId>');
    process.exit(1);
}

console.log(`Checking entry with ID: ${entryId}`);
console.log(`Entry ID type: ${typeof entryId}`);

// Open the database
const db = new sqlite3.Database(path.join(__dirname, '..', 'db', 'game.db'), sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database');
});

// Check all entries to see what's available
console.log('\nListing all entries to check what IDs exist:');
db.all('SELECT id, player_name, nickname, email FROM entries ORDER BY id', (err, entries) => {
    if (err) {
        console.error('Error fetching entries:', err.message);
        closeDb();
        return;
    }
    
    if (!entries || entries.length === 0) {
        console.log('No entries found in the database.');
        closeDb();
        return;
    }
    
    console.log('Available entries:');
    entries.forEach(entry => {
        console.log(`ID: ${entry.id} (${typeof entry.id}), Name: ${entry.player_name}, Nickname: ${entry.nickname}`);
    });
    
    // Check if our target entry exists
    console.log('\nNow checking specifically for our target entry:');
    db.get('SELECT * FROM entries WHERE id = ?', [entryId], (err, entry) => {
        if (err) {
            console.error('Error checking entry:', err.message);
            closeDb();
            return;
        }
        
        if (!entry) {
            console.log(`❌ Entry with ID ${entryId} NOT FOUND!`);
            
            // Let's try with a number type
            const numericId = Number(entryId);
            console.log(`\nTrying again with numeric ID: ${numericId} (${typeof numericId})`);
            
            db.get('SELECT * FROM entries WHERE id = ?', [numericId], (err, entry) => {
                if (err) {
                    console.error('Error checking entry with numeric ID:', err.message);
                } else if (!entry) {
                    console.log(`❌ Entry with numeric ID ${numericId} still NOT FOUND!`);
                    
                    // Try with the raw value (no binding)
                    const rawSql = `SELECT * FROM entries WHERE id = ${numericId}`;
                    console.log(`\nTrying direct SQL: ${rawSql}`);
                    
                    db.get(rawSql, (err, entry) => {
                        if (err) {
                            console.error('Error with direct SQL:', err.message);
                        } else if (!entry) {
                            console.log(`❌ Entry still NOT FOUND with direct SQL!`);
                            
                            // Try with double quotes
                            db.get('SELECT * FROM entries WHERE id = ?', [`"${entryId}"`], (err, entry) => {
                                if (err) {
                                    console.error('Error with quoted ID:', err.message);
                                } else if (!entry) {
                                    console.log('❌ Entry still NOT FOUND with quoted ID!');
                                } else {
                                    console.log('✅ Found entry with quoted ID:', entry);
                                }
                                
                                closeDb();
                            });
                        } else {
                            console.log('✅ Found entry with direct SQL:', entry);
                            closeDb();
                        }
                    });
                } else {
                    console.log('✅ Found entry with numeric ID:', entry);
                    closeDb();
                }
            });
        } else {
            console.log('✅ Found entry:', entry);
            closeDb();
        }
    });
});

// Close database connection
function closeDb() {
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('\nDatabase connection closed');
        }
    });
}