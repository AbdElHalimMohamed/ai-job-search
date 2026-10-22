# weworkremotely-cli

Zero-dependency Bun CLI for searching jobs on **We Work Remotely** through its
public RSS feeds.

## Setup

```bash
cd .agents/skills/weworkremotely-search/cli
bun install        # dev types only (typescript, @types/bun)
bun run typecheck
```

## Usage

```bash
bun run src/cli.ts search -q "product manager" --format table
bun run src/cli.ts search -c programming -q "rust" --format table
bun run src/cli.ts detail mathmo-maths-coach --format plain
```

See `../SKILL.md` for the full flag reference.

## Tests

```bash
bun test
```

Tests run offline. Live portal tests are opt-in:

```bash
RUN_LIVE_PORTAL_TESTS=1 bun test
```
