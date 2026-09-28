# L2 bot report (after the L2 fix pass)

`npm run bot:all` after the L2 fix pass (wall-retention fix, 6.5 px/f wall slide ramp, gym-01 +2 rows, gym-04 2-wide pillars, gym-09 G moved aside; 2026-09-28): every room's claims (movement-spec §6.1), default budget 300k nodes, k=4. "not found in budget" is the expected result for `without` claims (not a proof; see memory/bot.md). Hub rows are informational reachability of every door and spawn.

Changes vs the L2 merge: all 23 claims still PASS. gym-04 296 → 292 f (2-wide pillars), gym-07 g 96 → 100 f, gym-08 166 → 170 f (wall jumps no longer get the retention glitch; the old routes relied on it and were re-solved), gym-09 173 → 184 f (G now sits beside the landing, so the route lands hard first). Total 27.1 → 23.2 s.

| room | claim | result | status | time |
|---|---|---|---|---|
| hub | exit:1 (no claim; info) | found 8f | info | 3 ms |
| hub | exit:2 (no claim; info) | found 20f | info | 2 ms |
| hub | exit:3 (no claim; info) | found 33f | info | 5 ms |
| hub | exit:4 (no claim; info) | found 44f | info | 4 ms |
| hub | exit:5 (no claim; info) | found 57f | info | 5 ms |
| hub | exit:6 (no claim; info) | found 68f | info | 5 ms |
| hub | exit:7 (no claim; info) | found 81f | info | 6 ms |
| hub | exit:8 (no claim; info) | found 92f | info | 7 ms |
| hub | exit:9 (no claim; info) | found 105f | info | 8 ms |
| hub | exit:A (no claim; info) | found 116f | info | 8 ms |
| hub | exit:B (no claim; info) | found 129f | info | 11 ms |
| hub | exit:C (no claim; info) | found 140f | info | 10 ms |
| hub | exit:D (no claim; info) | found 153f | info | 11 ms |
| hub | exit:E (no claim; info) | found 164f | info | 11 ms |
| hub | spawn:1 (no claim; info) | found 8f | info | 0 ms |
| hub | spawn:2 (no claim; info) | found 20f | info | 1 ms |
| hub | spawn:3 (no claim; info) | found 33f | info | 3 ms |
| hub | spawn:4 (no claim; info) | found 44f | info | 3 ms |
| hub | spawn:5 (no claim; info) | found 57f | info | 4 ms |
| hub | spawn:6 (no claim; info) | found 68f | info | 5 ms |
| hub | spawn:7 (no claim; info) | found 81f | info | 6 ms |
| hub | spawn:8 (no claim; info) | found 92f | info | 6 ms |
| hub | spawn:9 (no claim; info) | found 105f | info | 7 ms |
| hub | spawn:A (no claim; info) | found 116f | info | 8 ms |
| hub | spawn:B (no claim; info) | found 129f | info | 9 ms |
| hub | spawn:C (no claim; info) | found 140f | info | 9 ms |
| hub | spawn:D (no claim; info) | found 153f | info | 10 ms |
| hub | spawn:E (no claim; info) | found 164f | info | 11 ms |
| gym-01 | G with [] | found 377f | PASS | 50 ms |
| gym-02 | G with [] | found 96f | PASS | 38 ms |
| gym-02 | g with [doubleJump] | found 209f | PASS | 290 ms |
| gym-02 | g without doubleJump | not found in budget | PASS | 2957 ms |
| gym-03 | G with [] | found 241f | PASS | 25 ms |
| gym-03 | G without variableJump | unreachable | PASS | 169 ms |
| gym-04 | G with [] | found 292f | PASS | 531 ms |
| gym-05 | G with [] | found 372f | PASS | 165 ms |
| gym-06 | G with [] | found 247f | PASS | 59 ms |
| gym-07 | G with [wallJump] | found 229f | PASS | 65 ms |
| gym-07 | G without wallJump | not found in budget | PASS | 2924 ms |
| gym-07 | g with [wallJump] | found 100f | PASS | 20 ms |
| gym-08 | G with [wallJump] | found 170f | PASS | 1437 ms |
| gym-09 | G with [] | found 184f | PASS | 5 ms |
| gym-10 | G with [dash] | found 184f | PASS | 169 ms |
| gym-10 | G without dash | not found in budget | PASS | 3148 ms |
| gym-11 | G with [doubleJump] | found 156f | PASS | 1284 ms |
| gym-11 | G without doubleJump | not found in budget | PASS | 3264 ms |
| gym-12 | G with [pogo] | found 243f | PASS | 66 ms |
| gym-12 | G without pogo | not found in budget | PASS | 3219 ms |
| gym-13 | G with [wallJump,dash,doubleJump,pogo] | found 306f | PASS | 155 ms |
| gym-13 | G without wallJump | not found in budget | PASS | 2872 ms |
| gym-14 | G with [wallJump,dash,doubleJump,pogo] | found 424f | PASS | 62 ms |

0 failing claims; total 23155 ms
