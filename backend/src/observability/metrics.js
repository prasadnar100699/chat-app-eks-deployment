import os from "node:os";

const HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const requestCounters = new Map();
const durationHistograms = new Map();
let inFlightRequests = 0;
let activeSocketConnections = 0;
const startedAt = Date.now();

function keyFor(labels) {
  return JSON.stringify(labels);
}

function escapeLabel(value) {
  return String(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll('"', '\\"');
}

function labelsToPrometheus(labels) {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return `{${entries.map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",")}}`;
}

export function normalizeRoute(req) {
  const routePath = req.route?.path;
  if (!routePath) return "unmatched";
  const base = req.baseUrl || "";
  const route = Array.isArray(routePath) ? routePath[0] : routePath;
  return `${base}${route}` || "/";
}

export function recordHttpRequest({ method, route, statusCode, durationSeconds }) {
  const labels = {
    method: String(method || "UNKNOWN").toUpperCase(),
    route: route || "unmatched",
    status: String(statusCode || 0),
  };
  const key = keyFor(labels);
  requestCounters.set(key, {
    labels,
    value: (requestCounters.get(key)?.value || 0) + 1,
  });

  const histogramLabels = { method: labels.method, route: labels.route };
  const histogramKey = keyFor(histogramLabels);
  let histogram = durationHistograms.get(histogramKey);
  if (!histogram) {
    histogram = {
      labels: histogramLabels,
      count: 0,
      sum: 0,
      buckets: new Map(HTTP_BUCKETS.map((bucket) => [bucket, 0])),
    };
    durationHistograms.set(histogramKey, histogram);
  }

  histogram.count += 1;
  histogram.sum += durationSeconds;
  for (const bucket of HTTP_BUCKETS) {
    if (durationSeconds <= bucket) histogram.buckets.set(bucket, histogram.buckets.get(bucket) + 1);
  }
}

export function beginRequest() {
  inFlightRequests += 1;
}

export function finishRequest() {
  inFlightRequests = Math.max(0, inFlightRequests - 1);
}

export function setActiveSocketConnections(value) {
  activeSocketConnections = Math.max(0, Number(value) || 0);
}

export function getMetricsSnapshot() {
  return {
    requestCount: [...requestCounters.values()].reduce((sum, item) => sum + item.value, 0),
    inFlightRequests,
    activeSocketConnections,
    histogramCount: [...durationHistograms.values()].reduce((sum, item) => sum + item.count, 0),
  };
}

export function renderPrometheusMetrics() {
  const lines = [
    "# HELP chatapp_http_requests_total Total HTTP requests handled by the application.",
    "# TYPE chatapp_http_requests_total counter",
  ];

  for (const item of requestCounters.values()) {
    lines.push(`chatapp_http_requests_total${labelsToPrometheus(item.labels)} ${item.value}`);
  }

  lines.push(
    "# HELP chatapp_http_request_duration_seconds HTTP response duration in seconds.",
    "# TYPE chatapp_http_request_duration_seconds histogram",
  );

  for (const histogram of durationHistograms.values()) {
    for (const bucket of HTTP_BUCKETS) {
      lines.push(
        `chatapp_http_request_duration_seconds_bucket${labelsToPrometheus({
          ...histogram.labels,
          le: String(bucket),
        })} ${histogram.buckets.get(bucket)}`,
      );
    }
    lines.push(
      `chatapp_http_request_duration_seconds_bucket${labelsToPrometheus({
        ...histogram.labels,
        le: "+Inf",
      })} ${histogram.count}`,
    );
    lines.push(
      `chatapp_http_request_duration_seconds_sum${labelsToPrometheus(histogram.labels)} ${histogram.sum}`,
    );
    lines.push(
      `chatapp_http_request_duration_seconds_count${labelsToPrometheus(histogram.labels)} ${histogram.count}`,
    );
  }

  lines.push(
    "# HELP chatapp_http_requests_in_flight HTTP requests currently being processed.",
    "# TYPE chatapp_http_requests_in_flight gauge",
    `chatapp_http_requests_in_flight ${inFlightRequests}`,
    "# HELP chatapp_socket_connections Current Socket.IO connections.",
    "# TYPE chatapp_socket_connections gauge",
    `chatapp_socket_connections ${activeSocketConnections}`,
    "# HELP chatapp_process_uptime_seconds Application process uptime in seconds.",
    "# TYPE chatapp_process_uptime_seconds gauge",
    `chatapp_process_uptime_seconds ${Math.floor((Date.now() - startedAt) / 1000)}`,
    "# HELP chatapp_process_resident_memory_bytes Process resident memory in bytes.",
    "# TYPE chatapp_process_resident_memory_bytes gauge",
    `chatapp_process_resident_memory_bytes ${process.memoryUsage().rss}`,
    "# HELP chatapp_nodejs_heap_used_bytes Node.js heap used in bytes.",
    "# TYPE chatapp_nodejs_heap_used_bytes gauge",
    `chatapp_nodejs_heap_used_bytes ${process.memoryUsage().heapUsed}`,
    "# HELP chatapp_host_load1 Host one-minute load average.",
    "# TYPE chatapp_host_load1 gauge",
    `chatapp_host_load1 ${os.loadavg()[0]}`,
  );

  return `${lines.join("\n")}\n`;
}

export function resetMetricsForTests() {
  requestCounters.clear();
  durationHistograms.clear();
  inFlightRequests = 0;
  activeSocketConnections = 0;
}
