// tests/perfectHindsightCalculator.test.js
// Tests for the perfect-hindsight knapsack calculator.
//
// The calculator finds the highest-scoring 200-point bracket given actual
// tournament results. Budget = 200, costs are: cost(seed) = max(5, 80-(seed-1)*5).

const { calcPerfectHindsight, teamCost } = require('../lib/perfectHindsightCalculator');
const { calculatePoints } = require('../utils/scoring');

// ── teamCost helper ────────────────────────────────────────────────────────────

describe('teamCost', () => {
    test('seed 1 costs 80', () => expect(teamCost(1)).toBe(80));
    test('seed 2 costs 75', () => expect(teamCost(2)).toBe(75));
    test('seed 8 costs 45', () => expect(teamCost(8)).toBe(45));
    test('seed 15 costs 10', () => expect(teamCost(15)).toBe(10));
    test('seed 16 costs 5 (minimum)', () => expect(teamCost(16)).toBe(5));
    // Beyond-range sanity — formula floors at 5
    test('hypothetical seed 17 costs 5 (floor)', () => expect(teamCost(17)).toBe(5));
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTeam(seed, round_reached, region = 'East', flags = {}) {
    return {
        seed,
        region,
        team_name: `Team-${seed}-${region}`,
        logo_url: '/images/Scoonies.jpg',
        round_reached,
        is_eliminated: flags.is_eliminated ?? (round_reached < 7),
        is_final_four: flags.is_final_four ?? (round_reached >= 5),
        is_finalist:   flags.is_finalist   ?? (round_reached >= 6),
        is_champion:   flags.is_champion   ?? (round_reached >= 7),
    };
}

/**
 * Build a minimal 64-team field (seeds 1-16, four regions) where every team
 * lost in round 1 except those explicitly overridden.
 */
function buildField(overrides = []) {
    const regions = ['East', 'West', 'South', 'Midwest'];
    const base = [];
    regions.forEach(r => {
        for (let s = 1; s <= 16; s++) {
            base.push(makeTeam(s, 1, r, { is_eliminated: true, is_final_four: false, is_finalist: false, is_champion: false }));
        }
    });
    overrides.forEach(({ seed, region, round_reached, ...flags }) => {
        const idx = base.findIndex(t => t.seed === seed && t.region === region);
        if (idx !== -1) {
            base[idx] = makeTeam(seed, round_reached, region, {
                is_eliminated: flags.is_eliminated ?? false,
                is_final_four: flags.is_final_four ?? (round_reached >= 5),
                is_finalist:   flags.is_finalist   ?? (round_reached >= 6),
                is_champion:   flags.is_champion   ?? (round_reached >= 7),
            });
        }
    });
    return base;
}

// ── Basic structural tests ─────────────────────────────────────────────────────

describe('calcPerfectHindsight — output structure', () => {
    const allLost = buildField();
    const result = calcPerfectHindsight(allLost);

    test('returns totalScore, totalCost, picks', () => {
        expect(result).toHaveProperty('totalScore');
        expect(result).toHaveProperty('totalCost');
        expect(result).toHaveProperty('picks');
    });

    test('picks is an array', () => {
        expect(Array.isArray(result.picks)).toBe(true);
    });
});

// ── Budget constraint ──────────────────────────────────────────────────────────

describe('Budget constraint', () => {
    test('totalCost is exactly 200 when a valid solution exists', () => {
        const field = buildField([
            { seed: 1, region: 'East',    round_reached: 7 },
            { seed: 2, region: 'West',    round_reached: 4 },
            { seed: 5, region: 'South',   round_reached: 3 },
            { seed: 8, region: 'Midwest', round_reached: 2 },
        ]);
        const result = calcPerfectHindsight(field);
        expect(result.totalCost).toBe(200);
    });

    test('each pick cost matches teamCost(seed)', () => {
        const field = buildField([
            { seed: 1, region: 'East',    round_reached: 7 },
            { seed: 3, region: 'West',    round_reached: 5 },
            { seed: 6, region: 'South',   round_reached: 3 },
            { seed: 9, region: 'Midwest', round_reached: 2 },
        ]);
        const result = calcPerfectHindsight(field);
        result.picks.forEach(p => {
            expect(p.cost).toBe(teamCost(p.seed));
        });
    });

    test('sum of pick costs equals totalCost', () => {
        const field = buildField([
            { seed: 2, region: 'East',    round_reached: 6 },
            { seed: 4, region: 'West',    round_reached: 4 },
            { seed: 7, region: 'South',   round_reached: 3 },
            { seed: 10, region: 'Midwest', round_reached: 2 },
        ]);
        const result = calcPerfectHindsight(field);
        const sumCosts = result.picks.reduce((s, p) => s + p.cost, 0);
        expect(sumCosts).toBe(result.totalCost);
    });
});

// ── Scoring accuracy ───────────────────────────────────────────────────────────

describe('Scoring accuracy', () => {
    test('totalScore matches sum of picks\' points_earned', () => {
        const field = buildField([
            { seed: 1, region: 'East',    round_reached: 7 },
            { seed: 3, region: 'West',    round_reached: 5 },
            { seed: 5, region: 'South',   round_reached: 4 },
            { seed: 8, region: 'Midwest', round_reached: 3 },
        ]);
        const result = calcPerfectHindsight(field);
        const sumPoints = result.picks.reduce((s, p) => s + p.points_earned, 0);
        expect(result.totalScore).toBe(sumPoints);
    });

    test('picks are sorted descending by points_earned', () => {
        const field = buildField([
            { seed: 1, region: 'East',    round_reached: 7 },
            { seed: 2, region: 'West',    round_reached: 6 },
            { seed: 5, region: 'South',   round_reached: 4 },
            { seed: 8, region: 'Midwest', round_reached: 2 },
        ]);
        const result = calcPerfectHindsight(field);
        for (let i = 0; i < result.picks.length - 1; i++) {
            expect(result.picks[i].points_earned).toBeGreaterThanOrEqual(result.picks[i + 1].points_earned);
        }
    });
});

// ── Optimality — prefers high-scoring teams ────────────────────────────────────

describe('Optimality', () => {
    test('prefers the champion (seed-1) over a first-round exit at the same cost slot', () => {
        // seed 1 East wins the championship; seed 1 West loses in round 1.
        // The optimal bracket should pick the East seed-1.
        const field = buildField([
            { seed: 1, region: 'East', round_reached: 7 },
        ]);
        const result = calcPerfectHindsight(field);
        const pickedEastOne = result.picks.some(p => p.seed === 1 && p.region === 'East');
        expect(pickedEastOne).toBe(true);
    });

    test('a high-scoring low-seed upset is included when it fits in budget', () => {
        // Seed-16 champion earns 16*21 + 30 = 366 points at cost 5.
        // The optimizer should grab it since it's very high value per cost unit.
        const field = buildField([
            { seed: 16, region: 'East', round_reached: 7, is_eliminated: false, is_final_four: true, is_finalist: true, is_champion: true },
        ]);
        const result = calcPerfectHindsight(field);
        const hasChampion = result.picks.some(p => p.seed === 16 && p.region === 'East');
        expect(hasChampion).toBe(true);
    });
});

// ── Each pick has required fields ──────────────────────────────────────────────

describe('Pick shape', () => {
    test('every pick has required fields', () => {
        const field = buildField([
            { seed: 1, region: 'East', round_reached: 7 },
        ]);
        const result = calcPerfectHindsight(field);
        result.picks.forEach(p => {
            expect(p).toHaveProperty('team_name');
            expect(p).toHaveProperty('seed');
            expect(p).toHaveProperty('region');
            expect(p).toHaveProperty('cost');
            expect(p).toHaveProperty('points_earned');
            expect(p).toHaveProperty('round_reached');
        });
    });
});
