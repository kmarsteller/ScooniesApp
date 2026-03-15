# First Four — Post-Game Commands

Run from the `ScooniesApp` directory after each First Four game completes.
Each command updates `tournament_progress`, `team_selections` (user picks), and `teams.csv` in one shot.

---

## Game 1 — West 11-seed  (Texas vs. NC State)

**If Texas wins:**
```
node scripts/rename-first-four.js "Texas/NC State" "Texas" West "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/251.png"
```

**If NC State wins:**
```
node scripts/rename-first-four.js "Texas/NC State" "NC State" West "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/152.png"
```

---

## Game 2 — Midwest 11-seed  (SMU vs. Miami OH)

**If SMU wins:**
```
node scripts/rename-first-four.js "SMU/Miami (OH)" "SMU" Midwest "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2567.png"
```

**If Miami (OH) wins:**
```
node scripts/rename-first-four.js "SMU/Miami (OH)" "Miami (OH)" Midwest "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/193.png"
```

---

## Game 3 — Midwest 16-seed  (UMBC vs. Howard)

**If UMBC wins:**
```
node scripts/rename-first-four.js "UMBC/Howard" "UMBC" Midwest "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2378.png"
```

**If Howard wins:**
```
node scripts/rename-first-four.js "UMBC/Howard" "Howard" Midwest "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/47.png"
```

---

## Game 4 — South 16-seed  (Prairie View A&M vs. Lehigh)

**If Prairie View A&M wins:**
```
node scripts/rename-first-four.js "Prairie View A&M/Lehigh" "Prairie View A&M" South "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2504.png"
```

**If Lehigh wins:**
```
node scripts/rename-first-four.js "Prairie View A&M/Lehigh" "Lehigh" South "https://a.espncdn.com/combiner/i?img=/i/teamlogos/ncaa/500/2329.png"
```
