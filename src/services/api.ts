import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  LoginRequest,
  LoginResponse,
  HealthResponse,
  StatusResponse,
  Provider,
  ProviderListResponse,
  SwitchProviderRequest,
  SwitchProviderResponse,
  CustomToolListResponse,
  CustomTool,
  RegisterToolRequest,
  RegisterToolResponse,
  RunToolRequest,
  RunToolResult,
  ProfileListResponse,
  SaveProfileRequest,
  SaveProfileResponse,
  LoadProfileRequest,
  LoadProfileResponse,
  LogListResponse,
  SettingsResponse,
  UpdateSettingsRequest,
  McpServerListResponse,
  AddMcpServerRequest,
  EditMcpServerRequest,
  ToggleMcpServerRequest,
  PromptListResponse,
  SkillListResponse,
  EnvVarListResponse,
  ConfigExportRequest,
  ConfigImportRequest,
  ConfigBackupResponse,
  ConfigRestoreRequest,
  WebDavSetRequest,
  ApiResponse,
} from '../types';

const API_BASE_URL = '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('auth_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // For 4xx errors, return the error response data so it can be handled
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    // Reject the promise to trigger catch blocks in callers
    return Promise.reject(error);
  }
);

// Helper to unwrap API response
function unwrap<T>(response: { data: ApiResponse<T> | T }): T {
  const body = response.data as ApiResponse<T>;
  // Check if it's a wrapped response
  if (body && typeof body === 'object' && 'success' in body) {
    if (body.success) {
      return body.data as T;
    }
    throw new Error(body.error || body.message || 'Request failed');
  }
  // If not wrapped (e.g. health check might be different), return as is
  return body as T;
}

// ============================================
// Auth API
// ============================================

export const authApi = {
  login: async (password: string): Promise<LoginResponse> => {
    const response = await api.post<LoginResponse>('/auth/login', { password } as LoginRequest);
    // Check if response indicates failure (e.g., 401 status)
    if (!response.data.success) {
      throw new Error(response.data.message || 'Login failed');
    }
    return response.data;
  },
};

// ============================================
// Health API
// ============================================

export const healthApi = {
  check: async (): Promise<HealthResponse> => {
    const response = await api.get<HealthResponse>('/health');
    return response.data; // HealthResponse is not wrapped in success/data
  },
};

// ============================================
// Status API
// ============================================

export const statusApi = {
  get: async (): Promise<StatusResponse> => {
    const response = await api.get<ApiResponse<StatusResponse>>('/status');
    return unwrap(response);
  },
};

// ============================================
// Providers API
// ============================================

export const providersApi = {
  list: async (app?: string): Promise<ProviderListResponse> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<ProviderListResponse>>(`/providers?${params.toString()}`);
    return unwrap(response);
  },

  getCurrent: async (app?: string): Promise<{ provider: Provider | null; providerId: string | null }> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<{ provider: Provider | null; providerId: string | null }>>(`/providers/current?${params.toString()}`);
    return unwrap(response);
  },

  get: async (providerId: string, app?: string): Promise<Provider> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<Provider>>(`/providers/${providerId}?${params.toString()}`);
    return unwrap(response);
  },

  switch: async (providerId: string, app?: string): Promise<SwitchProviderResponse> => {
    const response = await api.post<ApiResponse<SwitchProviderResponse>>('/providers/switch', {
      providerId,
      app,
    } as SwitchProviderRequest);
    return unwrap(response);
  },

  delete: async (providerId: string, app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.delete<ApiResponse<any>>(`/providers/${providerId}?${params.toString()}`);
    return unwrap(response);
  },

  add: async (data: any, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/providers/add', { ...data, app });
    return unwrap(response);
  },

  edit: async (data: any, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/providers/edit', { ...data, app });
    return unwrap(response);
  },

  duplicate: async (providerId: string, newId: string, app?: string, targetApp?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/providers/duplicate', { providerId, newId, app, targetApp });
    return unwrap(response);
  },

  speedtest: async (providerId: string, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/providers/speedtest', { providerId, app });
    return unwrap(response);
  },

  getKilocodeConfig: async (): Promise<string> => {
    const response = await api.get<ApiResponse<string>>('/providers/kilocode/config');
    return unwrap(response);
  },

  saveKilocodeConfig: async (content: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>('/providers/kilocode/config', { content });
    return unwrap(response);
  },
};

// ============================================
// Custom Tools API
// ============================================

export const customToolsApi = {
  list: async (): Promise<CustomToolListResponse> => {
    const response = await api.get<ApiResponse<CustomToolListResponse>>('/custom-tools');
    return unwrap(response);
  },

  get: async (id: string): Promise<CustomTool> => {
    const response = await api.get<ApiResponse<CustomTool>>(`/custom-tools/${id}`);
    return unwrap(response);
  },

  register: async (tool: RegisterToolRequest): Promise<RegisterToolResponse> => {
    const response = await api.post<ApiResponse<RegisterToolResponse>>('/custom-tools/register', tool);
    return unwrap(response);
  },

  run: async (id: string, args?: string[]): Promise<RunToolResult> => {
    const response = await api.post<ApiResponse<RunToolResult>>(`/custom-tools/${id}/run`, { args } as RunToolRequest);
    return unwrap(response);
  },

  delete: async (toolId: string): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/custom-tools/${toolId}`);
    return unwrap(response);
  },
};

// ============================================
// Profiles API
// ============================================

export const profilesApi = {
  list: async (): Promise<ProfileListResponse> => {
    const response = await api.get<ApiResponse<ProfileListResponse>>('/profiles');
    return unwrap(response);
  },

  save: async (request: SaveProfileRequest): Promise<SaveProfileResponse> => {
    const response = await api.post<ApiResponse<SaveProfileResponse>>('/profiles/save', request);
    return unwrap(response);
  },

  load: async (profileId: string): Promise<LoadProfileResponse> => {
    const response = await api.post<ApiResponse<LoadProfileResponse>>('/profiles/load', {
      profileId,
    } as LoadProfileRequest);
    return unwrap(response);
  },

  delete: async (profileId: string): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/profiles/${profileId}`);
    return unwrap(response);
  },
};

// ============================================
// Logs API
// ============================================

export const logsApi = {
  list: async (limit?: number, offset?: number): Promise<LogListResponse> => {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    const response = await api.get<ApiResponse<LogListResponse>>(`/logs?${params.toString()}`);
    return unwrap(response);
  },

  clear: async (): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>('/logs');
    return unwrap(response);
  },
};

// ============================================
// Settings API
// ============================================

export const settingsApi = {
  get: async (): Promise<SettingsResponse> => {
    const response = await api.get<ApiResponse<SettingsResponse>>('/settings');
    return unwrap(response);
  },

  update: async (settings: UpdateSettingsRequest): Promise<SettingsResponse> => {
    const response = await api.put<ApiResponse<SettingsResponse>>('/settings', settings);
    return unwrap(response);
  },
};

// ============================================
// MCP API
// ============================================

export const mcpApi = {
  list: async (app?: string): Promise<McpServerListResponse> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<McpServerListResponse>>(`/mcp?${params.toString()}`);
    return unwrap(response);
  },

  add: async (data: AddMcpServerRequest): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/mcp', data);
    return unwrap(response);
  },

  edit: async (data: EditMcpServerRequest): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/mcp/edit', data);
    return unwrap(response);
  },

  toggle: async (data: ToggleMcpServerRequest): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/mcp/toggle', data);
    return unwrap(response);
  },

  delete: async (serverId: string, app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.delete<ApiResponse<any>>(`/mcp/${serverId}?${params.toString()}`);
    return unwrap(response);
  },

  sync: async (app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.post<ApiResponse<any>>(`/mcp/sync?${params.toString()}`);
    return unwrap(response);
  },
};

// ============================================
// Prompts API
// ============================================

export const promptsApi = {
  list: async (app?: string): Promise<PromptListResponse> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<PromptListResponse>>(`/prompts?${params.toString()}`);
    return unwrap(response);
  },

  activate: async (promptId: string, app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.post<ApiResponse<any>>(`/prompts/${promptId}/activate?${params.toString()}`);
    return unwrap(response);
  },

  deactivate: async (app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.post<ApiResponse<any>>(`/prompts/deactivate?${params.toString()}`);
    return unwrap(response);
  },

  create: async (data: any): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/prompts/create', data);
    return unwrap(response);
  },

  edit: async (data: any): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/prompts/edit', data);
    return unwrap(response);
  },

  delete: async (promptId: string, app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.delete<ApiResponse<any>>(`/prompts/${promptId}?${params.toString()}`);
    return unwrap(response);
  },
};

// ============================================
// Skills API
// ============================================

export const skillsApi = {
  list: async (app?: string): Promise<SkillListResponse> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<SkillListResponse>>(`/skills?${params.toString()}`);
    return unwrap(response);
  },

  search: async (query: string): Promise<SkillListResponse> => {
    const response = await api.get<ApiResponse<SkillListResponse>>(`/skills/search?query=${encodeURIComponent(query)}`);
    return unwrap(response);
  },

  install: async (skillName: string, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/install', { skillName, app });
    return unwrap(response);
  },

  uninstall: async (skillName: string, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/uninstall', { skillName, app });
    return unwrap(response);
  },

  enable: async (skillName: string, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/enable', { skillName, app });
    return unwrap(response);
  },

  disable: async (skillName: string, app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/disable', { skillName, app });
    return unwrap(response);
  },

  listRepos: async (): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/skills/repos');
    return unwrap(response);
  },

  addRepo: async (repo: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/repos', { repo });
    return unwrap(response);
  },

  removeRepo: async (repo: string): Promise<any> => {
    const response = await api.delete<ApiResponse<any>>('/skills/repos', { data: { repo } });
    return unwrap(response);
  },

  discover: async (app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<any>>(`/skills/discover?${params.toString()}`);
    return unwrap(response);
  },

  sync: async (app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/sync', { app });
    return unwrap(response);
  },

  scanUnmanaged: async (app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<any>>(`/skills/scan-unmanaged?${params.toString()}`);
    return unwrap(response);
  },

  importFromApps: async (app?: string): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/import-from-apps', { app });
    return unwrap(response);
  },

  info: async (skillName: string, app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<any>>(`/skills/info/${skillName}?${params.toString()}`);
    return unwrap(response);
  },

  getSyncMethod: async (): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/skills/sync-method');
    return unwrap(response);
  },

  setSyncMethod: async (method: 'auto' | 'symlink' | 'copy'): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/skills/sync-method', { method });
    return unwrap(response);
  },
};

// ============================================
// Env API
// ============================================

export const envApi = {
  list: async (app?: string): Promise<EnvVarListResponse> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<EnvVarListResponse>>(`/env?${params.toString()}`);
    return unwrap(response);
  },
};

// ============================================
// Config API
// ============================================

export const configApi = {
  get: async (): Promise<any> => {
    const response = await api.get<ApiResponse<any>>('/config');
    return unwrap(response);
  },

  getPath: async (app?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.get<ApiResponse<any>>(`/config/path?${params.toString()}`);
    return unwrap(response);
  },

  export: async (request: ConfigExportRequest): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/config/export', request);
    return unwrap(response);
  },

  import: async (request: ConfigImportRequest): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/config/import', request);
    return unwrap(response);
  },

  backup: async (app?: string): Promise<ConfigBackupResponse> => {
    const params = new URLSearchParams();
    if (app) params.append('app', app);
    const response = await api.post<ApiResponse<ConfigBackupResponse>>(`/config/backup?${params.toString()}`);
    return unwrap(response);
  },

  restore: async (request: ConfigRestoreRequest): Promise<any> => {
    const response = await api.post<ApiResponse<any>>('/config/restore', request);
    return unwrap(response);
  },

  webdavShow: async (): Promise<{ success: boolean; message: string; output?: string }> => {
    const response = await api.get<ApiResponse<{ success: boolean; message: string; output?: string }>>(
      '/config/webdav'
    );
    return unwrap(response);
  },

  webdavCheckConnection: async (): Promise<{ success: boolean; message: string; output?: string }> => {
    const response = await api.post<
      ApiResponse<{ success: boolean; message: string; output?: string }>
    >('/config/webdav/check-connection');
    return unwrap(response);
  },

  webdavUpload: async (): Promise<{ success: boolean; message: string; output?: string }> => {
    const response = await api.post<
      ApiResponse<{ success: boolean; message: string; output?: string }>
    >('/config/webdav/upload');
    return unwrap(response);
  },

  webdavDownload: async (): Promise<{ success: boolean; message: string; output?: string }> => {
    const response = await api.post<
      ApiResponse<{ success: boolean; message: string; output?: string }>
    >('/config/webdav/download');
    return unwrap(response);
  },

  webdavSet: async (
    request: WebDavSetRequest
  ): Promise<{ success: boolean; message: string; output?: string }> => {
    const response = await api.post<
      ApiResponse<{ success: boolean; message: string; output?: string }>
    >('/config/webdav/set', request);
    return unwrap(response);
  },
};

export default api;
