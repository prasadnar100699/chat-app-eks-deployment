import test from "node:test";
import assert from "node:assert/strict";
import { getCorsOrigins, isCookieSecure } from "../src/lib/deployment-config.js";

test("parses configured CORS origins and removes whitespace and empty entries", () => {
  const previous = process.env.CORS_ORIGIN;
  process.env.CORS_ORIGIN = "https://chat.example.com, http://localhost:5173, ";

  try {
    assert.deepEqual(getCorsOrigins(), [
      "https://chat.example.com",
      "http://localhost:5173",
    ]);
  } finally {
    if (previous === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous;
  }
});

test("uses a restrictive production CORS default and allows explicit HTTP cookie staging", () => {
  const previous = {
    corsOrigin: process.env.CORS_ORIGIN,
    nodeEnv: process.env.NODE_ENV,
    cookieSecure: process.env.COOKIE_SECURE,
  };
  delete process.env.CORS_ORIGIN;
  process.env.NODE_ENV = "production";
  process.env.COOKIE_SECURE = "false";

  try {
    assert.deepEqual(getCorsOrigins(), []);
    assert.equal(isCookieSecure(), false);
  } finally {
    if (previous.corsOrigin === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = previous.corsOrigin;
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.cookieSecure === undefined) delete process.env.COOKIE_SECURE;
    else process.env.COOKIE_SECURE = previous.cookieSecure;
  }
});
