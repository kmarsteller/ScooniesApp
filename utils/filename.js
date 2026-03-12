// utils/filename.js
// Converts a team name to the logo filename used in public/images/logos/.
// Must stay in sync with:
//   - scripts/download-logos.js  (safeFilename)
//   - routes/entries.js          (teamLogoUrl)
//   - public/admin/tournament.html (teamLogoFilename)

function teamLogoFilename(teamName) {
    return teamName
        .toLowerCase()
        .replace(/['\u2018\u2019]/g, '-')   // straight + curly apostrophes → hyphen
        .replace(/&/g, ' ')       // ampersand  → space (then caught by next rule)
        .replace(/\s+/g, '-')     // whitespace → hyphen
        .replace(/-+/g, '-')      // collapse doubles
        .replace(/^-|-$/g, '');   // trim leading/trailing hyphens
}

module.exports = { teamLogoFilename };
