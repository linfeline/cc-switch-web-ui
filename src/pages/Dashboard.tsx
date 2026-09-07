import { useEffect, useState } from 'react';
import { Server, Activity, Clock, CheckCircle } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { statusApi, healthApi, providersApi } from '../services/api';
import { useApp } from '../contexts/AppContext';
import type { StatusResponse, HealthResponse, Provider } from '../types';

export function Dashboard() {
  const { selectedApp } = useApp();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [statusRes, healthRes, providersRes] = await Promise.all([
        statusApi.get(),
        healthApi.check(),
        providersApi.list(selectedApp),
      ]);
      setStatus(statusRes);
      setHealth(healthRes);
      setProviders(providersRes.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedApp]);

  const handleSwitchProvider = async (providerId: string) => {
    try {
      await providersApi.switch(providerId, selectedApp);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to switch provider');
    }
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
      {/* Error message */}
      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Status cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Provider */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
              <Server className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Current Provider
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {status?.currentProvider?.name || 'None'}
              </p>
            </div>
          </div>
        </Card>

        {/* Health Status */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Activity className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                System Status
              </p>
              <StatusBadge
                status={health?.status === 'ok' ? 'success' : 'error'}
                label={health?.status === 'ok' ? 'Healthy' : 'Error'}
              />
            </div>
          </div>
        </Card>

        {/* Active Profile */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
              <CheckCircle className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Active Profile
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {status?.activeProfile?.name || 'None'}
              </p>
            </div>
          </div>
        </Card>

        {/* Last Switch */}
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Last Switch
              </p>
              <p className="font-semibold text-slate-900 dark:text-white">
                {status?.lastSwitchAt
                  ? new Date(status.lastSwitchAt).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader title="Quick Switch" subtitle="Switch to a different provider" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {providers.map((provider) => (
            <Button
              key={provider.id}
              variant={provider.isActive ? 'primary' : 'secondary'}
              onClick={() => !provider.isActive && handleSwitchProvider(provider.id)}
              disabled={provider.isActive}
              className="w-full"
            >
              {provider.isActive ? '✓ ' : ''}
              {provider.name}
            </Button>
          ))}
        </div>
      </Card>

      {/* System Info */}
      <Card>
        <CardHeader title="System Information" />
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Web UI Version</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {status?.version || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">cc-switch</span>
            <span className="font-medium text-slate-900 dark:text-white text-right">
              {health?.ccSwitchVersion || 'N/A'}
              {health?.ccSwitchPath ? (
                <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal break-all">
                  {health.ccSwitchPath}
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">DB / Schema</span>
            <span className="font-medium text-slate-900 dark:text-white text-right">
              user_version {health?.schemaVersion ?? 'N/A'}
              {health?.dbPath ? (
                <span className="block text-xs text-slate-500 dark:text-slate-400 font-normal break-all">
                  {health.dbPath}
                </span>
              ) : null}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Backend Mode</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {health?.backendMode || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-slate-200 dark:border-slate-700">
            <span className="text-slate-500 dark:text-slate-400">Uptime</span>
            <span className="font-medium text-slate-900 dark:text-white">
              {health?.uptime ? `${Math.floor(health.uptime / 60)} minutes` : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-slate-500 dark:text-slate-400">CC-Switch Available</span>
            <StatusBadge
              status={health?.ccSwitchAvailable ? 'success' : 'error'}
              label={health?.ccSwitchAvailable ? 'Yes' : 'No'}
            />
          </div>
          {health?.warnings && health.warnings.length > 0 && (
            <div className="pt-2">
              <p className="text-sm text-amber-600 dark:text-amber-400 mb-1">Capability warnings</p>
              <ul className="text-xs text-slate-600 dark:text-slate-400 list-disc pl-4 space-y-1">
                {health.warnings.slice(0, 6).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
