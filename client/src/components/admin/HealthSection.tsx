import { useState, useEffect } from 'react';
import { healthService } from '@/services';
import { SectionPanel } from '@/components/layout/SectionPanel';
import { Button } from '@/components/ui/Button';
import { JsonBlock } from '@/components/ui/JsonBlock';
import { OperationDescription } from '@/components/ui/OperationDescription';
import { Badge } from '@/components/ui/Badge';
import { getDoc } from '@/data/operationDocs';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function HealthSection() {
  const [serverStatus, setServerStatus] = useState<{ status: string; uptime: number; timestamp: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [authleteResult, setAuthleteResult] = useState<unknown>(null);
  const [authleteError, setAuthleteError] = useState<string | null>(null);
  const [extended, setExtended] = useState(false);
  const [loading, setLoading] = useState({ server: false, authlete: false });

  const doc = getDoc('health', 'health');
  const docAuthlete = getDoc('health', 'authlete');

  useEffect(() => {
    checkServer();
  }, []);

  async function checkServer() {
    setServerError(null);
    setLoading((s) => ({ ...s, server: true }));
    try {
      const res = await healthService.serverHealth();
      setServerStatus(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setServerError(msg);
      setServerStatus(null);
    } finally {
      setLoading((s) => ({ ...s, server: false }));
    }
  };

  const checkAuthlete = async () => {
    setAuthleteError(null);
    setAuthleteResult(null);
    setLoading((s) => ({ ...s, authlete: true }));
    try {
      const res = await healthService.authleteHealth(extended);
      setAuthleteResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Request failed';
      setAuthleteError(msg);
    } finally {
      setLoading((s) => ({ ...s, authlete: false }));
    }
  };

  const serverHealthy = serverStatus?.status === 'ok';

  return (
    <SectionPanel title="Health Check" description="Server and Authlete health monitoring">
      <div className="space-y-4">
        <div>
          {doc && <OperationDescription doc={doc} />}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={serverHealthy ? 'success' : serverError ? 'danger' : 'default'}>
              {serverHealthy ? 'OK' : serverError ? 'Error' : 'Unknown'}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {loading.server
                ? 'Checking...'
                : serverHealthy
                  ? `Server OK — up ${formatUptime(serverStatus!.uptime)}`
                  : serverError || 'Unknown'}
            </span>
            <Button size="sm" variant="ghost" onClick={checkServer} disabled={loading.server} loading={loading.server}>
              Refresh
            </Button>
          </div>
        </div>

        <hr className="border-border" />

        <div>
          {docAuthlete && <OperationDescription doc={docAuthlete} />}
          <label className="flex items-center gap-2 text-xs text-muted-foreground mb-2 cursor-pointer">
            <input type="checkbox" checked={extended} onChange={(e) => setExtended(e.target.checked)} className="rounded" />
            Extended check (test DB connectivity)
          </label>
          <Button size="sm" onClick={checkAuthlete} disabled={loading.authlete} loading={loading.authlete}>
            Check Authlete Health
          </Button>
        </div>

        {authleteError && <p className="text-xs text-red-400">{authleteError}</p>}

        {authleteResult ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={(authleteResult as { healthy: boolean }).healthy ? 'success' : 'danger'}>
                {(authleteResult as { healthy: boolean }).healthy ? 'Healthy' : 'Unhealthy'}
              </Badge>
              {(authleteResult as { statusCode?: number }).statusCode ? (
                <span className="text-xs text-muted-foreground">
                  HTTP {(authleteResult as { statusCode: number }).statusCode}
                </span>
              ) : null}
            </div>
            <JsonBlock data={authleteResult} label="Authlete Health" />
          </div>
        ) : null}
      </div>
    </SectionPanel>
  );
}

export { HealthSection };
