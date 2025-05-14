I tried to keep this in the most basic and vanilla HTML and JavaScript possible, and basic DB stuff.
It should run with Node.js installed, Node Package Manager(npm),  and SQLite for database work. Truly trying to keep it VERY simple and just do the work. 

run the command 'npm install' at the top level to get the dependencies for this project.

Pull teams into a teams.csv file using an AI prompt like:
"Put the 64 teams (and their data) that made the 2026 Men's NCAA Basketball Tournament as entries into a CSV file of this format: seed,logo_url,team_name,region, and get their logo files from ESPN"

Here's an example entry:
1,https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/41.png,UConn,East

this file should live at the address: ./public/teams.csv

Once teams.csv is in place, THEN, from the top-level directory,  run 'node scripts/download-logos.js' to go out and get all the team logos and keep them local.

Finally, from the top-level directory, run the server with this command: "npm start" OR "npm run dev" if you need to run it to ripple through code changes.

Project Structure Outline:

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


--Keith Marsteller, May 7, 2025


