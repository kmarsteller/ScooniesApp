/**
 * Perfect Hindsight Calculator
 *
 * Given the final tournament results, finds the highest-scoring Scoonie bracket
 * that could theoretically have been submitted — with perfect foresight.
 *
 * Team costs are fixed by seed (same formula as the submission UI):
 *   cost(seed) = max(5, 80 - (seed - 1) × 5)
 *   Seed 1 = 80 pts, Seed 2 = 75 pts, … Seed 16 = 5 pts
 *
 * Budget = exactly 200 points.
 *
 * This is a 0/1 knapsack problem with an exact-capacity constraint.
 * All costs are multiples of 5, so we normalize to units of 5 (capacity = 40).
 *
 * Usage:
 *   const { calcPerfectHindsight } = require('./lib/perfectHindsightCalculator');
 *   const result = calcPerfectHindsight(allTeams);
 *
 * allTeams — array of tournament_progress rows
 *
 * Returns:
 *   {
 *     totalScore,   // max points achievable
 *     totalCost,    // should always be 200
 *     picks: [      // optimal team selections
 *       { team_name, seed, region, logo_url, round_reached, is_eliminated, points_earned, cost }
 *     ]
 *   }
 */

const { calculatePoints } = require('../utils/scoring');

function teamCost(seed) {
    return Math.max(5, 80 - (seed - 1) * 5);
}

function calcPerfectHindsight(allTeams) {
    const BUDGET = 200;
    const NORM   = 5;
    const cap    = BUDGET / NORM; // 40 normalized units

    // Annotate each team with its fixed cost and actual points earned
    const teams = allTeams.map(t => ({
        team_name:    t.team_name,
        seed:         t.seed,
        region:       t.region,
        logo_url:     t.logo_url,
        round_reached: t.round_reached || 1,
        is_eliminated: t.is_eliminated,
        is_final_four: t.is_final_four,
        is_finalist:   t.is_finalist,
        is_champion:   t.is_champion,
        points_earned: calculatePoints(t),
        cost:          teamCost(t.seed),
    }));

    const n = teams.length;

    // 2D DP: dp[i][j] = max points using the first i teams with exactly j
    // normalized units spent.  -1 means "infeasible" (no valid combo).
    const dp = Array.from({ length: n + 1 }, () => new Array(cap + 1).fill(-1));
    dp[0][0] = 0;

    for (let i = 0; i < n; i++) {
        const c = teams[i].cost / NORM;
        const v = teams[i].points_earned;
        for (let j = 0; j <= cap; j++) {
            // Option A: skip team i
            if (dp[i][j] >= 0 && dp[i][j] > dp[i + 1][j]) {
                dp[i + 1][j] = dp[i][j];
            }
            // Option B: take team i (if budget allows)
            if (j >= c && dp[i][j - c] >= 0) {
                const newVal = dp[i][j - c] + v;
                if (newVal > dp[i + 1][j]) {
                    dp[i + 1][j] = newVal;
                }
            }
        }
    }

    const totalScore = dp[n][cap];
    if (totalScore < 0) {
        // Extremely unlikely given 64 teams and flexible budget
        return { totalScore: 0, totalCost: 0, picks: [] };
    }

    // Reconstruct which teams were selected
    const picks = [];
    let rem = cap;
    for (let i = n - 1; i >= 0; i--) {
        const c = teams[i].cost / NORM;
        const v = teams[i].points_earned;
        // Team i was included if taking it produced the optimal value at this capacity
        if (rem >= c && dp[i][rem - c] >= 0 && dp[i + 1][rem] === dp[i][rem - c] + v) {
            picks.push(teams[i]);
            rem -= c;
        }
    }

    return {
        totalScore,
        totalCost: picks.reduce((s, p) => s + p.cost, 0),
        picks: picks.sort((a, b) => b.points_earned - a.points_earned || a.seed - b.seed),
    };
}

module.exports = { calcPerfectHindsight, teamCost };
