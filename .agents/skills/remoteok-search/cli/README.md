# remoteok-cli

Zero-dependency Bun CLI for searching jobs on **RemoteOK** through its public
JSON API.

## Setup

```bash
cd .agents/skills/remoteok-search/cli
bun install        # dev types only (typescript, @types/bun)
bun run typecheck
```

## Usage

```bash
bun run src/cli.ts search -q "data engineer" --format table
bun run src/cli.ts search -q "designer" -l "Europe" --format table
bun run src/cli.ts detail 1134704 --format plain
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
