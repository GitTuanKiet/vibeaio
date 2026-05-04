---
description: Manage tools from catalog/catalog.json
disable-model-invocation: true
---

# Setup Catalog

Reads `catalog/catalog.json` and runs each step with `bash -c`. A failed step stops the current phase.

## Usage

```bash
# List entries and [x]/[ ] status
bun run scripts/setup-catalog.ts list

# Install or uninstall by id (order preserved)
bun run scripts/setup-catalog.ts install <id> [id...]
bun run scripts/setup-catalog.ts uninstall <id> [id...]

# No args: TTY → multiselect (checked = keep/install; unchecked installed = uninstall); non-TTY → use install <id>
```

## Options

```bash
bun run scripts/setup-catalog.ts --catalog /path/to/catalog.json
bun run scripts/setup-catalog.ts --dry-run   # print commands only
bun run scripts/setup-catalog.ts --force     # reinstall (ignore installed_check)
```