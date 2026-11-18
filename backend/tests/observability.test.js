import test from "node:test";
import assert from "node:assert/strict";
import {
  recordHttpRequest,
  renderPrometheusMetrics,
  resetMetricsForTests,
  normalizeRoute,
  beginRequest,
  finishRequest,
  getMetricsSnapshot,
  setActiveSocketConnections,
} from "../src/observability/metrics.js";

test("normalizes registered Express route paths without including IDs", () => {
  assert.equal(normalizeRoute({
    baseUrl: "/api/messages",
    route: { path: "/:id" },
  }), "/api/messages/:id");
});

test("records request counters and latency histogram buckets", () => {
  resetMetricsForTests();
  recordHttpRequest({
    method: "GET",
    route: "/api/messages/:id",
    statusCode: 200,
    durationSeconds: 0.08,
  });
  recordHttpRequest({
    method: "GET",
    route: "/api/messages/:id",
    statusCode: 500,
    durationSeconds: 0.4,
  });

  const output = renderPrometheusMetrics();
  assert.match(output, /chatapp_http_requests_total\{method="GET",route="\/api\/messages\/:id",status="200"\} 1/);
  assert.match(output, /chatapp_http_requests_total\{method="GET",route="\/api\/messages\/:id",status="500"\} 1/);
  assert.match(output, /chatapp_http_request_duration_seconds_count\{method="GET",route="\/api\/messages\/:id"\} 2/);
});

test("tracks in-flight requests and socket connection gauge", () => {
  resetMetricsForTests();
  beginRequest();
  setActiveSocketConnections(3);
  assert.deepEqual(getMetricsSnapshot(), {
    requestCount: 0,
    inFlightRequests: 1,
    activeSocketConnections: 3,
    histogramCount: 0,
  });
  finishRequest();
  assert.equal(getMetricsSnapshot().inFlightRequests, 0);
});

test("clamps in-flight and socket counts to zero", () => {
  resetMetricsForTests();
  finishRequest();
  setActiveSocketConnections(-5);
  assert.equal(getMetricsSnapshot().inFlightRequests, 0);
  assert.equal(getMetricsSnapshot().activeSocketConnections, 0);
});
