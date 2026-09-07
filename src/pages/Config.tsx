import { useState, useEffect } from 'react';
import { 
  Save, 
  Upload, 
  Download, 
  FileJson, 
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { Button } from '../components/Button';
import { configApi } from '../services/api';
import { useApp } from '../contexts/AppContext';

export function Config() {
  const { selectedApp } = useApp();
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const [exportPath, setExportPath] = useState('');
  const [importPath, setImportPath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [restorePath, setRestorePath] = useState('');

  const [webdavOutput, setWebdavOutput] = useState<string>('');
  const [webdavBusy, setWebdavBusy] = useState<string | null>(null);
  const [webdavForm, setWebdavForm] = useState({
    baseUrl: '',
    remoteRoot: '',
    username: '',
    password: '',
    profile: 'default',
    enable: true,
    autoSync: false,
  });

  useEffect(() => {
    fetchConfigPath();
  }, [selectedApp]);

  const fetchConfigPath = async () => {
    try {
      const response = await configApi.getPath(selectedApp);
      setConfigPath(response.path);
    } catch (err) {
      console.error('Failed to fetch config path', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportPath) return;

    setIsExporting(true);
    setMessage(null);
    try {
      await configApi.export({ outputPath: exportPath, app: selectedApp });
      setMessage({ type: 'success', text: `Configuration exported to ${exportPath}` });
      setExportPath('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to export configuration' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importPath) return;

    if (!confirm('Importing configuration will overwrite current settings. Continue?')) {
      return;
    }

    setIsImporting(true);
    setMessage(null);
    try {
      await configApi.import({ inputPath: importPath, app: selectedApp });
      setMessage({ type: 'success', text: `Configuration imported from ${importPath}` });
      setImportPath('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to import configuration' });
    } finally {
      setIsImporting(false);
    }
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    setMessage(null);
    try {
      const response = await configApi.backup(selectedApp);
      const path = response.backupPath || 'default location';
      setMessage({ type: 'success', text: `Configuration backed up to ${path}` });
      setBackupPath(path);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to backup configuration' });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restorePath) return;

    if (!confirm('Restoring configuration will overwrite current settings. Continue?')) {
      return;
    }

    setIsRestoring(true);
    setMessage(null);
    try {
      await configApi.restore({ backupPath: restorePath, app: selectedApp });
      setMessage({ type: 'success', text: `Configuration restored from ${restorePath}` });
      setRestorePath('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to restore configuration' });
    } finally {
      setIsRestoring(false);
    }
  };

  const runWebDav = async (
    action: string,
    fn: () => Promise<{ message: string; output?: string }>
  ) => {
    setWebdavBusy(action);
    setMessage(null);
    try {
      const result = await fn();
      setWebdavOutput(result.output || result.message || '');
      setMessage({ type: 'success', text: result.message || `WebDAV ${action} OK` });
    } catch (err) {
      const text = err instanceof Error ? err.message : `WebDAV ${action} failed`;
      setWebdavOutput(text);
      setMessage({ type: 'error', text });
    } finally {
      setWebdavBusy(null);
    }
  };

  const handleWebDavSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webdavForm.baseUrl) {
      setMessage({ type: 'error', text: 'Base URL is required to set WebDAV settings' });
      return;
    }
    await runWebDav('set', () =>
      configApi.webdavSet({
        baseUrl: webdavForm.baseUrl,
        remoteRoot: webdavForm.remoteRoot || undefined,
        username: webdavForm.username || undefined,
        password: webdavForm.password || undefined,
        profile: webdavForm.profile || undefined,
        enable: webdavForm.enable,
        autoSync: webdavForm.autoSync,
      })
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Configuration
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage configuration file, backups, exports, and WebDAV sync
        </p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg border flex items-start gap-3 ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' 
            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      {/* Config Path */}
      {configPath && (
        <div className="bg-slate-100 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              Configuration File Path
            </p>
            <code className="text-sm font-mono text-slate-700 dark:text-slate-300 break-all">
              {configPath}
            </code>
          </div>
          <FileJson className="w-8 h-8 text-slate-400" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Config */}
        <Card>
          <CardHeader 
            title="Export Configuration" 
            subtitle="Save your current configuration to a file"
            action={<Download className="w-5 h-5 text-slate-400" />}
          />
          <form onSubmit={handleExport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Output Path
              </label>
              <input
                type="text"
                value={exportPath}
                onChange={(e) => setExportPath(e.target.value)}
                placeholder="/path/to/config-export.json"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full"
              disabled={!exportPath || isExporting}
            >
              {isExporting ? 'Exporting...' : 'Export Config'}
            </Button>
          </form>
        </Card>

        {/* Import Config */}
        <Card>
          <CardHeader 
            title="Import Configuration" 
            subtitle="Load configuration from a file"
            action={<Upload className="w-5 h-5 text-slate-400" />}
          />
          <form onSubmit={handleImport} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Input Path
              </label>
              <input
                type="text"
                value={importPath}
                onChange={(e) => setImportPath(e.target.value)}
                placeholder="/path/to/config-import.json"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              />
            </div>
            <Button 
              type="submit" 
              variant="secondary"
              className="w-full"
              disabled={!importPath || isImporting}
            >
              {isImporting ? 'Importing...' : 'Import Config'}
            </Button>
          </form>
        </Card>

        {/* Backup Config */}
        <Card>
          <CardHeader 
            title="Backup Configuration" 
            subtitle="Create a quick backup of your current settings"
            action={<Save className="w-5 h-5 text-slate-400" />}
          />
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Creates a timestamped backup of your current configuration file in the same directory.
            </p>
            {backupPath && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 mb-1">Last backup created at:</p>
                <code className="text-xs break-all">{backupPath}</code>
              </div>
            )}
            <Button 
              onClick={handleBackup} 
              className="w-full"
              disabled={isBackingUp}
            >
              {isBackingUp ? 'Backing up...' : 'Create Backup'}
            </Button>
          </div>
        </Card>

        {/* Restore Config */}
        <Card>
          <CardHeader 
            title="Restore Configuration" 
            subtitle="Restore settings from a backup file"
            action={<RotateCcw className="w-5 h-5 text-slate-400" />}
          />
          <form onSubmit={handleRestore} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Backup File Path
              </label>
              <input
                type="text"
                value={restorePath}
                onChange={(e) => setRestorePath(e.target.value)}
                placeholder="/path/to/backup-file.json"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
              />
            </div>
            <Button 
              type="submit" 
              variant="danger"
              className="w-full"
              disabled={!restorePath || isRestoring}
            >
              {isRestoring ? 'Restoring...' : 'Restore Config'}
            </Button>
          </form>
        </Card>
      </div>

      {/* WebDAV — CLI-backed only */}
      <Card>
        <CardHeader
          title="WebDAV Sync"
          subtitle="Uses cc-switch config webdav (show / set / check-connection / upload / download)"
          action={<Cloud className="w-5 h-5 text-slate-400" />}
        />
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!!webdavBusy}
              onClick={() => runWebDav('show', () => configApi.webdavShow())}
            >
              {webdavBusy === 'show' ? 'Loading...' : 'Show / Status'}
            </Button>
            <Button
              variant="secondary"
              disabled={!!webdavBusy}
              onClick={() => runWebDav('check', () => configApi.webdavCheckConnection())}
            >
              {webdavBusy === 'check' ? 'Checking...' : 'Check Connection'}
            </Button>
            <Button
              disabled={!!webdavBusy}
              onClick={() => runWebDav('upload', () => configApi.webdavUpload())}
            >
              {webdavBusy === 'upload' ? 'Uploading...' : 'Upload'}
            </Button>
            <Button
              variant="danger"
              disabled={!!webdavBusy}
              onClick={() => {
                if (!confirm('Download will overwrite local snapshot from remote WebDAV. Continue?')) {
                  return;
                }
                return runWebDav('download', () => configApi.webdavDownload());
              }}
            >
              {webdavBusy === 'download' ? 'Downloading...' : 'Download'}
            </Button>
            <Button
              variant="secondary"
              disabled={!!webdavBusy}
              onClick={() => runWebDav('show', () => configApi.webdavShow())}
              title="Refresh status"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {webdavOutput && (
            <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 max-h-64 overflow-auto">
              {webdavOutput}
            </pre>
          )}

          <form onSubmit={handleWebDavSet} className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-200 dark:border-slate-700">
            <div className="md:col-span-2">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Set / update via non-interactive CLI flags (`config webdav set`). Does not write settings files or SQLite directly.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Base URL</label>
              <input
                type="text"
                value={webdavForm.baseUrl}
                onChange={(e) => setWebdavForm({ ...webdavForm, baseUrl: e.target.value })}
                placeholder="https://dav.example.com/remote.php/dav"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Remote Root</label>
              <input
                type="text"
                value={webdavForm.remoteRoot}
                onChange={(e) => setWebdavForm({ ...webdavForm, remoteRoot: e.target.value })}
                placeholder="/cc-switch"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Username</label>
              <input
                type="text"
                value={webdavForm.username}
                onChange={(e) => setWebdavForm({ ...webdavForm, username: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
              <input
                type="password"
                value={webdavForm.password}
                onChange={(e) => setWebdavForm({ ...webdavForm, password: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Profile</label>
              <input
                type="text"
                value={webdavForm.profile}
                onChange={(e) => setWebdavForm({ ...webdavForm, profile: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-6 pt-6">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={webdavForm.enable}
                  onChange={(e) => setWebdavForm({ ...webdavForm, enable: e.target.checked })}
                />
                Enable
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={webdavForm.autoSync}
                  onChange={(e) => setWebdavForm({ ...webdavForm, autoSync: e.target.checked })}
                />
                Auto sync
              </label>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" className="w-full md:w-auto" disabled={!!webdavBusy || !webdavForm.baseUrl}>
                {webdavBusy === 'set' ? 'Saving...' : 'Save WebDAV Settings'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}
