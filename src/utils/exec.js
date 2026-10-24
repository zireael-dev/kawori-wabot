const os = require('os');
const { spawn } = require('child_process');

/**
 * Runs a program (no shell) and collects its output.
 * Options: timeoutMs (kills it), lowPriority (nice 19), input (stdin), maxOutput (chars kept).
 * Rejects with err.code === 'ENOENT' when the program is not installed, err.timedOut on timeout.
 */
function run(command, args, { timeoutMs = 0, lowPriority = false, input, maxOutput = 2_000_000, cwd } = {}) {
    return new Promise((resolve, reject) => {
        const proc = spawn(command, args, { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'], cwd });
        let stdout = '', stderr = '', timedOut = false;

        if (lowPriority && proc.pid) { try { os.setPriority(proc.pid, 19); } catch { /* not allowed: ignore */ } }
        const timer = timeoutMs && setTimeout(() => { timedOut = true; proc.kill('SIGKILL'); }, timeoutMs);

        proc.stdout.on('data', d => { stdout = (stdout + d).slice(-maxOutput); });
        proc.stderr.on('data', d => { stderr = (stderr + d).slice(-20000); });
        if (input !== undefined) proc.stdin.end(input);

        proc.on('error', error => { clearTimeout(timer); reject(error); });
        proc.on('close', code => {
            clearTimeout(timer);
            if (code === 0 && !timedOut) return resolve({ stdout, stderr });
            const error = new Error(timedOut ? `${command} timed out` : (stderr.trim().split('\n').pop() || `${command} exited with code ${code}`));
            Object.assign(error, { code: timedOut ? 'ETIMEDOUT' : code, timedOut, stdout, stderr });
            reject(error);
        });
    });
}

module.exports = { run };
