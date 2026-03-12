// utils/scoring.js
// Pure function for calculating points earned by a team.
// Used by routes/admin.js (update-scores) and tests/scoring.test.js.
//
// Scoring system:
//   Each round win = seed × round multiplier
//   Round of 32 (round 2):  seed × 1
//   Sweet 16    (round 3):  seed × 2
//   Elite 8     (round 4):  seed × 3
//   Final Four  (round 5):  seed × 4  + 5  bonus
//   Champ Game  (round 6):  seed × 5  + 10 bonus
//   Champion    (round 7):  seed × 6  + 15 bonus

function calculatePoints(team) {
    // First-round losers earn nothing
    if (team.is_eliminated && team.round_reached === 1) return 0;

    let points = 0;
    const seed = team.seed;

    if (team.round_reached >= 2) points += seed * 1;
    if (team.round_reached >= 3) points += seed * 2;
    if (team.round_reached >= 4) points += seed * 3;
    if (team.round_reached >= 5 || team.is_final_four)  { points += seed * 4; points += 5;  }
    if (team.round_reached >= 6 || team.is_finalist)    { points += seed * 5; points += 10; }
    if (team.round_reached >= 7 || team.is_champion)    { points += seed * 6; points += 15; }

    return points;
}

module.exports = { calculatePoints };
