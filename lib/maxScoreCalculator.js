/**
 * Max Score Calculator
 *
 * Given an entry's picks and the current bracket state, computes the
 * maximum score that entry can still achieve, along with a plain-English
 * explanation of the scenario that produces it.
 *
 * Usage:
 *   const { calcMaxScore } = require('./lib/maxScoreCalculator');
 *   const result = calcMaxScore(picks, allTeams, ffMatchups);
 *
 * picks      — array of team_selections rows: { team_name, seed, region, points_earned }
 * allTeams   — array of tournament_progress rows
 * ffMatchups — { semifinal1: ['East','West'], semifinal2: ['South','Midwest'] }
 *
 * Returns:
 *   {
 *     currentScore,
 *     maxAdditional,
 *     maxScore,
 *     scenario: [
 *       { round, roundName, team, seed, region, opponent, runningTotal, gain }
 *     ]
 *   }
 */

// Bonus points awarded for reaching deep rounds (matches utils/scoring.js)
// Final Four (round 5): +5, Champ Game (round 6): +10, Champion (round 7): +15
const ROUND_BONUSES = { 5: 5, 6: 10, 7: 15 };

// Cumulative total points after all wins up to round_reached.
// Each win k earns seed × k, plus bonuses for rounds 5/6/7.
// Example: seed 16 wins all 6 rounds → 16×21 + 5+10+15 = 336 + 30 = 366
function pointsFor(seed, roundReached) {
    const wins = roundReached - 1;
    let points = seed * wins * (wins + 1) / 2;
    for (let r = 5; r <= roundReached; r++) {
        points += ROUND_BONUSES[r] || 0;
    }
    return points;
}

// Incremental gain for winning round k (the k-th win, where k = new round_reached - 1)
// round = winNumber + 1
function gainForWin(seed, winNumber) {
    const round = winNumber + 1;
    return seed * winNumber + (ROUND_BONUSES[round] || 0);
}

const ROUND_NAMES = ['', 'Round of 64', 'Round of 32', 'Sweet 16', 'Elite 8', 'Final Four', 'Championship Game', 'Champion'];

// Standard NCAA bracket seed pairings within a region (slot index → [seedA, seedB])
const R1_MATCHUPS = [
    [1, 16], [8, 9], [5, 12], [4, 13],  // top half
    [6, 11], [3, 14], [7, 10], [2, 15], // bottom half
];

/**
 * Returns the search-round at which two seeds first meet in the bracket.
 * search round 2 = Round of 32, 3 = Sweet 16, 4 = Elite 8, 5 = Regional Final
 */
function bracketCollisionRound(seedA, seedB) {
    const posA = R1_MATCHUPS.findIndex(m => m.includes(Number(seedA)));
    const posB = R1_MATCHUPS.findIndex(m => m.includes(Number(seedB)));
    if (Math.floor(posA / 2) === Math.floor(posB / 2)) return 2; // same R32 pairing  → Round of 32
    if (Math.floor(posA / 4) === Math.floor(posB / 4)) return 3; // same Sweet 16 half → Sweet 16
    return 4;                                                      // opposite halves    → Elite 8
}

/**
 * Determine the maximum round each alive pick can reach within a region.
 * Returns a Map of team_name → maxRound (2–5).
 *
 * When two picks collide, we branch and take the path that maximizes
 * total points across all picks in the region.
 */
function findRegionMaxRounds(regionPicks, allRegionTeams) {
    const pickNames = new Set(regionPicks.map(p => p.team_name));
    const bySeed    = {};
    allRegionTeams.forEach(t => { bySeed[t.seed] = t; });

    // Build initial survivors for each R1 slot.
    // A slot survivor is whoever is still alive from that matchup.
    const initSlots = R1_MATCHUPS.map(([sA, sB]) => {
        const a = bySeed[sA];
        const b = bySeed[sB];
        if (!a && !b) return null;
        if (!a) return b?.is_eliminated ? null : b;
        if (!b) return a?.is_eliminated ? null : a;
        if (a.is_eliminated) return b.is_eliminated ? null : b;
        if (b.is_eliminated) return a;
        // When tied, prefer the pick so it gets simulated
        if (a.round_reached === b.round_reached) return pickNames.has(b.team_name) ? b : a;
        return a.round_reached >= b.round_reached ? a : b;
    });

    // Score a mapping of team_name→maxRound for comparison.
    // Higher is better (maximises our picks' contributions).
    function pathScore(maxRoundsMap) {
        let total = 0;
        regionPicks.forEach(p => {
            const r = maxRoundsMap.get(p.team_name) || 0;
            total += pointsFor(p.seed, r);
        });
        return total;
    }

    // Recursive tree search.
    // slots  : array of surviving teams (one per "quadrant")
    // round  : the round currently being played (2 = R32, …, 5 = Regional Final)
    // Returns: Map<team_name, maxRound>
    function search(slots, round) {
        if (round > 5) {
            // Everyone left in slots is the regional champ level
            const result = new Map();
            slots.forEach(t => {
                if (t && pickNames.has(t.team_name)) result.set(t.team_name, 5);
            });
            return result;
        }

        const nextSlots   = [];
        let   resultSoFar = new Map();
        let   branchIndex = -1;
        let   branchA, branchB;

        for (let i = 0; i < slots.length; i += 2) {
            const a = slots[i];
            const b = slots[i + 1] ?? null;

            const aIsPick = a && pickNames.has(a.team_name);
            const bIsPick = b && pickNames.has(b.team_name);

            if (aIsPick && bIsPick) {
                // Conflict — need to branch.  Defer handling; record index and break.
                branchIndex = i;
                branchA = a;
                branchB = b;
                // Fill remaining slots optimistically before branching.
                for (let j = i + 2; j < slots.length; j += 2) {
                    nextSlots.push(optimisticWinner(slots[j], slots[j + 1] ?? null, pickNames));
                }
                break;
            }

            if (aIsPick) {
                // If there's a real opponent (not null), this is a future game —
                // credit the pick for at least round_reached+1 so it shows as a future win.
                const effectiveRound = b ? Math.max(round, a.round_reached + 1) : round;
                resultSoFar.set(a.team_name, effectiveRound);
                nextSlots.push(a);
            } else if (bIsPick) {
                const effectiveRound = a ? Math.max(round, b.round_reached + 1) : round;
                resultSoFar.set(b.team_name, effectiveRound);
                nextSlots.push(b);
            } else {
                nextSlots.push(optimisticWinner(a, b, pickNames));
            }
        }

        if (branchIndex === -1) {
            // No conflict — recurse straight ahead.
            const deeper = search(nextSlots, round + 1);
            return mergeMaps(resultSoFar, deeper);
        }

        // Branch: try A winning vs B winning.
        const slotsA = [...nextSlots]; slotsA[branchIndex / 2] = branchA;
        const slotsB = [...nextSlots]; slotsB[branchIndex / 2] = branchB;

        // A survives; B loses here.
        const mapA = new Map(resultSoFar);
        mapA.set(branchA.team_name, Math.max(round, branchA.round_reached + 1));
        const deeperA = search(slotsA, round + 1);
        const totalA  = mergeMaps(mapA, deeperA);

        // B survives; A loses here.
        const mapB = new Map(resultSoFar);
        mapB.set(branchB.team_name, Math.max(round, branchB.round_reached + 1));
        const deeperB = search(slotsB, round + 1);
        const totalB  = mergeMaps(mapB, deeperB);

        // Give the losing pick credit for games played before the collision.
        // e.g. a team at round_reached=1 implicitly won R1 before meeting the collision.
        if (pathScore(totalA) >= pathScore(totalB)) {
            if (round > (branchB.round_reached || 1))
                totalA.set(branchB.team_name, round);
            return totalA;
        } else {
            if (round > (branchA.round_reached || 1))
                totalB.set(branchA.team_name, round);
            return totalB;
        }
    }

    return search(initSlots, 2);
}

// Pick whichever slot winner best serves our picks.
// If one is our pick, return them.  If both are, pick higher seed (more valuable).
// If neither is, return whoever is further along.
function optimisticWinner(a, b, pickNames) {
    if (!a) return b;
    if (!b) return a;
    const aP = pickNames.has(a?.team_name);
    const bP = pickNames.has(b?.team_name);
    if (aP && !bP) return a;
    if (bP && !aP) return b;
    if (aP && bP)  return a.seed >= b.seed ? a : b; // higher seed = more points
    return a.round_reached >= b.round_reached ? a : b;
}

function mergeMaps(a, b) {
    const out = new Map(a);
    b.forEach((v, k) => { if (!out.has(k) || v > out.get(k)) out.set(k, v); });
    return out;
}

/**
 * Find optimal max rounds for FF stage.
 * ffChamps: { East: teamRow|null, … }
 * Returns Map<team_name, maxRound> for rounds 6 and 7.
 */
function findFFMaxRounds(ffChamps, ffMatchups, allPicks) {
    const pickNames = new Set(allPicks.map(p => p.team_name));

    function sfWinner(regionA, regionB) {
        const a = ffChamps[regionA];
        const b = ffChamps[regionB];
        return optimisticWinner(a, b, pickNames);
    }

    const [sf1a, sf1b] = ffMatchups.semifinal1;
    const [sf2a, sf2b] = ffMatchups.semifinal2;

    const sf1Teams = [ffChamps[sf1a], ffChamps[sf1b]].filter(Boolean);
    const sf2Teams = [ffChamps[sf2a], ffChamps[sf2b]].filter(Boolean);

    const out = new Map();

    // Try all combinations of SF winners to maximise total
    function trySFs(w1, w2) {
        const map = new Map();
        if (w1 && pickNames.has(w1.team_name)) map.set(w1.team_name, 6);
        if (w2 && pickNames.has(w2.team_name)) map.set(w2.team_name, 6);

        // Championship
        const champ = optimisticWinner(w1, w2, pickNames);
        if (champ && pickNames.has(champ.team_name)) map.set(champ.team_name, 7);

        const score = [...map.entries()].reduce((s, [name, r]) => {
            const pick = allPicks.find(p => p.team_name === name);
            return s + (pick ? pointsFor(pick.seed, r) : 0);
        }, 0);
        return { map, score };
    }

    const candidates = [];
    const sf1Options = sf1Teams.length ? sf1Teams : [null];
    const sf2Options = sf2Teams.length ? sf2Teams : [null];
    sf1Options.forEach(w1 => sf2Options.forEach(w2 => candidates.push(trySFs(w1, w2))));
    // Also try both SF winners as their non-obvious alternatives if there's a pick conflict
    sf1Teams.forEach(w1 => sf2Teams.forEach(w2 => candidates.push(trySFs(w1, w2))));

    const best = candidates.reduce((a, b) => b.score > a.score ? b : a, { map: new Map(), score: -1 });
    return best.map;
}

/**
 * Build events (per-round wins with correct incremental points) from a
 * team's path, given the max round it reaches and its current points_earned.
 */
function buildEvents(pick, maxRound, opponentsByRound) {
    const events = [];
    // Baseline: cumulative points already earned based on current round_reached.
    const currentRound = pick.round_reached || 1;
    let runningTotal = pointsFor(pick.seed, currentRound);
    const startRound = currentRound + 1; // next win forward

    for (let r = startRound; r <= maxRound; r++) {
        const winNumber = r - 1;           // this is win #k (1–6)
        const gain      = gainForWin(pick.seed, winNumber); // seed × k
        runningTotal   += gain;

        events.push({
            round:       r,
            roundName:   ROUND_NAMES[r] || `Round ${r}`,
            team:        pick.team_name,
            seed:        pick.seed,
            region:      pick.region,
            opponent:    (opponentsByRound && opponentsByRound[r]) || null,
            runningTotal,
            gain,
            formula: `(${pick.seed}) ${pick.team_name}: ${pick.seed} × win ${winNumber}${ROUND_BONUSES[r] ? ` + ${ROUND_BONUSES[r]} bonus` : ''} = +${gain} (running total: ${runningTotal})`,
        });
    }
    return events;
}

/**
 * Main entry point.
 */
function calcMaxScore(picks, allTeams, ffMatchups) {
    const currentScore = picks.reduce((s, p) => s + (p.points_earned || 0), 0);

    // Group tournament_progress by region
    const byRegion = {};
    allTeams.forEach(t => {
        if (!byRegion[t.region]) byRegion[t.region] = [];
        byRegion[t.region].push(t);
    });

    // For each region, find max round per alive pick
    const maxRounds   = new Map(); // team_name → maxRound
    const ffChamps    = {};        // region → teamRow of regional champ in optimal scenario

    const regions = [...new Set(picks.map(p => p.region))];
    regions.forEach(region => {
        const regionPicks = picks.filter(p => p.region === region && !p.is_eliminated);
        if (!regionPicks.length) return;

        const regionTeams = byRegion[region] || [];
        const regionResult = findRegionMaxRounds(regionPicks, regionTeams);
        regionResult.forEach((maxRound, teamName) => maxRounds.set(teamName, maxRound));

        // Determine who the regional champ is in this optimal scenario
        // (the pick with the highest max round in this region, or existing champ)
        const existingChamp = regionTeams.find(t => t.round_reached >= 5 && !t.is_eliminated);
        if (existingChamp) {
            ffChamps[region] = existingChamp;
        } else {
            // Find which pick reaches round 5 in optimal scenario
            let bestPick = null;
            regionPicks.forEach(p => {
                const r = regionResult.get(p.team_name) || 0;
                if (r >= 5) {
                    const t = regionTeams.find(t => t.team_name === p.team_name);
                    if (t) bestPick = t;
                }
            });
            if (bestPick) ffChamps[region] = bestPick;
        }
    });

    // For regions not in this entry's picks, use actual regional champs
    Object.keys(byRegion).forEach(region => {
        if (!ffChamps[region]) {
            const champ = byRegion[region].find(t => t.round_reached >= 5 && !t.is_eliminated);
            if (champ) ffChamps[region] = champ;
        }
    });

    // FF stage
    const ffMaxRounds = findFFMaxRounds(ffChamps, ffMatchups, picks);
    ffMaxRounds.forEach((maxRound, teamName) => {
        const existing = maxRounds.get(teamName) || 0;
        if (maxRound > existing) maxRounds.set(teamName, maxRound);
    });

    // Build scenario events and total max additional
    let maxAdditional = 0;
    const allEvents   = [];

    picks.forEach(pick => {
        // Skip eliminated picks or picks with no tournament_progress match (name mismatch → null round_reached)
        if (pick.is_eliminated || pick.round_reached == null) return;
        const maxRound = maxRounds.get(pick.team_name);
        if (!maxRound || maxRound <= (pick.round_reached || 0)) return;

        const events = buildEvents(pick, maxRound, null);
        events.forEach(e => { maxAdditional += e.gain; });
        allEvents.push(...events);
    });

    // Sort events by round then by seed descending (highest seed first within same round)
    allEvents.sort((a, b) => a.round !== b.round ? a.round - b.round : b.seed - a.seed);

    // Build SF bracket map for FF collision detection
    const sfBracket = {};
    ffMatchups.semifinal1.forEach(r => { sfBracket[r] = 1; });
    ffMatchups.semifinal2.forEach(r => { sfBracket[r] = 2; });

    // Find "blocked" picks — alive, no future wins, immediately face another pick
    const blocked = [];
    picks.forEach(pick => {
        if (pick.is_eliminated || pick.round_reached == null) return;
        const pickMaxRound = maxRounds.get(pick.team_name) || 0;
        const currentRound = pick.round_reached || 0;
        if (pickMaxRound > currentRound) return; // has future wins — already in scenario

        // Find the earliest same-region collision partner (the pick they'd face first)
        const sameRegionCandidates = picks.filter(p =>
            p.team_name !== pick.team_name && !p.is_eliminated &&
            p.region === pick.region &&
            (maxRounds.get(p.team_name) || 0) > currentRound
        );
        let blocker = null;
        let collisionRoundName = null;

        if (sameRegionCandidates.length > 0) {
            // Pick the candidate they'd face at the earliest bracket round
            let earliestRound = 99;
            sameRegionCandidates.forEach(p => {
                const cr = bracketCollisionRound(pick.seed, p.seed);
                if (cr < earliestRound) {
                    earliestRound = cr;
                    blocker = p;
                }
            });
            collisionRoundName = ROUND_NAMES[earliestRound] || `Round ${earliestRound}`;
        } else {
            // Check FF bracket collision (different region, same semifinal)
            const sfBlocker = picks.find(p =>
                p.team_name !== pick.team_name && !p.is_eliminated &&
                p.region !== pick.region &&
                sfBracket[p.region] === sfBracket[pick.region] &&
                (maxRounds.get(p.team_name) || 0) >= 5
            );
            if (sfBlocker) {
                blocker = sfBlocker;
                collisionRoundName = 'Final Four';
            }
        }

        if (blocker) {
            blocked.push({
                team: pick.team_name,
                seed: pick.seed,
                region: pick.region,
                blockedBy: blocker.team_name,
                blockedBySeed: blocker.seed,
                roundName: collisionRoundName,
            });
        }
    });

    return {
        currentScore,
        maxAdditional,
        maxScore: currentScore + maxAdditional,
        scenario: allEvents,
        blocked,
    };
}

module.exports = { calcMaxScore, pointsFor };
