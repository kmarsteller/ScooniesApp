// debug-db.js
// Simple standalone script to check and fix your database
// Run this with: node debug-db.js

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open the database
const db = new sqlite3.Database(path.join(__dirname, '..', 'db', 'game.db'));

console.log("Database check and fix utility");

// Check table schema
db.all("PRAGMA table_info(entries)", (err, rows) => {
  if (err) {
    console.error("Error checking schema:", err);
    return closeDb();
  }
  
  console.log("Current entries table schema:");
  rows.forEach(row => {
    console.log(`- Column: ${row.name}, Type: ${row.type}, NotNull: ${row.notnull}, Default: ${row.dflt_value}, PK: ${row.pk}`);
  });
  
  // Check if has_paid column exists
  const hasColumn = rows.some(row => row.name === 'has_paid');
  
  if (!hasColumn) {
    console.log("\nAdding 'has_paid' column to entries table...");
    
    // Add the missing column
    db.run("ALTER TABLE entries ADD COLUMN has_paid BOOLEAN DEFAULT 0", (err) => {
      if (err) {
        console.error("Error adding has_paid column:", err);
      } else {
        console.log("Successfully added has_paid column to entries table");
      }
      
      // Check sample data
      checkData();
    });
  } else {
    console.log("\nhas_paid column already exists in entries table");
    
    // Check sample data
    checkData();
  }
});

// Check some sample data
function checkData() {
  db.get("SELECT * FROM entries LIMIT 1", (err, row) => {
    if (err) {
      console.error("Error checking data:", err);
      return closeDb();
    }
    
    if (row) {
      console.log("\nSample entry data:");
      console.log(row);
    } else {
      console.log("\nNo entries found in database");
    }
    
    closeDb();
  });
}

// Close the database connection
function closeDb() {
  console.log("\nClosing database connection");
  db.close();
}