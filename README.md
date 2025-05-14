I tried to keep this in the most basic and vanilla HTML and JavaScript possible, and basic DB stuff.
It should run with Node.js installed, Node Package Manager(npm), and SQLite for database work. Truly trying to keep it VERY simple and just do the work. 

run the command 'npm install' at the top level to get the dependencies for this project.

Pull teams into a teams.csv file using an AI prompt like:
"Put the 64 teams (and their data) that made the 2026 Men's NCAA Basketball Tournament as entries into a CSV file (called teams.csv) of this format: [seed,logo_url,team_name,region], and get their logo_url files from ESPN"

Here's an example entry of a line of teams.csv:
1,https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/41.png,UConn,East

this file should live at the address: ./public/teams.csv

Once teams.csv is in place, THEN, from the top-level directory, run 'node scripts/download-logos.js' to go out and download all the team logos and keep them local.

Finally, from the top-level directory, run the server with this command: "npm start" OR "npm run dev" if you need to run it to ripple through code changes.

Scoonies Project Overview
"The Scoonies" is a fantasy sports game based on the NCAA Basketball Tournament, where participants select teams using a points-based budget system and earn points based on their teams' tournament performance.
++++++++++++++++++++++++++++
Core Components
++++++++++++++++++++++++++++
-----------------------------
Server-Side Components
-----------------------------
	Server (server.js)

		Express.js application serving the website
		Routes for API endpoints and static files
		Error handling and middleware configuration


	Database (db/database.js)

		SQLite database setup and connection management
		Table schema creation for entries, team selections, tournament progress
		System settings management (entries open/closed, team visibility)
		Database Structure:
			entries: User entry information including name, email, nickname, score
			team_selections: Teams selected by users with cost and points earned
			tournament_progress: Tournament teams with advancement status
			admin_users: Administrator credentials with secure password hashing
			system_settings: Application configuration (entries open/closed, team visibility)

	Route Handlers

		entries.js: Manages user entry submissions
		standings.js: Provides current tournament standings with team visibility control
		admin.js: Admin authentication and tournament management functions


	Admin Management (scripts/admin-manager.js)

		Secure administrator account management
		Password hashing with bcrypt
		Command-line interface for admin CRUD operations

	Utility Scripts
		download-logos.js: Downloads team logos from ESPN based on teams.csv data

-----------------------------
Client-Side Components
-----------------------------
	Public Pages
		index.html: Welcome page and game overview
		submit.html: Team selection interface with 200-point budget system
		standings.html: Current participant rankings and team selections
		404.html & 500.html: Error pages


	Admin Interface
		admin/index.html: Admin login
		admin/tournament.html: Tournament bracket management
		admin/entries.html: Entry management and control panel


	JavaScript
		submit.js: Team selection and submission logic
		standings.js: Rankings display and team visibility handling
		Various embedded scripts for admin functionality


	CSS
		style.css: Global styling for the application

++++++++++++++++++++++++++++
Game Mechanics
++++++++++++++++++++++++++++
	Team Selection
		200 total points to spend
		Team costs based on seed (1 seed = 80 points, decreasing by 5 for each lower seed)
		Points must be exactly spent (no leftover points)


	Scoring System
		Points earned = team seed × round advancement multiplier
		Round multipliers increase as teams advance
		Bonus points for Final Four (+5), Championship game (+10), and Champion (+15)


	Admin Controls
		Tournament bracket management
		Entry submission control (open/close registrations)
		Team visibility control (hide/show selections)
		Score calculation and updates

	Security Features
		Password Protection
			Admin credentials stored with bcrypt hashing
			Login-protected admin area

		Privacy Controls
			Email masking in public standings (first 4 chars...last 6 chars)
			Option to hide team selections until tournament begins

		User Experience
			Team Selection Interface
				Real-time points calculation
				Team filtering by region
				Visual feedback for selected teams and affordability

			Standings Display
				Live score updates
				Payment status indicators
				Team performance tracking

			Payment Integration
				Entry fee collection via Venmo and PayPal
				Payment tracking in admin interface

			Deployment
				Node.js runtime environment
				SQLite database for data persistence
				Local image storage for team logos

-----------------------------
Key Files and Their Functions
-----------------------------
Server Core
	server.js: Entry point for the application, sets up Express server, middleware, and routes
	package.json: Project metadata and npm dependencies

Database
	db/database.js: Database connection setup, schema creation, initial data population
	db/game.db: SQLite database file (generated on first run)

API Routes
	routes/admin.js: Admin API endpoints (authentication, tournament management)
	routes/entries.js: Entry submission and management endpoints
	routes/standings.js: Standings data endpoints and team visibility management

Public HTML
	public/index.html: Homepage with game description
	public/submit.html: Team selection interface
	public/standings.html: Tournament standings display
	public/admin/index.html: Admin login interface
	public/admin/tournament.html: Tournament bracket management interface
	public/admin/entries.html: Entry management interface

CSS and JavaScript
	public/css/style.css: Main stylesheet for the entire application
	public/js/submit.js: Client-side logic for team selection
	public/js/standings.js: Client-side logic for standings display
	public/js/admin.js: Admin interface functionality

Utility Scripts
	scripts/admin-manager.js: CLI tool for secure admin user management
	scripts/download-logos.js: Script to download team logos from ESPN

Data Files
	public/teams.csv: List of NCAA tournament teams with seed, region, and logo URL

Database Schema
	Tables

	entries: User entry information
		id, player_name, email, nickname, score, submission_date, has_paid

	team_selections: Teams selected by users
		id, entry_id, team_name, seed, region, cost, points_earned

	tournament_progress: Tournament teams with advancement status
		id, team_name, region, seed, round_reached, is_eliminated, is_final_four, is_finalist, is_champion

	admin_users: Administrator credentials
		id, username, password_hash

	system_settings: Application configuration
		id, key, value (entries_open, teams_visible)

-----------------------------
Project Structure Outline
-----------------------------
This outline represents the current state of the Scoonies application after recent updates and improvements to security, user interface, and privacy controls.

ScooniesApp/
├── db/
│   ├── database.js     # SQLite database setup and connection
│   └── game.db         # SQLite database file
├── public/             # Static files served to users
│   ├── css/
│   │   └── style.css   # Main stylesheet
│   ├── images/
│   │   └── logos/      # Team logo images
│   ├── admin/
│   │   ├── index.html  # Admin login page
│   │   ├── tournament.html # Tournament management
│   │   └── entries.html # Entries management
│   ├── index.html      # Homepage
│   ├── submit.html     # Bracket submission page
│   ├── standings.html  # Tournament standings page
│   ├── 404.html        # Error page for 404
│   ├── 500.html        # Error page for server errors
│   └── teams.csv       # CSV file with team data
├── routes/             # API route handlers
│   ├── admin.js        # Admin tournament management
│   ├── admin-logos.js  # Admin logo download
│   ├── auth.js         # User authentication
│   ├── entries.js      # Entry submission endpoints
│   ├── standings.js    # Standings data endpoints
│   └── teams.js        # Team data endpoints
├── scripts/
│   ├── download-logos.js # Script to download team logos
│   └── init-db.js      # Database initialization script
├── server.js           # Main Express server file
└── package.json        # Project dependencies


--Keith Marsteller, May 14, 2025