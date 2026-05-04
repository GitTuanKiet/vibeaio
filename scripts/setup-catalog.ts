#!/usr/bin/env bun
import { resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { cancel, isCancel, multiselect } from "@clack/prompts";

type Scripts = {
    require_commands?: string[];
    installed_check?: string;
    preinstall?: string[];
    install: string[];
    postinstall?: string[];
    preuninstall?: string[];
    uninstall: string[];
    postuninstall?: string[];
};
type Entry = { id: string; name?: string; description?: string; repository?: string; scripts: Scripts };
type Catalog = { catalog: Entry[] };

const DEFAULT_CATALOG_PATH = resolve(import.meta.dirname, "..", "catalog/catalog.json");

let cache: Catalog | undefined;
async function validate(path: string): Promise<Catalog> {
    if (cache) return cache;
    const data: unknown = await Bun.file(path).json();
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validateFunction = ajv.compile<Catalog>(await Bun.file(resolve(import.meta.dirname, "..", "catalog/schema.json")).json());
    if (!validateFunction(data)) throw new Error(ajv.errorsText(validateFunction.errors));
    cache = data as Catalog;
    return cache;
}

function bashOk(snippet: string): boolean {
    return Bun.spawnSync(["bash", "-c", snippet], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

function commandOnPath(cmd: string): boolean {
    return bashOk(`command -v ${JSON.stringify(cmd)}`);
}

function runPhase(name: string, steps: string[] | undefined, dryRun: boolean): void {
    if (!steps?.length) return;
    console.log(`\n[${name}]`);
    for (const s of steps) {
        console.log(`  $ ${s}`);
        if (dryRun) continue;
        const r = Bun.spawnSync(["bash", "-c", s], { stdout: "inherit", stderr: "inherit", stdin: "inherit" });
        if (r.exitCode !== 0) throw new Error(`Step failed (exit ${r.exitCode}): ${s}`);
    };
}

function getEntry(data: Catalog, id: string): Entry {
    const e = data.catalog.find(x => x.id === id);
    if (!e) throw new Error(`Unknown entry: ${id}`);
    return e;
}

function checkRequiredCommands(s: Scripts): void {
    const missing = (s.require_commands ?? []).filter(c => !commandOnPath(c));
    if (missing.length) throw new Error(`Missing required commands on PATH: ${missing.join(", ")}`);
}

type UninstallOpts = { catalog: string; dryRun: boolean };
type InstallOpts = UninstallOpts & { force: boolean };


async function install(id: string, opts: InstallOpts): Promise<void> {
    const s = getEntry(await validate(opts.catalog), id).scripts;
    checkRequiredCommands(s);

    let skipInstall = false;
    if (s.installed_check && !opts.force && bashOk(s.installed_check)) {
        console.log(`[${id}] already installed (installed_check passed); skipping install phase. Use --force to override.`);
        skipInstall = true;
    }

    const tag = opts.dryRun ? " (dry-run)" : "";
    console.log(`\n=== Installing ${id} on Linux${tag} ===`);
    runPhase("preinstall", s.preinstall, opts.dryRun);
    if (!skipInstall) runPhase("install", s.install, opts.dryRun);
    runPhase("postinstall", s.postinstall, opts.dryRun);
    console.log(`\n=== Done: ${id} ===`);
}

async function list(opts: { catalog: string }): Promise<void> {
    const data = await validate(opts.catalog);
    if (!data.catalog.length) {
        console.log("Catalog is empty.");
        return;
    }
    for (const e of data.catalog) {
        const installed = !!(e.scripts.installed_check && bashOk(e.scripts.installed_check));
        const mark = installed ? "[x]" : "[ ]";
        const name = e.name ? ` (${e.name})` : "";
        const desc = e.description ? ` — ${e.description}` : "";
        console.log(`${mark} ${e.id}${name}${desc}`);
    }
}

async function uninstall(id: string, opts: UninstallOpts): Promise<void> {
    const s = getEntry(await validate(opts.catalog), id).scripts;
    const tag = opts.dryRun ? " (dry-run)" : "";
    console.log(`\n=== Uninstalling ${id} on Linux${tag} ===`);
    runPhase("preuninstall", s.preuninstall, opts.dryRun);
    runPhase("uninstall", s.uninstall, opts.dryRun);
    runPhase("postuninstall", s.postuninstall, opts.dryRun);
    console.log(`\n=== Done: ${id} ===`);
}


async function manage(opts: InstallOpts, preselectIds: string[]): Promise<void> {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("Interactive picker requires a TTY. Use 'install <id>' in non-interactive contexts.");
    }
    const data = await validate(opts.catalog);
    if (!data.catalog.length) {
        console.log("Catalog is empty.");
        return;
    }

    const ids = new Set(data.catalog.map((e: Entry) => e.id));
    const unknown = preselectIds.filter(id => !ids.has(id));
    if (unknown.length) throw new Error(`Unknown catalog id(s): ${unknown.join(", ")}`);

    const usePreselect = preselectIds.length > 0;
    const choices = data.catalog.map((e: Entry) => {
        const installedNow = !!(e.scripts.installed_check && bashOk(e.scripts.installed_check));
        const displayName = e.name ? ` ${e.name}` : "";
        const checked = usePreselect ? installedNow || preselectIds.includes(e.id) : installedNow;
        const base = `${e.id}${displayName}`;
        const desc = e.description?.trim();
        const label = desc ? `${base} — ${desc}` : base;
        return {
            label,
            value: e.id,
            checked,
        };
    });

    const selectedRaw = await multiselect({
        message: "Checked = keep or install; uncheck installed items to uninstall:",
        options: choices.map(c => ({ value: c.value, label: c.label })),
        initialValues: choices.filter(c => c.checked).map(c => c.value),
        maxItems: Math.min(20, choices.length),
        required: false,
    });

    if (isCancel(selectedRaw)) {
        cancel("Setup cancelled.");
        return;
    }
    const selected = new Set(selectedRaw);

    const toUninstall = data.catalog
        .map(e => e.id)
        .filter(id => {
            const e = getEntry(data, id);
            return !selected.has(id) && !!e.scripts.installed_check && bashOk(e.scripts.installed_check);
        });

    const toInstall = data.catalog
        .map(e => e.id)
        .filter(id => {
            if (!selected.has(id)) return false;
            const e = getEntry(data, id);
            if (!e.scripts.installed_check) return true;
            return !bashOk(e.scripts.installed_check);
        });

    if (!toUninstall.length && !toInstall.length) {
        console.log("No changes.");
        return;
    }

    if (toUninstall.length) console.log(`\nTo uninstall (${toUninstall.length}): ${toUninstall.join(", ")}`);
    if (toInstall.length) console.log(`\nTo install (${toInstall.length}): ${toInstall.join(", ")}`);

    for (const id of toUninstall) await uninstall(id, opts);
    for (const id of toInstall) await install(id, opts);
}

function help(): void {
    console.log(`Usage: bun run scripts/setup-catalog.ts [[command] | <id>...] [options]

Default: interactive multiselect (Linux TTY). Checked = installed or to install; uncheck removes. Positional ids add checks (e.g. pre-mark not-yet-installed ids).

Commands: list | install <id> | uninstall <id> | help

Options:
  --catalog <path>   (default: ${DEFAULT_CATALOG_PATH})
  --force            Run install phase even if installed_check passes
  --dry-run          Print steps only
  -h, --help

Validate: bun run scripts/validate-catalog.ts [--catalog <path>]
Each step is bash -c; non-zero exit stops the phase.`);
}

function parseArgs(argv: string[]) {
    let catalog = DEFAULT_CATALOG_PATH;
    let force = false;
    let dryRun = false;
    let wantHelp = false;
    const positional: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]!;
        if (a === "--catalog") {
            const v = argv[++i];
            if (!v) throw new Error("--catalog requires a path");
            catalog = resolve(v);
        } else if (a === "--force") force = true;
        else if (a === "--dry-run") dryRun = true;
        else if (a === "-h" || a === "--help") wantHelp = true;
        else positional.push(a);
    }
    return { positional, catalog, force, dryRun, wantHelp };
}

const KNOWN_COMMANDS = new Set(["help", "list", "install", "uninstall"]);

async function main(): Promise<void> {
    const { positional, catalog, force, dryRun, wantHelp } = parseArgs(process.argv.slice(2));
    if (wantHelp) {
        help();
        return;
    }
    const opts = { catalog, dryRun, force };
    try {
        const availableIds = (await validate(catalog)).catalog.map((e: Entry) => e.id);
        const cmd = positional[0];
        const rest = positional.slice(1);
        if (cmd && KNOWN_COMMANDS.has(cmd)) {
            switch (cmd) {
                case "list":
                    await list(opts);
                    return;
                case "install":
                    if (!rest.length) throw new Error(`install requires at least one <id>. Available ids: ${availableIds.join(", ")}`);
                    for (const id of rest) await install(id, opts);
                    return;
                case "uninstall":
                    if (!rest.length) throw new Error(`uninstall requires at least one <id>. Available ids: ${availableIds.join(", ")}`);
                    for (const id of rest) await uninstall(id, opts);
                    return;
                default:
                    help();
                    return;
            }
        }
        await manage(opts, positional);
    } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
    }
}

await main();
