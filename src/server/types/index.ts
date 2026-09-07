/**
 * Type definitions for cc-switch-web-ui backend
 */

// ============================================
// App Types
// ============================================

// Core apps supported by cc-switch CLI (--app)
export type CoreAppType =
  | 'claude'
  | 'codex'
  | 'gemini'
  | 'opencode'
  | 'hermes'
  | 'openclaw'
  | 'pi';

// Legacy custom apps (file-based / non-CLI-core)
export type CustomAppType = 'kilocode-cli' | 'amp';

// Combined app type
export type AppType = CoreAppType | CustomAppType;

// List of valid app values for validation
export const VALID_APPS: AppType[] = [
  'claude', 'codex', 'gemini', 'opencode', 'hermes', 'openclaw', 'pi',
  'kilocode-cli', 'amp',
];

// Check if an app is a core app
export function isCoreApp(app: AppType): app is CoreAppType {
  return ['claude', 'codex', 'gemini', 'opencode', 'hermes', 'openclaw', 'pi'].includes(app);
}

// Check if an app is a custom app
export function isCustomApp(app: AppType): app is CustomAppType {
  return ['kilocode-cli', 'amp'].includes(app);
}

// ============================================
// Provider Types
// ============================================

export interface Provider {
  id: string;
  name: string;
  type: 'claude' | 'gemini' | 'codex' | 'custom';
  isActive: boolean;
  config?: Record<string, unknown>;
}

export interface ProviderListResponse {
  providers: Provider[];
  currentProviderId: string | null;
}

export interface SwitchProviderRequest {
  providerId: string;
}

export interface SwitchProviderResponse {
  success: boolean;
  message: string;
  previousProviderId?: string;
  currentProviderId?: string;
}

// ============================================
// Profile Types
// ============================================

export interface Profile {
  id: string;
  name: string;
  description?: string;
  providerId: string;
  providerName: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileListResponse {
  profiles: Profile[];
}

export interface SaveProfileRequest {
  name: string;
  description?: string;
}

export interface SaveProfileResponse {
  success: boolean;
  message: string;
  profile: Profile;
}

export interface LoadProfileRequest {
  profileId: string;
}

export interface LoadProfileResponse {
  success: boolean;
  message: string;
  profile: Profile;
}

// ============================================
// Custom Tool Types
// ============================================

export interface CustomTool {
  id: string;
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomToolListResponse {
  tools: CustomTool[];
}

export interface RegisterToolRequest {
  name: string;
  description?: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface RegisterToolResponse {
  success: boolean;
  message: string;
  tool: CustomTool;
}

// ============================================
// Log Types
// ============================================

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  operation: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface LogListResponse {
  logs: LogEntry[];
  total: number;
}

// ============================================
// Auth Types
// ============================================

export interface LoginRequest {
  password: string;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  token?: string;
}

// ============================================
// Status Types
// ============================================

export interface StatusResponse {
  currentProvider: Provider | null;
  activeProfile: Profile | null;
  lastSwitchAt: string | null;
  version: string;
}

// ============================================
// Health Types
// ============================================

export interface HealthResponse {
  status: 'ok' | 'error' | 'degraded';
  timestamp: string;
  uptime: number;
  ccSwitchAvailable: boolean;
  storageAccessible?: boolean;
  responseTime?: string;
  ccSwitchPath?: string;
  ccSwitchVersion?: string;
  configDir?: string;
  dbPath?: string;
  schemaVersion?: number;
  backendMode?: string;
  capabilities?: {
    cliMutations: boolean;
    sqliteReads: boolean;
    settingsJson: boolean;
    interactiveOnlyCli: string[];
  };
  warnings?: string[];
  error?: string;
}

// ============================================
// Config Storage Types
// ============================================

export interface AppConfig {
  version: string;
  lastUpdated: string;
  settings: {
    lastProviderId: string | null;
    lastProfileId: string | null;
    autoSwitch: boolean;
    theme?: 'light' | 'dark' | 'system';
    notifications?: boolean;
  };
}

export interface ProfilesStorage {
  profiles: Profile[];
}

export interface CustomToolsStorage {
  tools: CustomTool[];
}

export interface LogsStorage {
  logs: LogEntry[];
  maxEntries: number;
}

// ============================================
// API Response Types
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
}

// ============================================
// MCP Server Types
// ============================================

export interface McpServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpServerListResponse {
  servers: McpServer[];
}

// ============================================
// Prompts Types
// ============================================

export interface Prompt {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  updated?: string;
}

export interface PromptListResponse {
  prompts: Prompt[];
}

// ============================================
// Skills Types
// ============================================

export interface Skill {
  id: string;
  name: string;
  description?: string;
  installed: boolean;
}

export interface SkillListResponse {
  skills: Skill[];
}

// ============================================
// Environment Variables Types
// ============================================

export interface EnvVar {
  variable: string;
  value: string;
  sourceType: string;
  sourceLocation: string;
}

export interface EnvVarListResponse {
  envVars: EnvVar[];
}

// ============================================
// Config Management Types
// ============================================

export interface ConfigExportRequest {
  outputPath: string;
  app?: string;
}

export interface ConfigImportRequest {
  inputPath: string;
  app?: string;
}

export interface ConfigBackupResponse {
  success: boolean;
  message: string;
  backupPath?: string;
}

export interface ConfigRestoreRequest {
  backupPath: string;
  app?: string;
}

export interface WebDavSetRequest {
  baseUrl?: string;
  remoteRoot?: string;
  username?: string;
  password?: string;
  profile?: string;
  enable?: boolean;
  autoSync?: boolean;
}

export interface WebDavOpResponse {
  success: boolean;
  message: string;
  output?: string;
}
