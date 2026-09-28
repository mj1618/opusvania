# L2 bot report (merged tree)

`npm run bot:all` on main after the L2 merge (build 08ad713, 2026-09-28): every room's claims (movement-spec §6.1), default budget 300k nodes, k=4. "not found in budget" is the expected result for `without` claims (not a proof; see memory/bot.md). Hub rows are informational reachability of every door and spawn.

| room | claim | result | status | time |
|---|---|---|---|---|
| hub | exit:1 (no claim; info) | found 8f | info | 3 ms |
| hub | exit:2 (no claim; info) | found 20f | info | 2 ms |
| hub | exit:3 (no claim; info) | found 33f | info | 5 ms |
| hub | exit:4 (no claim; info) | found 44f | info | 4 ms |
| hub | exit:5 (no claim; info) | found 57f | info | 6 ms |
| hub | exit:6 (no claim; info) | found 68f | info | 7 ms |
| hub | exit:7 (no claim; info) | found 81f | info | 7 ms |
| hub | exit:8 (no claim; info) | found 92f | info | 7 ms |
| hub | exit:9 (no claim; info) | found 105f | info | 8 ms |
| hub | exit:A (no claim; info) | found 116f | info | 8 ms |
| hub | exit:B (no claim; info) | found 129f | info | 10 ms |
| hub | exit:C (no claim; info) | found 140f | info | 12 ms |
| hub | exit:D (no claim; info) | found 153f | info | 12 ms |
| hub | exit:E (no claim; info) | found 164f | info | 12 ms |
| hub | spawn:1 (no claim; info) | found 8f | info | 0 ms |
| hub | spawn:2 (no claim; info) | found 20f | info | 1 ms |
| hub | spawn:3 (no claim; info) | found 33f | info | 3 ms |
| hub | spawn:4 (no claim; info) | found 44f | info | 3 ms |
| hub | spawn:5 (no claim; info) | found 57f | info | 4 ms |
| hub | spawn:6 (no claim; info) | found 68f | info | 5 ms |
| hub | spawn:7 (no claim; info) | found 81f | info | 6 ms |
| hub | spawn:8 (no claim; info) | found 92f | info | 6 ms |
| hub | spawn:9 (no claim; info) | found 105f | info | 8 ms |
| hub | spawn:A (no claim; info) | found 116f | info | 10 ms |
| hub | spawn:B (no claim; info) | found 129f | info | 10 ms |
| hub | spawn:C (no claim; info) | found 140f | info | 10 ms |
| hub | spawn:D (no claim; info) | found 153f | info | 12 ms |
| hub | spawn:E (no claim; info) | found 164f | info | 13 ms |
| gym-01 | G with [] | found 377f | PASS | 52 ms |
| gym-02 | G with [] | found 96f | PASS | 42 ms |
| gym-02 | g with [doubleJump] | found 209f | PASS | 308 ms |
| gym-02 | g without doubleJump | not found in budget | PASS | 3297 ms |
| gym-03 | G with [] | found 241f | PASS | 25 ms |
| gym-03 | G without variableJump | unreachable | PASS | 179 ms |
| gym-04 | G with [] | found 296f | PASS | 594 ms |
| gym-05 | G with [] | found 372f | PASS | 186 ms |
| gym-06 | G with [] | found 247f | PASS | 65 ms |
| gym-07 | G with [wallJump] | found 229f | PASS | 69 ms |
| gym-07 | G without wallJump | not found in budget | PASS | 3382 ms |
| gym-07 | g with [wallJump] | found 96f | PASS | 13 ms |
| gym-08 | G with [wallJump] | found 166f | PASS | 1169 ms |
| gym-09 | G with [] | found 173f | PASS | 6 ms |
| gym-10 | G with [dash] | found 184f | PASS | 192 ms |
| gym-10 | G without dash | not found in budget | PASS | 3797 ms |
| gym-11 | G with [doubleJump] | found 156f | PASS | 1578 ms |
| gym-11 | G without doubleJump | not found in budget | PASS | 4012 ms |
| gym-12 | G with [pogo] | found 243f | PASS | 77 ms |
| gym-12 | G without pogo | not found in budget | PASS | 4007 ms |
| gym-13 | G with [wallJump,dash,doubleJump,pogo] | found 306f | PASS | 187 ms |
| gym-13 | G without wallJump | not found in budget | PASS | 3565 ms |
| gym-14 | G with [wallJump,dash,doubleJump,pogo] | found 424f | PASS | 73 ms |

0 failing claims; total 27073 ms
