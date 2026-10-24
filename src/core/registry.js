const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '../commands');

// file name -> { mtime, command }
const files = new Map();
// command name / alias -> command
const lookup = new Map();

function loadFile(file) {
    const filePath = path.join(COMMANDS_DIR, file);
    const mtime = fs.statSync(filePath).mtimeMs;
    const known = files.get(file);
    if (known && known.mtime === mtime) return false;

    delete require.cache[require.resolve(filePath)];
    try {
        const command = require(filePath);
        if (!command.name || typeof command.execute !== 'function') {
            throw new Error('a command needs `name` and `execute()`');
        }
        files.set(file, { mtime, command });
    } catch (e) {
        console.error(`[LOADER ERROR] ${file}: ${e.message}`);
        files.set(file, { mtime, command: null }); // don't retry until the file changes
    }
    return true;
}

/**
 * Syncs the registry with the commands folder.
 * Only new/edited files are re-required and removed files are dropped,
 * so adding or editing a command file takes effect without a restart.
 */
function refresh() {
    const present = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js'));
    let changed = false;

    for (const file of present) changed = loadFile(file) || changed;
    for (const file of files.keys()) {
        if (!present.includes(file)) {
            files.delete(file);
            changed = true;
        }
    }

    if (changed) {
        lookup.clear();
        for (const { command } of files.values()) {
            if (!command) continue;
            lookup.set(command.name.toLowerCase(), command);
            for (const alias of command.aliases || []) lookup.set(alias.toLowerCase(), command);
        }
    }
}

function find(name) {
    refresh();
    return lookup.get(name);
}

/** All unique commands (aliases excluded). Used by the menu. */
function list() {
    refresh();
    return [...files.values()].map(f => f.command).filter(Boolean);
}

module.exports = { find, list };
