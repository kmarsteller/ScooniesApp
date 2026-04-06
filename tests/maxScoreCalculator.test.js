// tests/maxScoreCalculator.test.js
// Tests for the max-remaining-score calculator.
//
// Key behaviours verified:
//   • currentScore  = sum of points already earned by picks
//   • maxAdditional = additional points possible in best-case scenario
//   • maxScore      = currentScore + maxAdditional
//   • Eliminated picks contribute nothing extra
//   • Two picks from the same region that must meet each other: only ONE advances
//   • pointsFor() helper agrees with the scoring formula

const { calcMaxScore, pointsFor } = require('../lib/maxScoreCalculator');

// ── pointsFor helper ───────────────────────────────────────────────────────────

describe('pointsFor cumulative formula', () => {
    // pointsFor(seed, roundReached) = seed × wins*(wins+1)/2 + bonuses
    // wins = roundReached - 1
    test('round 1 → 0 points', () => expect(pointsFor(1, 1)).toBe(0));
    test('seed 1 round 2 → 1', () => expect(pointsFor(1, 2)).toBe(1));
    test('seed 1 round 3 → 3', () => expect(pointsFor(1, 3)).toBe(3));
    test('seed 1 round 4 → 6', () => expect(pointsFor(1, 4)).toBe(6));
    // round 5: 1×(1+2+3+4) + 5 bonus = 10 + 5 = 15
    test('seed 1 round 5 → 15', () => expect(pointsFor(1, 5)).toBe(15));
    // round 6: 15 + 1×5 + 10 bonus = 30
    test('seed 1 round 6 → 30', () => expect(pointsFor(1, 6)).toBe(30));
    // round 7: 30 + 1×6 + 15 bonus = 51
    test('seed 1 round 7 → 51', () => expect(pointsFor(1, 7)).toBe(51));

    test('seed 12 round 2 → 12', () => expect(pointsFor(12, 2)).toBe(12));
    test('seed 12 round 3 → 36', () => expect(pointsFor(12, 3)).toBe(36));
});

// ── Shared fixture builders ────────────────────────────────────────────────────

const FF_MATCHUPS = {
    semifinal1: ['East', 'West'],
    semifinal2: ['South', 'Midwest'],
};

function pick(team_name, seed, region, round_reached, is_eliminated = false) {
    return { team_name, seed, region, points_earned: 0, round_reached, is_eliminated };
}

function progress(team_name, seed, region, round_reached, is_eliminated = true) {
    return { team_name, seed, region, round_reached, is_eliminated };
}

// ── No teams alive → nothing extra ────────────────────────────────────────────

describe('All picks eliminated', () => {
    const picks = [
        pick('Alpha', 1, 'East', 1, true),
        pick('Beta',  8, 'West', 1, true),
    ];
    const allTeams = [
        progress('Alpha', 1, 'East', 1, true),
        progress('Beta',  8, 'West', 1, true),
    ];

    test('maxAdditional is 0', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.maxAdditional).toBe(0);
    });

    test('maxScore equals currentScore', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.maxScore).toBe(r.currentScore);
    });
});

// ── Single alive pick with no obstacles ───────────────────────────────────────

describe('Single alive pick can reach the championship', () => {
    // One pick at round 1 (no wins yet), alone in its region
    const picks = [pick('Cinderella', 12, 'East', 1, false)];
    // Build a minimal allTeams: Cinderella is the only East team still alive,
    // all opponents in rounds 2-4 have been eliminated already.
    const allTeams = [
        { team_name: 'Cinderella', seed: 12, region: 'East', round_reached: 1, is_eliminated: false },
        // Seeds 1-11, 13-16 in East — all eliminated in round 1
        ...[1,2,3,4,5,6,7,8,9,10,11,13,14,15,16].map(s =>
            progress(`Opp-East-${s}`, s, 'East', 1, true)
        ),
        // Other regions — all eliminated in round 1
        ...['West','South','Midwest'].flatMap(r =>
            Array.from({length:16},(_,i) => progress(`Opp-${r}-${i+1}`, i+1, r, 1, true))
        ),
    ];

    test('currentScore is 0 (no wins yet)', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.currentScore).toBe(0);
    });

    test('maxAdditional > 0', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.maxAdditional).toBeGreaterThan(0);
    });

    test('maxScore = currentScore + maxAdditional', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.maxScore).toBe(r.currentScore + r.maxAdditional);
    });

    test('scenario events are ordered by round', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        for (let i = 1; i < r.scenario.length; i++) {
            expect(r.scenario[i].round).toBeGreaterThanOrEqual(r.scenario[i-1].round);
        }
    });
});

// ── Return shape ───────────────────────────────────────────────────────────────

describe('Return value shape', () => {
    const picks   = [pick('TeamA', 1, 'East', 2, false)];
    const allTeams = [
        progress('TeamA', 1, 'East', 2, false),
        ...[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map(s =>
            progress(`E-${s}`, s, 'East', 1, true)
        ),
        ...['West','South','Midwest'].flatMap(r =>
            Array.from({length:16},(_,i) => progress(`${r}-${i+1}`, i+1, r, 1, true))
        ),
    ];

    const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);

    test('has currentScore', ()    => expect(r).toHaveProperty('currentScore'));
    test('has maxAdditional', ()   => expect(r).toHaveProperty('maxAdditional'));
    test('has maxScore', ()        => expect(r).toHaveProperty('maxScore'));
    test('has scenario array', ()  => expect(Array.isArray(r.scenario)).toBe(true));
    test('has blocked array', ()   => expect(Array.isArray(r.blocked)).toBe(true));

    test('each scenario event has required fields', () => {
        r.scenario.forEach(e => {
            expect(e).toHaveProperty('round');
            expect(e).toHaveProperty('roundName');
            expect(e).toHaveProperty('team');
            expect(e).toHaveProperty('gain');
            expect(e).toHaveProperty('runningTotal');
        });
    });
});

// ── Two picks in the same region collide ──────────────────────────────────────

describe('Two picks in same region (bracket collision)', () => {
    // Seeds 1 and 2 in East are both alive — they must eventually meet.
    // The optimizer picks the better path: credits the loser up to the collision
    // round, and the winner all the way through. Both picks get scenario events.
    const picks = [
        pick('East-1', 1, 'East', 2, false),
        pick('East-2', 2, 'East', 2, false),
    ];
    const allTeams = [
        progress('East-1', 1, 'East', 2, false),
        progress('East-2', 2, 'East', 2, false),
        ...[3,4,5,6,7,8,9,10,11,12,13,14,15,16].map(s =>
            progress(`E-${s}`, s, 'East', 1, true)
        ),
        ...['West','South','Midwest'].flatMap(r =>
            Array.from({length:16},(_,i) => progress(`${r}-${i+1}`, i+1, r, 1, true))
        ),
    ];

    test('the winning pick reaches a higher max round than the losing pick', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        const e1MaxRound = r.scenario.filter(e => e.team === 'East-1').reduce((m, e) => Math.max(m, e.round), 0);
        const e2MaxRound = r.scenario.filter(e => e.team === 'East-2').reduce((m, e) => Math.max(m, e.round), 0);
        // One pick is chosen to win past the collision; it must reach a higher round
        expect(Math.max(e1MaxRound, e2MaxRound)).toBeGreaterThan(Math.min(e1MaxRound, e2MaxRound));
    });

    test('only one of the two picks can reach round 5 (regional final) or beyond', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        const e1MaxRound = r.scenario.filter(e => e.team === 'East-1').reduce((m, e) => Math.max(m, e.round), 0);
        const e2MaxRound = r.scenario.filter(e => e.team === 'East-2').reduce((m, e) => Math.max(m, e.round), 0);
        // Both reaching round 5+ is impossible — they'd have to meet before then
        expect(e1MaxRound >= 5 && e2MaxRound >= 5).toBe(false);
    });

    test('both picks have at least some scenario events (loser credited up to collision)', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        const e1wins = r.scenario.filter(e => e.team === 'East-1').length;
        const e2wins = r.scenario.filter(e => e.team === 'East-2').length;
        expect(e1wins).toBeGreaterThan(0);
        expect(e2wins).toBeGreaterThan(0);
    });

    test('blocked array is empty because both picks have future wins', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.blocked).toHaveLength(0);
    });
});

// ── Already-eliminated pick has round_reached null → no future events ──────────

describe('Pick with null round_reached (name mismatch) skipped', () => {
    const picks = [
        { team_name: 'Ghost', seed: 5, region: 'West', points_earned: 0, round_reached: null, is_eliminated: false },
    ];
    const allTeams = [
        ...['West','East','South','Midwest'].flatMap(r =>
            Array.from({length:16},(_,i) => progress(`${r}-${i+1}`, i+1, r, 1, true))
        ),
    ];

    test('maxAdditional is 0 when round_reached is null', () => {
        const r = calcMaxScore(picks, allTeams, FF_MATCHUPS);
        expect(r.maxAdditional).toBe(0);
    });
});
