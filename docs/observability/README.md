# Observability

- `grafana-dashboard.json`: a starter dashboard for the metrics listed in `docs/API.md` (Metrics). In Grafana: Dashboards, New, Import, upload the file, and pick your Prometheus data source.
- Scrape config for Prometheus on the same Docker network as the backend:

```yaml
scrape_configs:
  - job_name: pyarena
    metrics_path: /metrics
    static_configs:
      - targets: ["backend:8000"]
    # Only if METRICS_TOKEN is set:
    authorization:
      type: Bearer
      credentials: "<METRICS_TOKEN>"
```

The dashboard JSON was written by hand against Grafana's dashboard schema (version 39) and checked to be valid JSON; it has not been imported into a running Grafana in this repository's test suite.
