// Simple SQLite-backed session store for express-session
// Persists sessions across server restarts
const session = require('express-session');

class SqliteStore extends session.Store {
    constructor(db) {
        super();
        this.db = db;
        this.db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                sid TEXT PRIMARY KEY,
                sess TEXT NOT NULL,
                expire INTEGER NOT NULL
            )
        `);
    }

    get(sid, callback) {
        const now = Math.floor(Date.now() / 1000);
        this.db.get(
            'SELECT sess FROM sessions WHERE sid = ? AND expire > ?',
            [sid, now],
            (err, row) => {
                if (err) return callback(err);
                if (!row) return callback(null, null);
                try {
                    callback(null, JSON.parse(row.sess));
                } catch (e) {
                    callback(e);
                }
            }
        );
    }

    set(sid, sess, callback) {
        const expire = sess.cookie && sess.cookie.expires
            ? Math.floor(new Date(sess.cookie.expires).getTime() / 1000)
            : Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
        this.db.run(
            'INSERT OR REPLACE INTO sessions (sid, sess, expire) VALUES (?, ?, ?)',
            [sid, JSON.stringify(sess), expire],
            callback || (() => {})
        );
    }

    destroy(sid, callback) {
        this.db.run(
            'DELETE FROM sessions WHERE sid = ?',
            [sid],
            callback || (() => {})
        );
    }
}

module.exports = SqliteStore;
