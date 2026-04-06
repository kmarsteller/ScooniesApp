I tried to keep this in the most basic and vanilla HTML and JavaScript possible, and basic DB stuff.
It should run with Node.js installed, Node Package Manager(npm), and SQLite for database work. Truly trying to keep it VERY simple and just do the work.

run the command 'npm install' at the top level to get the dependencies for this project.

Pull teams into a teams.csv file using an AI prompt like:
"Put the 64 teams (and their data) that made the 2026 Men's NCAA Basketball Tournament as entries into a CSV file (called teams.csv) of this format: [seed,logo_url,team_name,region], and get their logo_url files from ESPN"

Here's an example entry of a line of teams.csv:
```
1,https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/41.png,UConn,East
```

this file should live at the address: ./public/teams.csv

Once teams.csv is in place, THEN, from the top-level directory, run 'node scripts/download-logos.js' to go out and download all the team logos and keep them local.

Next, get a .env file created, as described at the bottom of this page. This will allow for the email functions to work.

Finally, from the top-level directory, run the server with this command: "npm start" OR "npm run dev" if you need to run it to restart to ripple through development code changes.

## Scoonies Project Overview
"The Scoonies" is a fantasy sports game based on the NCAA Basketball Tournament, where participants select teams using a points-based budget system and earn points based on their teams' tournament performance.

## Core Components

### Server-Side Components

**Server (server.js)**
- Express.js application serving the website
- Routes for API endpoints and static files
- Error handling and middleware configuration


**Database (db/database.js)**
- SQLite database setup and connection management
- Table schema creation for entries, team selections, tournament progress
- System settings management (entries open/closed, team visibility)
- Database Structure:
	- entries: User entry information including name, email, nickname, score
	- team_selections: Teams selected by users with cost and points earned
	- tournament_progress: Tournament teams with advancement status
	- admin_users: Administrator credentials with secure password hashing
	- system_settings: Application configuration (entries open/closed, team visibility)

**Player Roster (db/players-db.js)**
- Separate persistent SQLite database (`players.db`) that survives season resets of `game.db`
- Upserts a player record on every entry submission (keyed by email, case-insensitive)
- Tracks `first_seen` and `last_seen` timestamps across seasons

**Route Handlers**
- entries.js: Manages user entry submissions (with server-side email validation)
- standings.js: Provides current tournament standings with team visibility control
- admin.js: Admin authentication and tournament management functions
- bracket.js: Serves bracket data for the public bracket visualization page
- communications.js: Admin email blast endpoints


**Calculators (lib/)**
- maxScoreCalculator.js: Computes each entry's theoretical maximum remaining score,
                        accounting for bracket collisions between picks in the same region or FF half.
                        Returns a scenario breakdown per future win.
- perfectHindsightCalculator.js: Solves a 0/1 knapsack to find the highest-scoring bracket
                                that could have been submitted with perfect foresight of the tournament results.


**Admin Management (scripts/admin-manager.js)**
- Secure administrator account management
- Password hashing with bcrypt
- Command-line interface for admin CRUD operations

**Utility Scripts**
- download-logos.js: Downloads team logos from ESPN based on teams.csv data
- rename-first-four.js: Updates First Four placeholder team names once games are decided
- check-entry.js: CLI tool to inspect a specific entry in the database
- debug-db.js: Prints raw database state for debugging
- fix-database.js: One-off migration/repair utility
- sync-players.js: Backfills players.db from existing game.db entries (repeatable/safe)

**EMAIL**

Emails are sent via Brevo (formerly Sendinblue) using the sib-api-v3-sdk package.
Gmail's DMARC policy blocks third-party sends from @gmail.com addresses; Brevo
with proper SPF/DKIM/DMARC records set in Cloudflare allows sending from thescoonies@scoonies.com.

For the email services to work, create a .env file in the ScooniesApp/ directory:

```
# Email Configuration
BREVO_API_KEY=your_brevo_api_key_here
FROM_EMAIL=thescoonies@scoonies.com
REPLY_TO=thescoonies.basketball@gmail.com
SESSION_SECRET=a_random_secret_for_session_cookies
SITE_URL=https://scoonies.com
```

See INFRASTRUCTURE.md for the full infrastructure explanation including Brevo setup.

### Client-Side Components

**Public Pages**
- index.html: Welcome page and game overview
- submit.html: Team selection interface with 200-point budget system (client + server-side email validation)
- standings.html: Current participant rankings and team selections
- bracket.html: Visual tournament bracket page
- 404.html & 500.html: Error pages


**Admin Interface**
- admin/index.html: Admin login
- admin/tournament.html: Tournament bracket management
- admin/entries.html: Entry management and control panel
- admin/communications.html: Email blast interface (custom, payment reminder, scoring update, commish banner)


**JavaScript**
- submit.js: Team selection and submission logic
- standings.js: Rankings display and team visibility handling
- Various embedded scripts for admin functionality


**CSS**
- style.css: Global styling for the application

## Game Mechanics

**Team Selection**
- 200 total points to spend
- Team costs based on seed (1 seed = 80 points, decreasing by 5 for each lower seed)
- Points must be exactly spent (no leftover points)


**Scoring System**
- Points earned = team seed × round advancement multiplier
- Round multipliers increase as teams advance
- Bonus points for Final Four (+5), Championship game (+10), and Champion (+15)


**Admin Controls**
- Tournament bracket management
- Entry submission control (open/close registrations)
- Team visibility control (hide/show selections)
- Score calculation and updates

**Security Features**

Password Protection
- Admin credentials stored with bcrypt hashing
- Login-protected admin area

Privacy Controls
- Email masking in public standings (first 4 chars...last 6 chars)
- Option to hide team selections until tournament begins

User Experience

Team Selection Interface
- Real-time points calculation
- Team filtering by region
- Visual feedback for selected teams and affordability

Standings Display
- Live score updates
- Payment status indicators
- Team performance tracking

Payment Integration
- Entry fee collection via Venmo and PayPal
- Payment tracking in admin interface

Deployment
- Node.js runtime environment
- SQLite database for data persistence
- Local image storage for team logos

### Key Files and Their Functions

**Server Core**
- server.js: Entry point for the application, sets up Express server, middleware, and routes
- package.json: Project metadata and npm dependencies

**Database**
- db/database.js: Database connection setup, schema creation, initial data population
- db/session-store.js: SQLite-backed session store for admin login sessions
- db/players-db.js: Persistent player roster; survives game.db season resets; upserts on each entry submission
- db/game.db: SQLite database file (generated on first run)
- db/players.db: Persistent player roster database (generated on first run)

**API Routes**
- routes/admin.js: Admin API endpoints (authentication, tournament management)
- routes/entries.js: Entry submission and management endpoints (validates email format server-side)
- routes/standings.js: Standings data endpoints and team visibility management
- routes/communications.js: Email communication endpoints
- routes/bracket.js: Bracket data endpoints (serves tournament_progress for bracket visualization)

**Calculators**
- lib/maxScoreCalculator.js: Max remaining score calculator (accounts for bracket collisions between picks)
- lib/perfectHindsightCalculator.js: Perfect hindsight calculator — finds optimal bracket via 0/1 knapsack

**Public HTML**
- public/index.html: Homepage with game description
- public/submit.html: Team selection interface
- public/standings.html: Tournament standings display
- public/admin/index.html: Admin login interface
- public/admin/tournament.html: Tournament bracket management interface
- public/admin/entries.html: Entry management interface

**CSS and JavaScript**
- public/css/style.css: Main stylesheet for the entire application
- public/js/submit.js: Client-side logic for team selection
- public/js/standings.js: Client-side logic for standings display
- public/js/admin.js: Admin interface functionality

**Utility Scripts**
- scripts/admin-manager.js: CLI tool for secure admin user management
- scripts/download-logos.js: Script to download team logos from ESPN
- scripts/rename-first-four.js: Updates First Four placeholder names after games complete
- scripts/check-entry.js: CLI tool to inspect an entry in the database
- scripts/debug-db.js: Raw DB state printer for debugging
- scripts/fix-database.js: One-off migration/repair utility
- scripts/sync-players.js: Backfills players.db from existing game.db entries (repeatable/safe)
- scripts/FIRST-FOUR-README.md: Per-game commands for First Four updates

**Services**
- services/email-service.js: Brevo (Sendinblue) API wrapper for sending emails

**Data Files**
- public/teams.csv: List of NCAA tournament teams with seed, region, and logo URL

## Database Schema

**Tables**

entries: User entry information
- id, player_name, email, nickname, score, submission_date, has_paid

team_selections: Teams selected by users
- id, entry_id, team_name, seed, region, cost, points_earned

tournament_progress: Tournament teams with advancement status
- id, team_name, region, seed, round_reached, is_eliminated, is_final_four, is_finalist, is_champion

admin_users: Administrator credentials
- id, username, password_hash

system_settings: Application configuration
- id, key, value (entries_open, teams_visible)

players (players.db — persistent across seasons):
- id, player_name, email (unique, lowercase), first_seen, last_seen

### Project Structure Outline
This outline represents the current state of the Scoonies application after recent updates and improvements to security, user interface, and privacy controls.

```
ScooniesApp/
├── db/
│   ├── database.js         # SQLite database setup and connection
│   ├── session-store.js    # SQLite-backed session store for admin auth
│   ├── players-db.js       # Persistent player roster (survives season resets)
│   ├── game.db             # SQLite database file (generated)
│   └── players.db          # Persistent player roster DB (generated)
│
├── lib/                    # Pure-function business logic (no Express/DB dependencies)
│   ├── maxScoreCalculator.js          # Max remaining score per entry (bracket-collision-aware)
│   └── perfectHindsightCalculator.js  # Optimal bracket via 0/1 knapsack
│
├── node_modules/           # Dependencies (generated)
│
├── public/                 # Static files served to users
│   ├── css/
│   │   └── style.css       # Main stylesheet
│   │
│   ├── images/
│   │   ├── logos/          # Team logo images downloaded from ESPN
│   │   │   └── ...         # Individual team logo PNG files
│   │   └── Scoonies.jpg    # Website logo
│   │
│   ├── js/
│   │   ├── admin.js        # Admin interface functionality
│   │   ├── standings.js    # Standings page functionality
│   │   └── submit.js       # Team submission functionality
│   │
│   ├── admin/
│   │   ├── index.html      # Admin login page
│   │   ├── tournament.html # Tournament bracket management
│   │   ├── entries.html    # Entries management page
│   │   └── communications.html # League communications interface
│   │
│   ├── index.html          # Homepage with game description
│   ├── submit.html         # Team selection/entry submission page
│   ├── standings.html      # Tournament standings page
│   ├── bracket.html        # Interactive tournament bracket visualization
│   ├── 404.html            # Error page for 404 not found
│   ├── 500.html            # Error page for server errors
│   └── teams.csv           # CSV file with team data
│
├── routes/                 # API route handlers
│   ├── admin.js            # Admin routes (tournament management, entries)
│   ├── entries.js          # Entry submission endpoints (with email validation)
│   ├── standings.js        # Standings data endpoints
│   ├── communications.js   # Email communication endpoints
│   └── bracket.js          # Bracket data endpoints
│
├── services/               # Business logic services
│   └── email-service.js    # Brevo API wrapper for email sending
│
├── scripts/
│   ├── admin-manager.js    # Admin user management utility
│   ├── download-logos.js   # Script to download team logos from ESPN
│   ├── rename-first-four.js # Updates First Four placeholder names post-game
│   ├── check-entry.js      # CLI tool to inspect a DB entry
│   ├── debug-db.js         # Raw DB state printer for debugging
│   ├── fix-database.js     # One-off migration/repair utility
│   ├── sync-players.js     # Backfills players.db from game.db (repeatable)
│   └── FIRST-FOUR-README.md # Per-game commands for First Four updates
│
├── tests/                  # Jest test suite
│   ├── scoring.test.js              # Point calculation tests
│   ├── filename.test.js             # Team name → logo filename tests
│   ├── standings-search.test.js     # Standings search/filter tests
│   ├── standings-trophies.test.js   # Trophy display logic tests
│   ├── bracket-pretourney.test.js   # Pre-tourney TBD bracket logic tests
│   ├── maxScoreCalculator.test.js   # Max remaining score calculator tests
│   ├── perfectHindsightCalculator.test.js # Perfect hindsight knapsack tests
│   ├── email-validation.test.js    # Email format validation tests
│   └── players-db.test.js          # Player roster upsert logic tests (in-memory SQLite)
│
├── utils/
│   ├── scoring.js          # calculatePoints() — pure scoring function
│   └── filename.js         # teamNameToFilename() — logo filename helper
│
├── .env                    # Environment variables (Brevo key, session secret, etc.)
├── .gitignore              # Git ignore file
├── INFRASTRUCTURE.md       # Plain-English infra overview (GoDaddy/Cloudflare/DO/Brevo)
├── package.json            # Project dependencies
├── package-lock.json       # Dependency lock file
├── README.md               # Project documentation
└── server.js               # Main Express server file
```




--Keith Marsteller, April 6, 2026
