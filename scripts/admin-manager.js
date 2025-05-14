// scripts/admin-manager.js
//USAGE:
//node scripts/admin-manager.js add username password.  #add admin
//node scripts/admin-manager.js remove username         #remove admin
//node scripts/admin-manager.js list                    #show admins

const bcrypt = require('bcrypt');
const path = require('path');
const { db } = require('../db/database');

// Number of salt rounds for bcrypt (higher is more secure but slower)
const SALT_ROUNDS = 10;

// Function to add a new admin
async function addAdmin(username, password) {
    try {
        // Check if admin already exists
        const existingAdmin = await checkAdmin(username);
        if (existingAdmin) {
            console.log(`Admin user '${username}' already exists.`);
            return false;
        }

        // Hash the password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        
        // Insert the new admin
        return new Promise((resolve, reject) => {
            db.run("INSERT INTO admin_users (username, password_hash) VALUES (?, ?)",
                [username, passwordHash], function(err) {
                    if (err) {
                        console.error(`Error creating admin user: ${err.message}`);
                        reject(err);
                        return;
                    }
                    
                    console.log(`Admin user '${username}' created successfully with ID ${this.lastID}`);
                    resolve(true);
                });
        });
    } catch (error) {
        console.error(`Error adding admin: ${error.message}`);
        return false;
    }
}

// Function to remove an admin
async function removeAdmin(username) {
    try {
        // Check if admin exists
        const existingAdmin = await checkAdmin(username);
        if (!existingAdmin) {
            console.log(`Admin user '${username}' does not exist.`);
            return false;
        }
        
        // Count the number of admins
        const adminCount = await countAdmins();
        if (adminCount <= 1) {
            console.log(`Cannot remove the last admin user.`);
            return false;
        }
        
        // Delete the admin
        return new Promise((resolve, reject) => {
            db.run("DELETE FROM admin_users WHERE username = ?", [username], function(err) {
                if (err) {
                    console.error(`Error removing admin user: ${err.message}`);
                    reject(err);
                    return;
                }
                
                if (this.changes === 0) {
                    console.log(`No admin user '${username}' found to remove.`);
                    resolve(false);
                    return;
                }
                
                console.log(`Admin user '${username}' removed successfully.`);
                resolve(true);
            });
        });
    } catch (error) {
        console.error(`Error removing admin: ${error.message}`);
        return false;
    }
}

// Function to check if an admin exists
async function checkAdmin(username) {
    return new Promise((resolve, reject) => {
        db.get("SELECT id FROM admin_users WHERE username = ?", [username], (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            resolve(row ? true : false);
        });
    });
}

// Function to count the number of admins
async function countAdmins() {
    return new Promise((resolve, reject) => {
        db.get("SELECT COUNT(*) as count FROM admin_users", (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            
            resolve(row ? row.count : 0);
        });
    });
}

// Function to list all admins
async function listAdmins() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, username FROM admin_users ORDER BY username", (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            console.log("\nCurrent Admin Users:");
            console.log("--------------------");
            if (rows.length === 0) {
                console.log("No admin users found.");
            } else {
                rows.forEach(row => {
                    console.log(`ID: ${row.id}, Username: ${row.username}`);
                });
            }
            
            resolve(rows);
        });
    });
}

// Command-line interface
async function run() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase();
    
    try {
        // Initialize database
        require('../db/database').initializeDatabase();
        
        switch (command) {
            case 'add':
                if (args.length < 3) {
                    console.log("Usage: node admin-manager.js add <username> <password>");
                    return;
                }
                await addAdmin(args[1], args[2]);
                break;
                
            case 'remove':
                if (args.length < 2) {
                    console.log("Usage: node admin-manager.js remove <username>");
                    return;
                }
                await removeAdmin(args[1]);
                break;
                
            case 'list':
                await listAdmins();
                break;
                
            default:
                console.log("Available commands:");
                console.log("  add <username> <password> - Add a new admin user");
                console.log("  remove <username> - Remove an admin user");
                console.log("  list - List all admin users");
                break;
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
    }
}

// Export functions for use in other files
module.exports = {
    addAdmin,
    removeAdmin,
    checkAdmin,
    countAdmins,
    listAdmins
};

// Run if this script is executed directly
if (require.main === module) {
    run().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}