# Monitoring

Prometheus + Grafana stack for collecting and visualizing metrics from the authorization server.

## Architecture

```
┌─────────────────┐     scrape /api/metrics     ┌──────────────┐      query      ┌────────┐
│  Express Server  │ ◄────────────────────────── │  Prometheus   │ ◄────────────── │ Grafana │
│  (port :3000)    │                             │  (port :9090) │                │ (:3002) │
└─────────────────┘                             └──────────────┘                └────────┘
```

## Quick Start

```bash
# Start Prometheus + Grafana alongside the server
docker compose -f docker-compose.yml up -d prometheus grafana
```

Verify:

```bash
# Prometheus targets page (check UP status)
open http://localhost:9090/targets

# Prometheus expression browser
open http://localhost:9090/graph

# Grafana login
open http://localhost:3002
# Default: admin / admin
```

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
3. Set URL to `http://prometheus:9090`, click **Save & test**
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
| `host.docker.internal` not resolving | Linux only: add `--add-host host.docker.internal:host-gateway` to docker run, or set `network_mode: "host"` |
| Grafana can't connect to Prometheus | Both are on the same Docker network; use `http://prometheus:9090` as URL |
| No metrics shown | Hit any endpoint first (`curl http://localhost:3000/api/health`) so the histogram has data |
