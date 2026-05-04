# Vibeaio

One-time setup for a curated **AI coding stack**: clone/link skills, resolve dependencies, and install tools from the JSON catalog ([`catalog/catalog.json`](catalog/catalog.json)).

## Quick setup

```bash
curl -fsSL https://raw.githubusercontent.com/GitTuanKiet/vibeaio/master/setup.sh | bash
```

## Scripts

- `bun run setup:catalog` — interactive catalog install/update ([`scripts/setup-catalog.ts`](scripts/setup-catalog.ts))
- `bun run typecheck` — TypeScript check

## Claude Code plugin

[`plugin.json`](.claude-plugin/plugin.json) bundles skills and the `setup-catalog` command.

## License

MIT

---

*[Tiếng Việt](README.vi-VN.md)*
