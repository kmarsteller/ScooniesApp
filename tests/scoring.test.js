// tests/scoring.test.js
// Tests for the Scoonies point calculation system.
//
// Scoring recap:
//   Round of 32 win: seed × 1
//   Sweet 16 win:    seed × 2
//   Elite 8 win:     seed × 3
//   Final Four win:  seed × 4  + 5  bonus
//   Champ Game win:  seed × 5  + 10 bonus
//   Champion:        seed × 6  + 15 bonus

const { calculatePoints } = require('../utils/scoring');

// Helper to build a minimal team object
function team(seed, round_reached, flags = {}) {
    return {
        seed,
        round_reached,
        is_eliminated:  flags.is_eliminated  ?? false,
        is_final_four:  flags.is_final_four  ?? false,
        is_finalist:    flags.is_finalist    ?? false,
        is_champion:    flags.is_champion    ?? false,
    };
}

// ── First-round exits ─────────────────────────────────────────────────────────

describe('First-round losers score 0', () => {
    test('seed-1 team eliminated in round 1', () => {
        expect(calculatePoints(team(1, 1, { is_eliminated: true }))).toBe(0);
    });
    test('seed-16 team eliminated in round 1', () => {
        expect(calculatePoints(team(16, 1, { is_eliminated: true }))).toBe(0);
    });
});

// ── Round-by-round progression for a seed-1 team ─────────────────────────────

describe('Seed-1 team scoring per round', () => {
    test('wins Round of 64 (reaches round 2): 1×1 = 1', () => {
        expect(calculatePoints(team(1, 2))).toBe(1);
    });
    test('wins Round of 32 (reaches round 3): 1+2 = 3', () => {
        expect(calculatePoints(team(1, 3))).toBe(3);
    });
    test('wins Sweet 16 (reaches round 4): 1+2+3 = 6', () => {
        expect(calculatePoints(team(1, 4))).toBe(6);
    });
    test('wins Elite 8 → Final Four (reaches round 5): 1+2+3+4+5 = 15', () => {
        expect(calculatePoints(team(1, 5))).toBe(15);
    });
    test('wins Final Four → Champ Game (reaches round 6): 15+5+10 = 30', () => {
        expect(calculatePoints(team(1, 6))).toBe(30);
    });
    test('wins Championship (reaches round 7): 30+6+15 = 51', () => {
        expect(calculatePoints(team(1, 7))).toBe(51);
    });
});

// ── High-seed upsets score more points ───────────────────────────────────────

describe('Higher seeds earn more points per win', () => {
    test('seed-12 Round of 32 win: 12×1 = 12', () => {
        expect(calculatePoints(team(12, 2))).toBe(12);
    });
    test('seed-12 Sweet 16: 12+24 = 36', () => {
        expect(calculatePoints(team(12, 3))).toBe(36);
    });
    test('seed-16 champion earns more than seed-1 champion', () => {
        const upset = calculatePoints(team(16, 7));
        const chalk = calculatePoints(team(1,  7));
        expect(upset).toBeGreaterThan(chalk);
    });
});

// ── Bonus points are additive ─────────────────────────────────────────────────

describe('Bonus points', () => {
    test('Final Four bonus is +5 on top of round-5 seed points', () => {
        const noBonus = calculatePoints(team(1, 4)); // Elite 8 exit  → 6
        const bonus   = calculatePoints(team(1, 5)); // Final Four    → 15
        expect(bonus - noBonus).toBe(1 * 4 + 5);    // seed×4 + 5 bonus
    });
    test('Championship Game bonus is +10', () => {
        const ff    = calculatePoints(team(1, 5)); // 15
        const champ = calculatePoints(team(1, 6)); // 30
        expect(champ - ff).toBe(1 * 5 + 10);      // seed×5 + 10 bonus
    });
    test('Champion bonus is +15', () => {
        const runnerUp = calculatePoints(team(1, 6)); // 30
        const champion = calculatePoints(team(1, 7)); // 51
        expect(champion - runnerUp).toBe(1 * 6 + 15); // seed×6 + 15 bonus
    });
});

// ── Flag-based overrides (bracket correction edge cases) ──────────────────────

describe('Boolean flags work the same as round_reached', () => {
    test('is_final_four flag gives same result as round_reached=5', () => {
        const byRound = calculatePoints(team(5, 5));
        const byFlag  = calculatePoints({ seed: 5, round_reached: 4, is_eliminated: false, is_final_four: true, is_finalist: false, is_champion: false });
        expect(byFlag).toBe(byRound);
    });
    test('is_finalist flag gives same result as round_reached=6', () => {
        const byRound = calculatePoints(team(5, 6));
        const byFlag  = calculatePoints({ seed: 5, round_reached: 5, is_eliminated: false, is_final_four: false, is_finalist: true, is_champion: false });
        expect(byFlag).toBe(byRound);
    });
    test('is_champion flag gives same result as round_reached=7', () => {
        const byRound = calculatePoints(team(5, 7));
        const byFlag  = calculatePoints({ seed: 5, round_reached: 6, is_eliminated: false, is_final_four: false, is_finalist: false, is_champion: true });
        expect(byFlag).toBe(byRound);
    });
});
