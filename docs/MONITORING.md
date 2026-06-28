# Monitoring

Prometheus + Grafana stack for collecting and visualizing metrics from the authorization server.

## Architecture

```
┌─────────────────┐     scrape /api/metrics     ┌──────────────┐
│  Express Server  │ ◄────────────────────────── │  Prometheus   │
│  (port :3000)    │     localhost:3000          │  Network: host │
└─────────────────┘                             │  (port :9090)  │
                                                  └──────┬───────┘
                                                         │ query
                                                  ┌──────▼───────┐
                                                  │   Grafana    │
                                                  │  (:3002)     │
                                                  │ extra_hosts  │
                                                  └──────────────┘
```

**Network setup:**
- Prometheus uses `network_mode: "host"` — it sees your machine's `localhost` directly, so scraping `localhost:3000` works. The clickable links in the Prometheus targets page also work in your browser.
- Grafana uses bridge networking with port mapping. It reaches Prometheus via `host.docker.internal:9090` (configured when adding the Prometheus data source in Grafana).

## Quick Start

```bash
# Start Prometheus + Grafana alongside the server
docker compose up -d prometheus grafana

# Ensure the Express server is running
npm --prefix server run dev
```

Verify:

```bash
# Prometheus targets page (check UP status)
open http://localhost:9090/targets
# Targets should show "UP" for localhost:3000
# If you click the endpoint link, it will open in your browser correctly

# Prometheus expression browser
open http://localhost:9090/graph

# Grafana login
open http://localhost:3002
# Default: admin / admin
```

> **Note:** If you see "Server Not Found" when clicking an endpoint link in the
> Prometheus targets page, it means you are using the old `host.docker.internal`
> setup. Update to the `network_mode: "host"` configuration in `docker-compose.yml`
> and restart: `docker compose up -d prometheus`.

## What Gets Collected

### HTTP Metrics (per endpoint)

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status` | Request latency in 8 buckets (10ms–5s) |
| `http_requests_total` | Counter | `method`, `route`, `status` | Cumulative request count |

### Default Node.js Metrics

Collected automatically by `prom-client`'s `collectDefaultMetrics`:

- `process_cpu_seconds_total` — CPU usage
- `process_resident_memory_bytes` — RSS memory
- `nodejs_eventloop_lag_seconds` — Event loop delay
- `nodejs_heap_size_used_bytes` — Heap usage
- `nodejs_gc_duration_seconds` — Garbage collection duration
- `nodejs_active_handles` / `nodejs_active_requests`
- And ~30 more

## Useful PromQL Queries

Paste these into the Prometheus expression browser (`http://localhost:9090/graph`).

```promql
# Request rate per route (last 5m)
rate(http_requests_total[5m])

# P95 latency per route
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))

# Error rate (5xx)
rate(http_requests_total{status=~"5.."}[5m])

# Top 5 slowest endpoints
topk(5, avg(http_request_duration_seconds_sum[5m]) / avg(http_request_duration_seconds_count[5m]))

# Memory usage over time
process_resident_memory_bytes

# Event loop lag
nodejs_eventloop_lag_seconds
```

## Grafana Setup

1. Open `http://localhost:3002`, log in as `admin` / `admin`
2. Go to **Connections → Add data source → Prometheus**
3. Set URL to `http://host.docker.internal:9090`, click **Save & test**
4. Go to **Dashboards → Import**, paste dashboard ID `14568` (Node.js Exporter), click **Load**
5. Replace the data source with your Prometheus one

### Quick Test Dashboard

Or create a simple panel manually:
- **Query**: `rate(http_requests_total[5m])`
- **Legend**: `{{route}} — {{method}} — {{status}}`
- **Visualization**: Time series

## Architecture Details

- Metrics middleware (`server/src/middleware/metrics.ts`) attaches a timer to every request and records on `res.finish`
- Labels use the Express route pattern (e.g. `/api/token`, `/api/authorization`), not the raw URL path
- Unmatched routes fall back to `req.path`
- The endpoint is registered at **both** `/metrics` (Prometheus convention) and `/api/metrics` (project convention)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Prometheus target shows `DOWN` | Ensure the Express server is running on `:3000` |
| Grafana can't connect to Prometheus | Use `http://host.docker.internal:9090` as the Prometheus URL in Grafana (Prometheus uses host networking, so Grafana reaches it via the host's IP) |
| No metrics shown | Hit any endpoint first (`curl http://localhost:3000/api/health`) so the histogram has data |
| Prometheus can't start (port in use) | The `network_mode: "host"` binds Prometheus directly to host ports. If port 9090 is taken, stop the other process or change Prometheus's `--web.listen-address` flag |
