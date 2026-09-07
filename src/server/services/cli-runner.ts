import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CliRunnerOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Feed stdin (used with PTY confirm wrapper) */
  input?: string;
  /** Allocate a PTY via `script` so inquire confirms work non-interactively */
  confirmYes?: boolean;
}

const DEFAULT_CANDIDATES = [
  process.env.CC_SWITCH_PATH,
  path.join(os.homedir(), '.local', 'bin', 'cc-switch'),
  '/usr/local/bin/cc-switch',
  'cc-switch',
].filter((v): v is string => Boolean(v));

/**
 * Resolve cc-switch binary path.
 * Priority: CC_SWITCH_PATH env → common install locations → PATH lookup.
 */
export function resolveCcSwitchPath(explicit?: string): string {
  const candidates = explicit ? [explicit, ...DEFAULT_CANDIDATES] : DEFAULT_CANDIDATES;
  for (const candidate of candidates) {
    if (candidate === 'cc-switch' || !candidate.includes(path.sep)) {
      const which = spawnSync('which', [candidate], { encoding: 'utf8' });
      if (which.status === 0 && which.stdout.trim()) {
        return which.stdout.trim();
      }
      continue;
    }
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }
  return explicit || process.env.CC_SWITCH_PATH || path.join(os.homedir(), '.local', 'bin', 'cc-switch');
}

/**
 * Build env for CLI child processes. Always forwards CC_SWITCH_CONFIG_DIR when set.
 */
export function buildCliEnv(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  if (process.env.CC_SWITCH_CONFIG_DIR) {
    env.CC_SWITCH_CONFIG_DIR = process.env.CC_SWITCH_CONFIG_DIR;
  }
  // Avoid interactive color/TTY noise when not using PTY
  if (!env.TERM) env.TERM = 'dumb';
  return env;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Flags whose following value must never appear in timeout/error messages. */
const SENSITIVE_CLI_FLAGS = new Set(['--password', '--api-key', '--token', '--auth-token']);

/**
 * Format argv for error/timeout messages only. Does not alter spawn args.
 */
function formatCliArgsForError(args: string[]): string {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    out.push(arg);
    if (SENSITIVE_CLI_FLAGS.has(arg) && i + 1 < args.length) {
      out.push('[REDACTED]');
      i++;
    }
  }
  return out.join(' ');
}

/**
 * Low-level CLI executor. Prefer JSON-capable CLI flags when callers need structure.
 */
export async function runCcSwitch(
  args: string[],
  options: CliRunnerOptions = {}
): Promise<CliResult> {
  const binary = resolveCcSwitchPath();
  const timeout = options.timeoutMs ?? 30000;
  const env = buildCliEnv(options.env);

  if (options.confirmYes) {
    return runWithConfirmPty(binary, args, { ...options, env, timeoutMs: timeout });
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    if (options.input) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    } else {
      child.stdin?.end();
    }

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new Error(`cc-switch timed out after ${timeout}ms: ${formatCliArgsForError(args)}`)
      );
    }, timeout);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });
  });
}

/**
 * Run a confirming CLI command inside a PTY (`script`) so inquire Accepts `y`.
 */
async function runWithConfirmPty(
  binary: string,
  args: string[],
  options: CliRunnerOptions & { env: NodeJS.ProcessEnv; timeoutMs: number }
): Promise<CliResult> {
  const quoted = [binary, ...args].map(shellQuote).join(' ');
  // Export config dir explicitly inside the script command for reliability
  const configDir = options.env.CC_SWITCH_CONFIG_DIR;
  const prefix = configDir ? `CC_SWITCH_CONFIG_DIR=${shellQuote(configDir)} ` : '';
  const inner = `${prefix}${quoted}`;

  return new Promise((resolve, reject) => {
    const child = spawn('script', ['-qfc', inner, '/dev/null'], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    // inquire Confirm defaults to N; send y + enter (and a spare enter)
    child.stdin?.write(options.input ?? 'y\n');
    child.stdin?.end();

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new Error(
          `cc-switch (pty) timed out after ${options.timeoutMs}ms: ${formatCliArgsForError(args)}`
        )
      );
    }, options.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      // Strip ANSI / script noise for callers that only need success text
      const clean = stdout.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim();
      resolve({
        stdout: clean,
        stderr: stderr.trim(),
        exitCode: code ?? 1,
      });
    });
  });
}

/** Map web UI app ids to CLI --app values */
export function toCliApp(app?: string): string | undefined {
  if (!app) return undefined;
  if (app === 'opencode' || app === 'open-code') return 'open-code';
  if (app === 'openclaw' || app === 'open-claw') return 'open-claw';
  if (app === 'kilocode-cli' || app === 'amp') return undefined; // not CLI core apps
  return app;
}

export function withAppArgs(app?: string): string[] {
  const cliApp = toCliApp(app);
  return cliApp ? ['--app', cliApp] : [];
}

export function okResult(result: CliResult, successMessage: string): { success: boolean; message: string } {
  if (result.exitCode === 0) {
    return { success: true, message: successMessage || result.stdout || 'OK' };
  }
  return {
    success: false,
    message: result.stderr || result.stdout || `cc-switch exited with code ${result.exitCode}`,
  };
}
