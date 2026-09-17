# Load tests

How much NEXA takes, measured on the production server itself (2 vCPU, 4 GB, shared with other
sites) - but never against production: a separate checkout in `~/nexa-load` runs its own API on
`127.0.0.1:4200` against the `nexa_test` database, with rate limiting off and no Redis.

## The company

`seed.sql` builds it inside PostgreSQL in a few minutes:

| What                 | How many                                                    |
| -------------------- | ----------------------------------------------------------- |
| People               | 20,000, in ten departments                                  |
| Posts                | 200,000 over 90 days, each with a comment and two reactions |
| Channels             | the whole company, 5,000, 1,000, and 200 teams of 20        |
| Direct conversations | about 40,000, a dozen messages each                         |
| Messages             | about 600,000                                               |

## Scenarios (k6)

| Scenario       | What it asks                                                                            |
| -------------- | --------------------------------------------------------------------------------------- |
| `login.js`     | Sign-ins ramping to 20 a second, while 20 unrelated requests a second keep coming       |
| `browse.js`    | People opening home, feed, conversations and the bell, ramping to 400 at once           |
| `chat.js`      | Messages to a team of 20, then channels of 1,000, 5,000 and everyone, while others read |
| `directory.js` | Opening the directory: every page of members and their presence, or just the first 50   |

## Running

On the server, from a checkout that has this directory:

```bash
load/setup.sh <commit> --reseed   # checkout, build, start nexa-load, seed, k6, tokens
load/run.sh before                # every scenario; results in ~/nexa-load/load/results/before
load/setup.sh <newer-commit>      # rebuild the API on the same data
load/run.sh after
pm2 delete nexa-load              # when done
```

`apps/api/scripts/load-tokens.ts` signs access tokens with the load API's own secret, so the
scenarios don't spend their time logging people in (except `login.js`, which is about exactly
that). `monitor.sh` samples CPU and memory every five seconds next to each run.
