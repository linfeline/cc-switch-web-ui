import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { resolveCcSwitchPath, runCcSwitch, buildCliEnv } from './cli-runner.js';

export interface SchemaInfo {
  userVersion: number;
  dbPath: string;
  configDir: string;
  tables: string[];
  mcpEnabledColumns: string[];
  skillsEnabledColumns: string[];
  warnings: string[];
}

export interface ProviderRow {
  id: string;
  name: string;
  app_type: string;
  settings_config: string | Record<string, unknown>;
  website_url?: string | null;
  notes?: string | null;
  sort_index?: number | null;
  is_current?: number | boolean | null;
  provider_type?: string | null;
}

export interface McpRow {
  id: string;
  name: string;
  server_config: string | Record<string, unknown>;
  description?: string | null;
  [key: string]: unknown;
}

export interface PromptRow {
  id: string;
  name: string;
  content: string;
  description?: string | null;
  enabled?: number | boolean | null;
  updated_at?: number | null;
  app_type: string;
}

export interface SkillRow {
  id: string;
  name: string;
  description?: string | null;
  directory: string;
  [key: string]: unknown;
}

export interface SkillRepoRow {
  owner: string;
  name: string;
  branch: string;
  enabled: number | boolean;
}

/**
 * Read-only SQLite access for cc-switch.db.
 * Isolated here so mutations never go through this module.
 * Detects schema user_version (currently 18) and enabled_* columns dynamically.
 */
export class SqliteReader {
  private cachedSchema: SchemaInfo | null = null;

  async getDbPath(): Promise<string> {
    try {
      const result = await runCcSwitch(['config', 'path'], { timeoutMs: 10000 });
      const match = result.stdout.match(/DB file:\s*(.+)/);
      if (match?.[1]) return match[1].trim();
      const dirMatch = result.stdout.match(/Config dir:\s*(.+)/);
      if (dirMatch?.[1]) return path.join(dirMatch[1].trim(), 'cc-switch.db');
    } catch {
      // fall through
    }
    const configDir = process.env.CC_SWITCH_CONFIG_DIR || path.join(os.homedir(), '.cc-switch');
    return path.join(configDir, 'cc-switch.db');
  }

  async getConfigDir(): Promise<string> {
    try {
      const result = await runCcSwitch(['config', 'path'], { timeoutMs: 10000 });
      const match = result.stdout.match(/Config dir:\s*(.+)/);
      if (match?.[1]) return match[1].trim();
    } catch {
      // fall through
    }
    return process.env.CC_SWITCH_CONFIG_DIR || path.join(os.homedir(), '.cc-switch');
  }

  private async queryJson<T = Record<string, unknown>>(dbPath: string, sql: string): Promise<T[]> {
    return new Promise((resolve) => {
      // Always open read-only — never risk mutating live/schema-18 DBs from the wrapper.
      const child = spawn('sqlite3', ['-readonly', '-json', dbPath, sql], {
        env: buildCliEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.on('close', () => {
        try {
          const trimmed = stdout.trim();
          if (!trimmed) {
            resolve([]);
            return;
          }
          const parsed = JSON.parse(trimmed);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch {
          resolve([]);
        }
      });
      child.on('error', () => resolve([]));
    });
  }

  private async queryScalar(dbPath: string, sql: string): Promise<string> {
    return new Promise((resolve) => {
      const child = spawn('sqlite3', ['-readonly', dbPath, sql], {
        env: buildCliEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      child.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      child.on('close', () => resolve(stdout.trim()));
      child.on('error', () => resolve(''));
    });
  }

  async inspectSchema(force = false): Promise<SchemaInfo> {
    if (this.cachedSchema && !force) return this.cachedSchema;

    const warnings: string[] = [];
    const dbPath = await this.getDbPath();
    const configDir = path.dirname(dbPath);

    if (!fs.existsSync(dbPath)) {
      const info: SchemaInfo = {
        userVersion: -1,
        dbPath,
        configDir,
        tables: [],
        mcpEnabledColumns: [],
        skillsEnabledColumns: [],
        warnings: [`Database not found at ${dbPath}`],
      };
      this.cachedSchema = info;
      return info;
    }

    const versionRaw = await this.queryScalar(dbPath, 'PRAGMA user_version;');
    const userVersion = Number.parseInt(versionRaw, 10);
    if (!Number.isFinite(userVersion)) {
      warnings.push(`Unable to read PRAGMA user_version (got: ${versionRaw})`);
    } else if (userVersion !== 18) {
      warnings.push(
        `Unexpected schema user_version=${userVersion} (adapter tuned for 18; using dynamic column detection)`
      );
    }

    const tableRows = await this.queryJson<{ name: string }>(
      dbPath,
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`
    );
    const tables = tableRows.map((r) => r.name);

    const mcpCols = tables.includes('mcp_servers')
      ? await this.queryJson<{ name: string }>(dbPath, `PRAGMA table_info(mcp_servers);`)
      : [];
    const skillCols = tables.includes('skills')
      ? await this.queryJson<{ name: string }>(dbPath, `PRAGMA table_info(skills);`)
      : [];

    const mcpEnabledColumns = mcpCols.map((c) => c.name).filter((n) => n.startsWith('enabled_'));
    const skillsEnabledColumns = skillCols.map((c) => c.name).filter((n) => n.startsWith('enabled_'));

    if (!tables.includes('providers')) warnings.push('Missing providers table');
    if (!tables.includes('mcp_servers')) warnings.push('Missing mcp_servers table');

    const info: SchemaInfo = {
      userVersion: Number.isFinite(userVersion) ? userVersion : -1,
      dbPath,
      configDir,
      tables,
      mcpEnabledColumns,
      skillsEnabledColumns,
      warnings,
    };
    this.cachedSchema = info;
    return info;
  }

  async listProviders(app = 'claude'): Promise<ProviderRow[]> {
    const dbPath = await this.getDbPath();
    const safeApp = app.replace(/'/g, "''");
    return this.queryJson<ProviderRow>(
      dbPath,
      `SELECT id, name, app_type, settings_config, website_url, notes, sort_index, is_current, provider_type
       FROM providers WHERE app_type = '${safeApp}' ORDER BY sort_index ASC, name ASC;`
    );
  }

  async getProvider(id: string, app = 'claude'): Promise<ProviderRow | null> {
    const dbPath = await this.getDbPath();
    const safeId = id.replace(/'/g, "''");
    const safeApp = app.replace(/'/g, "''");
    const rows = await this.queryJson<ProviderRow>(
      dbPath,
      `SELECT id, name, app_type, settings_config, website_url, notes, sort_index, is_current, provider_type
       FROM providers WHERE id = '${safeId}' AND app_type = '${safeApp}' LIMIT 1;`
    );
    return rows[0] || null;
  }

  async listMcpServers(): Promise<McpRow[]> {
    const schema = await this.inspectSchema();
    const dbPath = schema.dbPath;
    const enabledSelect = schema.mcpEnabledColumns.length
      ? `, ${schema.mcpEnabledColumns.join(', ')}`
      : '';
    return this.queryJson<McpRow>(
      dbPath,
      `SELECT id, name, server_config, description${enabledSelect} FROM mcp_servers ORDER BY name ASC;`
    );
  }

  async listPrompts(app = 'claude'): Promise<PromptRow[]> {
    const dbPath = await this.getDbPath();
    const safeApp = app.replace(/'/g, "''");
    return this.queryJson<PromptRow>(
      dbPath,
      `SELECT id, name, content, description, enabled, updated_at, app_type
       FROM prompts WHERE app_type = '${safeApp}' ORDER BY name ASC;`
    );
  }

  async listSkills(): Promise<SkillRow[]> {
    const schema = await this.inspectSchema();
    const enabledSelect = schema.skillsEnabledColumns.length
      ? `, ${schema.skillsEnabledColumns.join(', ')}`
      : '';
    return this.queryJson<SkillRow>(
      schema.dbPath,
      `SELECT id, name, description, directory${enabledSelect} FROM skills ORDER BY name ASC;`
    );
  }

  async listSkillRepos(): Promise<SkillRepoRow[]> {
    const dbPath = await this.getDbPath();
    return this.queryJson<SkillRepoRow>(
      dbPath,
      `SELECT owner, name, branch, enabled FROM skill_repos ORDER BY owner, name;`
    );
  }

  parseSettingsConfig(raw: string | Record<string, unknown> | null | undefined): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  parseServerConfig(raw: string | Record<string, unknown> | null | undefined): {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  } {
    const obj = this.parseSettingsConfig(raw);
    return {
      command: typeof obj.command === 'string' ? obj.command : '',
      args: Array.isArray(obj.args) ? (obj.args as string[]) : undefined,
      env:
        obj.env && typeof obj.env === 'object'
          ? (obj.env as Record<string, string>)
          : undefined,
    };
  }
}

export const sqliteReader = new SqliteReader();

/** Convenience: resolve binary path without executing heavy commands */
export function detectedBinaryPath(): string {
  return resolveCcSwitchPath();
}
