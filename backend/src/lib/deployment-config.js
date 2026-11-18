export function getCorsOrigins() {
  if (process.env.CORS_ORIGIN !== undefined) {
    return process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean);
  }

  return process.env.NODE_ENV === "production" ? [] : ["http://localhost:5173"];
}

export function isCookieSecure() {
  const configuredValue = process.env.COOKIE_SECURE?.toLowerCase();
  if (configuredValue === "true") return true;
  if (configuredValue === "false") return false;
  return process.env.NODE_ENV !== "development";
}
