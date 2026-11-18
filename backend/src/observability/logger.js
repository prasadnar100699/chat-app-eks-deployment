function emit(level, message, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: process.env.SERVICE_NAME || "chatapp-backend",
    environment: process.env.NODE_ENV || "development",
    message,
    ...fields,
  };
  const serialized = JSON.stringify(record);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  info: (message, fields) => emit("info", message, fields),
  warn: (message, fields) => emit("warn", message, fields),
  error: (message, fields) => emit("error", message, fields),
};

export function serializeError(error) {
  if (!error) return undefined;
  return {
    name: error.name || "Error",
    message: error.message || "Unknown error",
    stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
  };
}
