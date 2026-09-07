import {
  Provider,
  ProviderListResponse,
  SwitchProviderResponse,
  StatusResponse,
} from '../types/index.js';
import { configStorage } from './config-storage.js';
import { kilocodeService } from './kilocode-service.js';
import {
  runCcSwitch,
  resolveCcSwitchPath,
  withAppArgs,
  toCliApp,
  okResult,
} from './cli-runner.js';
import { sqliteReader } from './sqlite-reader.js';

type OpResult = { success: boolean; message: string };

function inferProviderType(id: string): Provider['type'] {
  const lowerId = id.toLowerCase();
  if (lowerId.includes('claude') || lowerId.includes('anthropic')) return 'claude';
  if (lowerId.includes('gemini') || lowerId.includes('google')) return 'gemini';
  if (lowerId.includes('codex') || lowerId.includes('openai')) return 'codex';
  return 'custom';
}

function isTruthy(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

function base64Url(data: string): string {
  return Buffer.from(data, 'utf8').toString('base64');
}

function appEnabledColumn(app: string): string {
  const map: Record<string, string> = {
    claude: 'enabled_claude',
    codex: 'enabled_codex',
    gemini: 'enabled_gemini',
    opencode: 'enabled_opencode',
    'open-code': 'enabled_opencode',
    hermes: 'enabled_hermes',
    openclaw: 'enabled_openclaw',
    'open-claw': 'enabled_openclaw',
    pi: 'enabled_pi',
  };
  return map[app] || `enabled_${app.replace(/-/g, '_')}`;
}

/**
 * Thin Web UI adapter around cc-switch CLI.
 * Mutations go through CLI (or deeplink CLI). Structured reads use sqlite-reader when CLI lacks JSON.
 */
export class CCSwitchAdapter {
  getBinaryPath(): string {
    return resolveCcSwitchPath();
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await runCcSwitch(['--version'], { timeoutMs: 5000 });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getVersion(): Promise<string> {
    try {
      const result = await runCcSwitch(['--version'], { timeoutMs: 5000 });
      return result.exitCode === 0 ? result.stdout.trim() : 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Backend health/capability snapshot for /api/health and Dashboard.
   */
  async getBackendHealth(): Promise<{
    ccSwitchPath: string;
    ccSwitchVersion: string;
    ccSwitchAvailable: boolean;
    configDir: string;
    dbPath: string;
    schemaVersion: number;
    backendMode: 'cli+sqlite-readonly';
    capabilities: {
      cliMutations: boolean;
      sqliteReads: boolean;
      settingsJson: boolean;
      interactiveOnlyCli: string[];
    };
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const ccSwitchPath = this.getBinaryPath();
    let ccSwitchAvailable = false;
    let ccSwitchVersion = 'unknown';
    try {
      const ver = await runCcSwitch(['--version'], { timeoutMs: 5000 });
      ccSwitchAvailable = ver.exitCode === 0;
      ccSwitchVersion = ver.stdout.trim() || 'unknown';
      if (!ccSwitchAvailable) warnings.push('cc-switch --version failed');
    } catch (e) {
      warnings.push(`cc-switch not runnable: ${e instanceof Error ? e.message : String(e)}`);
    }

    const schema = await sqliteReader.inspectSchema(true);
    warnings.push(...schema.warnings);

    let settingsJson = false;
    try {
      const s = await runCcSwitch(['settings', 'show', '--json'], { timeoutMs: 8000 });
      settingsJson = s.exitCode === 0;
      if (!settingsJson) warnings.push('settings show --json unavailable');
    } catch {
      warnings.push('settings show --json failed');
    }

    if (!process.env.CC_SWITCH_PATH) {
      warnings.push(`CC_SWITCH_PATH unset; using detected binary: ${ccSwitchPath}`);
    }
    if (!process.env.CC_SWITCH_CONFIG_DIR) {
      warnings.push('CC_SWITCH_CONFIG_DIR unset; CLI default config dir in use');
    }

    return {
      ccSwitchPath,
      ccSwitchVersion,
      ccSwitchAvailable,
      configDir: schema.configDir,
      dbPath: schema.dbPath,
      schemaVersion: schema.userVersion,
      backendMode: 'cli+sqlite-readonly',
      capabilities: {
        cliMutations: ccSwitchAvailable,
        sqliteReads: schema.userVersion >= 0,
        settingsJson,
        interactiveOnlyCli: [
          'provider edit (interactive TUI only — web edit unsupported)',
          'mcp edit (interactive TUI only; deeplink import does not update existing configs)',
          'prompts edit content (interactive TUI only; name/description via prompts rename)',
          'mcp add (interactive TUI; web add uses deeplink import)',
          'prompts create (web uses deeplink import + optional rename)',
          'delete commands require PTY confirm',
        ],
      },
      warnings,
    };
  }

  /** Clear unsupported result — never delete+recreate as a fake "edit". */
  private unsupportedEdit(resource: string, detail: string): OpResult {
    return {
      success: false,
      message: `Unsupported: cc-switch 5.10.4 has no safe non-interactive ${resource} edit (${detail}). Use the local cc-switch TUI/CLI. The web UI will not delete+recreate to simulate edit.`,
    };
  }

  // ============================================
  // Providers
  // ============================================

  async listProviders(app?: string): Promise<ProviderListResponse> {
    if (app === 'kilocode-cli') {
      const providers = await kilocodeService.listProviders();
      const currentProvider = providers.find((p) => p.isActive);
      return {
        providers,
        currentProviderId: currentProvider ? currentProvider.id : null,
      };
    }

    const appType = toCliApp(app) || app || 'claude';
    // open-code is stored as open-code / opencode depending on schema; try both
    let rows = await sqliteReader.listProviders(appType);
    if (rows.length === 0 && appType === 'open-code') {
      rows = await sqliteReader.listProviders('opencode');
    }

    const providers: Provider[] = rows.map((row) => {
      const settings = sqliteReader.parseSettingsConfig(row.settings_config);
      return {
        id: row.id,
        name: row.name,
        type: inferProviderType(row.id),
        isActive: isTruthy(row.is_current),
        config: {
          ...settings,
          websiteUrl: row.website_url || '',
          notes: row.notes || '',
          sortIndex: row.sort_index || 0,
        },
      };
    });

    const current = providers.find((p) => p.isActive);
    return {
      providers,
      currentProviderId: current?.id || null,
    };
  }

  async getProviderById(providerId: string, app?: string): Promise<Provider | null> {
    if (app === 'kilocode-cli') {
      return kilocodeService.getProviderById(providerId);
    }
    const appType = toCliApp(app) || app || 'claude';
    const row = await sqliteReader.getProvider(providerId, appType);
    if (!row) return null;
    const settings = sqliteReader.parseSettingsConfig(row.settings_config);
    return {
      id: row.id,
      name: row.name,
      type: inferProviderType(row.id),
      isActive: isTruthy(row.is_current),
      config: {
        ...settings,
        websiteUrl: row.website_url || '',
        notes: row.notes || '',
        sortIndex: row.sort_index || 0,
      },
    };
  }

  async getCurrentProvider(app?: string): Promise<{ id: string; name: string } | null> {
    const list = await this.listProviders(app);
    const current = list.providers.find((p) => p.id === list.currentProviderId);
    return current ? { id: current.id, name: current.name } : null;
  }

  async switchProvider(providerId: string, app?: string): Promise<SwitchProviderResponse> {
    try {
      const appConfig = configStorage.getAppConfig();
      const previousProviderId = appConfig.settings.lastProviderId;

      if (app === 'kilocode-cli') {
        await kilocodeService.switchProvider(providerId);
      } else {
        const result = await runCcSwitch([...withAppArgs(app), 'provider', 'switch', providerId]);
        if (result.exitCode !== 0) {
          return {
            success: false,
            message: `Failed to switch provider: ${result.stderr || result.stdout}`,
          };
        }
      }

      appConfig.settings.lastProviderId = providerId;
      configStorage.saveAppConfig(appConfig);
      configStorage.addLog({
        level: 'info',
        operation: 'switch_provider',
        message: `Switched to provider: ${providerId}`,
        details: { previousProviderId, currentProviderId: providerId },
      });

      return {
        success: true,
        message: `Successfully switched to provider: ${providerId}`,
        previousProviderId: previousProviderId ?? undefined,
        currentProviderId: providerId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: errorMessage };
    }
  }

  async addProvider(params: {
    id: string;
    name: string;
    apiUrl: string;
    apiKey?: string;
    app?: string;
    websiteUrl?: string;
    notes?: string;
    sortIndex?: number;
    model?: string;
    models?: Record<string, unknown>;
    haikuModel?: string;
    sonnetModel?: string;
    opusModel?: string;
    providerType?: string;
    usePromptCache?: boolean;
    settingsConfig?: Record<string, unknown>;
  }): Promise<OpResult> {
    if (!/^[a-zA-Z0-9_-]+$/.test(params.id)) {
      return {
        success: false,
        message: 'Provider ID must contain only alphanumeric characters, hyphens, and underscores.',
      };
    }

    const app = params.app || 'claude';
    if (app === 'kilocode-cli') {
      await kilocodeService.addProvider({
        ...params,
        models: params.models as Parameters<typeof kilocodeService.addProvider>[0]['models'],
      });
      return { success: true, message: `Successfully added provider '${params.id}' to Kilocode` };
    }

    // Hermes / OpenClaw / OpenCode require raw settings_config; do not guess field→config conversion
    const cliApp = toCliApp(app) || app;
    if (
      (cliApp === 'hermes' || cliApp === 'open-claw' || cliApp === 'open-code') &&
      !params.settingsConfig
    ) {
      return {
        success: false,
        message:
          `Unsupported: provider add for ${cliApp} requires raw settingsConfig ` +
          '(CLI --config / --config-file). Generic field forms cannot safely create these providers.',
      };
    }

    const args = [
      ...withAppArgs(app),
      'provider',
      'add',
      '--name',
      params.name,
      '--id',
      params.id,
    ];

    if (params.settingsConfig) {
      args.push('--config', JSON.stringify(params.settingsConfig));
    } else {
      if (params.apiUrl) args.push('--base-url', params.apiUrl);
      if (params.apiKey) args.push('--api-key', params.apiKey);
      if (params.model) args.push('--model', params.model);
      if (params.haikuModel) args.push('--haiku-model', params.haikuModel);
      if (params.sonnetModel) args.push('--sonnet-model', params.sonnetModel);
      if (params.opusModel) args.push('--opus-model', params.opusModel);
    }
    if (params.websiteUrl) args.push('--website-url', params.websiteUrl);
    if (params.notes) args.push('--notes', params.notes);
    if (params.sortIndex !== undefined) args.push('--sort-index', String(params.sortIndex));

    const result = await runCcSwitch(args);
    return okResult(result, `Successfully added provider '${params.id}'`);
  }

  /**
   * Provider edit is interactive-only in cc-switch 5.10.4 (`provider edit <id>` has no field flags).
   * Do NOT delete+re-add — that can destroy a working config if recreate fails.
   */
  async editProvider(params: {
    id: string;
    name?: string;
    apiUrl?: string;
    apiKey?: string;
    app?: string;
    websiteUrl?: string;
    notes?: string;
    sortIndex?: number;
    model?: string;
    models?: Record<string, unknown>;
    haikuModel?: string;
    sonnetModel?: string;
    opusModel?: string;
    providerType?: string;
    usePromptCache?: boolean;
  }): Promise<OpResult> {
    const app = params.app || 'claude';
    if (app === 'kilocode-cli') {
      await kilocodeService.editProvider(params.id, {
        ...params,
        models: params.models as Parameters<typeof kilocodeService.editProvider>[1]['models'],
      });
      return { success: true, message: 'Provider updated successfully' };
    }

    return this.unsupportedEdit(
      'provider',
      'interactive TUI only; no non-interactive field flags or safe deeplink rewrite'
    );
  }

  async duplicateProvider(
    id: string,
    newId: string,
    app: string = 'claude',
    targetApp?: string
  ): Promise<OpResult> {
    if (!/^[a-zA-Z0-9_-]+$/.test(newId)) {
      return {
        success: false,
        message: 'New provider ID must contain only alphanumeric characters, hyphens, and underscores.',
      };
    }

    const destApp = targetApp || app;

    if (app === 'kilocode-cli' || destApp === 'kilocode-cli') {
      // Preserve existing kilocode cross-app behavior via service (file-based, not SQLite)
      if (app === 'kilocode-cli' && destApp === 'kilocode-cli') {
        const provider = await kilocodeService.getProviderById(id);
        if (!provider) return { success: false, message: 'Source provider not found' };
        const pConfig = provider.config || {};
        const options = (pConfig.options as Record<string, unknown>) || {};
        await kilocodeService.addProvider({
          id: newId,
          name: newId,
          apiUrl: String(options.baseURL || options.baseUrl || ''),
          apiKey: String(options.apiKey || ''),
        });
        return { success: true, message: `Successfully duplicated provider '${id}' to '${newId}'` };
      }
    }

    const source = await this.getProviderById(id, app);
    if (!source) return { success: false, message: `Provider '${id}' not found in app '${app}'` };

    const cfg = { ...(source.config || {}) } as Record<string, unknown>;
    const websiteUrl = String(cfg.websiteUrl || '');
    const notes = String(cfg.notes || '');
    delete cfg.websiteUrl;
    delete cfg.notes;
    delete cfg.sortIndex;

    // Same-app shortcut when newId is the CLI default pattern: use CLI duplicate then stop if IDs match
    if (destApp === app && newId === `${id}-copy`) {
      const result = await runCcSwitch([...withAppArgs(app), 'provider', 'duplicate', id]);
      return okResult(result, `Successfully duplicated provider '${id}' to '${newId}'`);
    }

    return this.addProvider({
      id: newId,
      name: `${source.name} (Copy)`,
      apiUrl: '',
      app: destApp,
      websiteUrl,
      notes,
      settingsConfig: cfg,
    });
  }

  async deleteProvider(providerId: string, app?: string): Promise<OpResult> {
    const appType = app || 'claude';
    if (appType === 'kilocode-cli') {
      await kilocodeService.deleteProvider(providerId);
      return { success: true, message: `Deleted provider: ${providerId}` };
    }

    const result = await runCcSwitch(
      [...withAppArgs(appType), 'provider', 'delete', providerId],
      { confirmYes: true }
    );
    if (result.exitCode === 0) {
      configStorage.addLog({
        level: 'info',
        operation: 'delete_provider',
        message: `Deleted provider: ${providerId}`,
        details: { providerId, appType },
      });
    }
    return okResult(result, `Deleted provider: ${providerId}`);
  }

  async speedtestProvider(
    id: string,
    app: string = 'claude'
  ): Promise<{ success: boolean; message: string; latency?: number }> {
    const result = await runCcSwitch([...withAppArgs(app), 'provider', 'speedtest', id], {
      timeoutMs: 60000,
    });
    if (result.exitCode === 0) {
      const match = result.stdout.match(/(\d+)\s*ms/i);
      return {
        success: true,
        message: result.stdout,
        latency: match ? parseInt(match[1], 10) : undefined,
      };
    }
    return { success: false, message: result.stderr || result.stdout };
  }

  // ============================================
  // Status / Config
  // ============================================

  async getStatus(): Promise<StatusResponse> {
    try {
      const appConfig = configStorage.getAppConfig();
      let activeProfile = null;
      if (appConfig.settings?.lastProfileId) {
        activeProfile = configStorage.getProfileById(appConfig.settings.lastProfileId);
      }
      const providers = await this.listProviders();
      const currentProvider =
        providers.providers.find((p) => p.id === providers.currentProviderId) || null;

      return {
        currentProvider,
        activeProfile,
        lastSwitchAt: appConfig.lastUpdated,
        version: appConfig.version,
      };
    } catch {
      const appConfig = configStorage.getAppConfig();
      return {
        currentProvider: null,
        activeProfile: null,
        lastSwitchAt: appConfig.lastUpdated,
        version: appConfig.version,
      };
    }
  }

  async getRawConfig(): Promise<string> {
    const result = await runCcSwitch(['config', 'show']);
    return result.stdout;
  }

  async getConfigPath(app?: string): Promise<string | null> {
    const result = await runCcSwitch([...withAppArgs(app), 'config', 'path']);
    return result.exitCode === 0 ? result.stdout.trim() : null;
  }

  async exportConfig(outputPath: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'config', 'export', outputPath]);
    return okResult(result, `Successfully exported config to: ${outputPath}`);
  }

  async importConfig(inputPath: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'config', 'import', inputPath], {
      confirmYes: true,
      timeoutMs: 60000,
    });
    return okResult(result, `Successfully imported config from: ${inputPath}`);
  }

  async backupConfig(app?: string): Promise<OpResult & { backupPath?: string }> {
    const result = await runCcSwitch([...withAppArgs(app), 'config', 'backup']);
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || result.stdout };
    }
    const backupPathMatch = result.stdout.match(/(?:saved to|created at|backed up to|Backup):\s*(.+)/i);
    return {
      success: true,
      message: 'Successfully created config backup',
      backupPath: backupPathMatch?.[1]?.trim(),
    };
  }

  async restoreConfig(backupPath: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'config', 'restore', backupPath], {
      confirmYes: true,
      timeoutMs: 60000,
    });
    return okResult(result, `Successfully restored config from: ${backupPath}`);
  }

  // ============================================
  // WebDAV (CLI only — no direct settings/SQLite writes)
  // ============================================

  private webDavOpResult(
    result: { stdout: string; stderr: string; exitCode: number },
    successMessage: string
  ): OpResult & { output?: string } {
    let output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    // PTY confirm may echo the typed "y"
    output = output.replace(/^(?:y\r?\n)+/i, '').trim();
    // 5.10.4 sometimes exits 0 while printing Error: for unconfigured WebDAV
    const looksFailed =
      result.exitCode !== 0 ||
      /^Error:/im.test(output) ||
      /未配置\s*WebDAV/i.test(output) ||
      /WebDAV sync is not configured/i.test(output);
    if (looksFailed) {
      return {
        success: false,
        message: output || successMessage + ' failed',
        output,
      };
    }
    return { success: true, message: successMessage, output: result.stdout };
  }

  async getWebDavStatus(): Promise<OpResult & { output?: string }> {
    // 5.10.4 has `config webdav show` (no `status` subcommand)
    // CLI prints Password in plaintext — never return that to the Web UI/API.
    const result = await runCcSwitch(['config', 'webdav', 'show']);
    const redactPasswordLine = (text: string) =>
      text.replace(/^(Password:\s*).+$/gim, '$1[REDACTED]');
    if (result.exitCode !== 0) {
      const raw = result.stderr || result.stdout || 'WebDAV show failed';
      return { success: false, message: redactPasswordLine(raw) };
    }
    return {
      success: true,
      message: 'WebDAV settings',
      output: redactPasswordLine(result.stdout || 'WebDAV sync is not configured.'),
    };
  }

  async checkWebDavConnection(): Promise<OpResult & { output?: string }> {
    const result = await runCcSwitch(['config', 'webdav', 'check-connection'], {
      timeoutMs: 60000,
    });
    return this.webDavOpResult(result, 'WebDAV connection OK');
  }

  async uploadWebDav(): Promise<OpResult & { output?: string }> {
    const result = await runCcSwitch(['config', 'webdav', 'upload'], { timeoutMs: 120000 });
    return this.webDavOpResult(result, 'WebDAV upload completed');
  }

  async downloadWebDav(): Promise<OpResult & { output?: string }> {
    const result = await runCcSwitch(['config', 'webdav', 'download'], {
      confirmYes: true,
      timeoutMs: 120000,
    });
    return this.webDavOpResult(result, 'WebDAV download completed');
  }

  /**
   * `config webdav set` exposes stable non-interactive flags in 5.10.4.
   */
  async setWebDav(params: {
    baseUrl?: string;
    remoteRoot?: string;
    username?: string;
    password?: string;
    profile?: string;
    enable?: boolean;
    autoSync?: boolean;
  }): Promise<OpResult & { output?: string }> {
    const args = ['config', 'webdav', 'set'];
    if (params.baseUrl) args.push('--base-url', params.baseUrl);
    if (params.remoteRoot) args.push('--remote-root', params.remoteRoot);
    if (params.username) args.push('--username', params.username);
    if (params.password) args.push('--password', params.password);
    if (params.profile) args.push('--profile', params.profile);
    if (params.enable === true) args.push('--enable');
    if (params.enable === false) args.push('--disable');
    if (params.autoSync === true) args.push('--auto-sync');
    if (params.autoSync === false) args.push('--no-auto-sync');

    if (args.length === 3) {
      return { success: false, message: 'At least one WebDAV setting flag is required' };
    }

    const result = await runCcSwitch(args);
    return this.webDavOpResult(result, 'WebDAV settings saved');
  }

  // ============================================
  // MCP
  // ============================================

  async listMcpServers(app?: string): Promise<
    Array<{
      id: string;
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      enabled?: boolean;
    }>
  > {
    const rows = await sqliteReader.listMcpServers();
    const col = app ? appEnabledColumn(app) : 'enabled_claude';
    return rows.map((row) => {
      const cfg = sqliteReader.parseServerConfig(row.server_config);
      return {
        id: row.id,
        name: row.name,
        command: cfg.command,
        args: cfg.args,
        env: cfg.env,
        enabled: isTruthy(row[col]),
      };
    });
  }

  async addMcpServer(params: {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    app?: string;
  }): Promise<OpResult> {
    const id = params.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    // deeplink apps param uses opencode (not open-code)
    const apps = (params.app === 'open-code' ? 'opencode' : params.app) || 'claude';
    const configObj = {
      mcpServers: {
        [id]: {
          command: params.command,
          args: params.args || [],
          env: params.env || {},
        },
      },
    };
    const url = `ccswitch://v1/import?resource=mcp&apps=${encodeURIComponent(apps)}&config=${base64Url(JSON.stringify(configObj))}`;
    const result = await runCcSwitch(['deeplink', url]);
    return okResult(result, `Successfully added MCP server '${id}'`);
  }

  /**
   * MCP edit is interactive-only in 5.10.4. Deeplink re-import of an existing id does not
   * update server_config (verified). Never delete+recreate.
   */
  async editMcpServer(_params: {
    id: string;
    name?: string;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }): Promise<OpResult> {
    return this.unsupportedEdit(
      'mcp',
      'interactive `mcp edit` only; deeplink import does not overwrite existing server_config'
    );
  }

  async toggleMcpServer(id: string, enabled: boolean, app: string): Promise<OpResult> {
    const cliApp = toCliApp(app) || app;
    const sub = enabled ? 'enable' : 'disable';
    const result = await runCcSwitch(['mcp', sub, id, '--apps', cliApp]);
    return okResult(result, `${enabled ? 'Enabled' : 'Disabled'} MCP server '${id}' for ${app}`);
  }

  async deleteMcpServer(serverId: string, _app?: string): Promise<OpResult> {
    const result = await runCcSwitch(['mcp', 'delete', serverId], { confirmYes: true });
    return okResult(result, `Deleted MCP server '${serverId}'`);
  }

  async syncMcpServers(app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'mcp', 'sync']);
    return okResult(result, 'Successfully synced MCP servers');
  }

  // ============================================
  // Prompts
  // ============================================

  async listPrompts(app?: string): Promise<
    Array<{
      id: string;
      name: string;
      description?: string;
      isActive: boolean;
      updated?: string;
      content?: string;
    }>
  > {
    const appType = toCliApp(app) || app || 'claude';
    const rows = await sqliteReader.listPrompts(appType);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      isActive: isTruthy(row.enabled),
      updated: row.updated_at
        ? new Date(Number(row.updated_at) * 1000).toISOString()
        : undefined,
      content: row.content,
    }));
  }

  async activatePrompt(promptId: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'prompts', 'activate', promptId]);
    return okResult(result, `Successfully activated prompt: ${promptId}`);
  }

  async deactivatePrompt(app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'prompts', 'deactivate']);
    return okResult(result, 'Successfully deactivated prompt');
  }

  async createPrompt(params: {
    id: string;
    name: string;
    content: string;
    description?: string;
    app?: string;
  }): Promise<OpResult> {
    if (!/^[a-zA-Z0-9_-]+$/.test(params.id)) {
      return { success: false, message: 'Invalid ID format' };
    }
    const app = toCliApp(params.app) || params.app || 'claude';
    let url =
      `ccswitch://v1/import?resource=prompt&app=${encodeURIComponent(app)}` +
      `&name=${encodeURIComponent(params.name)}` +
      `&content=${base64Url(params.content)}`;
    if (params.description) {
      url += `&description=${encodeURIComponent(params.description)}`;
    }
    const result = await runCcSwitch(['deeplink', url]);
    if (result.exitCode !== 0) {
      return okResult(result, '');
    }

    // Rename generated id → requested id when possible
    const match = result.stdout.match(/id:\s*([a-zA-Z0-9_-]+)/i);
    const generatedId = match?.[1];
    if (generatedId && generatedId !== params.id) {
      const renameArgs = [
        ...withAppArgs(app),
        'prompts',
        'rename',
        generatedId,
        '--id',
        params.id,
        '--name',
        params.name,
      ];
      if (params.description) renameArgs.push('--description', params.description);
      const rename = await runCcSwitch(renameArgs);
      if (rename.exitCode !== 0) {
        return {
          success: true,
          message: `Created prompt as '${generatedId}' (rename to '${params.id}' failed: ${rename.stderr || rename.stdout})`,
        };
      }
    }
    return { success: true, message: `Successfully created prompt '${params.id}'` };
  }

  /**
   * Content edit is interactive-only (`prompts edit`). Metadata (name/description) can use
   * non-interactive `prompts rename`. Never delete+recreate to rewrite content.
   */
  async editPrompt(
    id: string,
    params: { name?: string; content?: string; description?: string; app?: string }
  ): Promise<OpResult> {
    const app = params.app || 'claude';
    const list = await this.listPrompts(app);
    const existing = list.find((p) => p.id === id);
    if (!existing) return { success: false, message: 'Prompt not found' };

    const contentChanging =
      params.content !== undefined && params.content !== (existing.content ?? '');
    if (contentChanging) {
      return this.unsupportedEdit(
        'prompt content',
        'interactive `prompts edit` only; no non-interactive content flag'
      );
    }

    const nameChanging = params.name !== undefined && params.name !== existing.name;
    const descChanging =
      params.description !== undefined && params.description !== (existing.description || '');
    if (!nameChanging && !descChanging) {
      return { success: true, message: 'No metadata changes to apply' };
    }

    const renameArgs = [...withAppArgs(app), 'prompts', 'rename', id];
    if (params.name !== undefined) renameArgs.push('--name', params.name);
    if (params.description !== undefined) renameArgs.push('--description', params.description);
    const result = await runCcSwitch(renameArgs);
    return okResult(result, 'Prompt metadata updated');
  }

  async deletePrompt(id: string, app: string = 'claude'): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'prompts', 'delete', id], {
      confirmYes: true,
    });
    return okResult(result, `Deleted prompt '${id}'`);
  }

  // ============================================
  // Skills
  // ============================================

  async listSkills(app?: string): Promise<
    Array<{ id: string; name: string; description?: string; installed: boolean; enabled?: boolean }>
  > {
    const rows = await sqliteReader.listSkills();
    const col = app ? appEnabledColumn(app) : undefined;
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      installed: true,
      enabled: col ? isTruthy(row[col]) : undefined,
    }));
  }

  async installSkill(skillName: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'install', skillName], {
      timeoutMs: 120000,
    });
    return okResult(result, `Successfully installed skill: ${skillName}`);
  }

  async uninstallSkill(skillName: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'uninstall', skillName], {
      confirmYes: true,
      timeoutMs: 60000,
    });
    return okResult(result, `Successfully uninstalled skill: ${skillName}`);
  }

  async searchSkills(query: string): Promise<Array<{ name: string; description: string; installed: boolean }>> {
    // Prefer discover/list from DB + repos; skills search may be marketplace
    const result = await runCcSwitch(['skills', 'search', query], { timeoutMs: 60000 });
    if (result.exitCode !== 0) {
      // Fallback: filter installed skills
      const installed = await this.listSkills();
      return installed
        .filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
        .map((s) => ({ name: s.name, description: s.description || '', installed: true }));
    }
    // Best-effort line parse only as fallback when no JSON exists
    const skills: Array<{ name: string; description: string; installed: boolean }> = [];
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || /name|────|┌|└|╞/i.test(trimmed)) continue;
      if (trimmed.includes('┆')) {
        const cells = trimmed.split('┆').map((c) => c.trim().replace(/[│]/g, '').trim());
        if (cells.length >= 2 && cells[0] && /[a-zA-Z0-9]/.test(cells[0])) {
          skills.push({
            name: cells[0],
            description: cells[1] || '',
            installed: trimmed.includes('installed') || trimmed.includes('✓'),
          });
        }
      }
    }
    return skills;
  }

  async listSkillRepos(): Promise<Array<{ owner: string; name: string; branch: string; enabled: boolean }>> {
    const rows = await sqliteReader.listSkillRepos();
    return rows.map((r) => ({
      owner: r.owner,
      name: r.name,
      branch: r.branch,
      enabled: isTruthy(r.enabled),
    }));
  }

  async addSkillRepo(repo: string): Promise<OpResult> {
    const result = await runCcSwitch(['skills', 'repos', 'add', repo], { timeoutMs: 60000 });
    return okResult(result, `Successfully added repo: ${repo}`);
  }

  async removeSkillRepo(repo: string): Promise<OpResult> {
    const result = await runCcSwitch(['skills', 'repos', 'remove', repo], { confirmYes: true });
    return okResult(result, `Successfully removed repo: ${repo}`);
  }

  async enableSkill(skillName: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'enable', skillName]);
    return okResult(result, `Successfully enabled skill: ${skillName}`);
  }

  async disableSkill(skillName: string, app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'disable', skillName]);
    return okResult(result, `Successfully disabled skill: ${skillName}`);
  }

  async discoverSkills(app?: string): Promise<Array<{ name: string; description: string; installed: boolean }>> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'discover'], { timeoutMs: 60000 });
    if (result.exitCode !== 0) return [];
    return this.parseSkillTable(result.stdout);
  }

  private parseSkillTable(output: string): Array<{ name: string; description: string; installed: boolean }> {
    const skills: Array<{ name: string; description: string; installed: boolean }> = [];
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes('┆')) continue;
      if (/Directory|Name|┌|└|╞|═/.test(trimmed)) continue;
      const cells = trimmed.split('┆').map((c) => c.trim()).filter(Boolean);
      if (cells.length >= 2 && cells[1] && /[a-zA-Z0-9]/.test(cells[1])) {
        skills.push({ name: cells[1], description: cells[2] || '', installed: false });
      }
    }
    return skills;
  }

  async syncSkills(app?: string): Promise<OpResult> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'sync']);
    return okResult(result, result.stdout || 'Successfully synced skills');
  }

  async scanUnmanagedSkills(app?: string): Promise<Array<{ name: string; path: string; app: string }>> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'scan-unmanaged']);
    if (result.exitCode !== 0 || result.stdout.includes('No unmanaged')) return [];
    const skills: Array<{ name: string; path: string; app: string }> = [];
    for (const line of result.stdout.split('\n')) {
      if (!line.includes('┆')) continue;
      const cells = line.split('┆').map((c) => c.trim().replace(/[│]/g, '').trim());
      if (cells.length >= 3 && cells[0] && cells[0] !== 'Name') {
        skills.push({ name: cells[0], path: cells[1], app: cells[2] });
      }
    }
    return skills;
  }

  async importSkillsFromApps(app?: string): Promise<OpResult & { imported?: string[] }> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'import-from-apps'], {
      confirmYes: true,
      timeoutMs: 60000,
    });
    if (result.exitCode !== 0) {
      return { success: false, message: result.stderr || result.stdout };
    }
    return { success: true, message: result.stdout || 'Successfully imported skills', imported: [] };
  }

  async getSkillInfo(
    skillName: string,
    app?: string
  ): Promise<{
    name: string;
    description?: string;
    version?: string;
    author?: string;
    path?: string;
    enabled?: boolean;
    installed?: boolean;
  } | null> {
    const result = await runCcSwitch([...withAppArgs(app), 'skills', 'info', skillName]);
    if (result.exitCode !== 0) return null;
    const info: Record<string, string | boolean> = {};
    for (const line of result.stdout.split('\n')) {
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (key === 'enabled' || key === 'installed') {
        info[key] = /true|yes|✓/i.test(value);
      } else {
        info[key] = value;
      }
    }
    return info.name ? (info as { name: string }) : { name: skillName, description: result.stdout };
  }

  async getSyncMethod(): Promise<{ method: string }> {
    // Prefer settings JSON when available
    try {
      const result = await runCcSwitch(['settings', 'show', '--json']);
      if (result.exitCode === 0) {
        const json = JSON.parse(result.stdout);
        const method = json.skillSyncMethod || json.skill_sync_method || 'auto';
        return { method: String(method).toLowerCase() };
      }
    } catch {
      // fall through
    }
    const result = await runCcSwitch(['skills', 'sync-method']);
    const match = result.stdout.match(/(?:method|sync.method):\s*(\w+)/i);
    return { method: match?.[1]?.toLowerCase() || 'auto' };
  }

  async setSyncMethod(method: 'auto' | 'symlink' | 'copy'): Promise<OpResult> {
    const result = await runCcSwitch(['skills', 'sync-method', method]);
    return okResult(result, `Successfully set sync method to: ${method}`);
  }

  // ============================================
  // Env
  // ============================================

  async listEnvVars(app?: string): Promise<
    Array<{ variable: string; value: string; sourceType: string; sourceLocation: string }>
  > {
    const result = await runCcSwitch([...withAppArgs(app), 'env', 'list']);
    if (result.exitCode !== 0) return [];
    const envVars: Array<{
      variable: string;
      value: string;
      sourceType: string;
      sourceLocation: string;
    }> = [];
    for (const line of result.stdout.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed.includes('┆')) continue;
      if (/Variable|┌|└|╞|═|╌/.test(trimmed)) continue;
      const cells = trimmed.split('┆').map((c) => c.trim().replace(/[│]/g, '').trim());
      if (cells.length >= 4 && cells[0]) {
        envVars.push({
          variable: cells[0],
          value: cells[1],
          sourceType: cells[2],
          sourceLocation: cells[3],
        });
      }
    }
    return envVars;
  }
}

export const ccSwitchAdapter = new CCSwitchAdapter();
