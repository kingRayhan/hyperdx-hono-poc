import "dotenv/config";
import * as HyperDX from "@hyperdx/node-opentelemetry";
import { context, trace } from "@opentelemetry/api";
import * as pino from "pino";

export class AppLogger {
  private isInitialized = false;
  private pinoLogger!: pino.Logger;

  initialize() {
    if (this.isInitialized) {
      return;
    }

    const apiKey = process.env.HYPERDX_API_KEY;
    const service = process.env.HYPERDX_SERVICE;

    if (!apiKey || !service) {
      throw new Error("HYPERDX_API_KEY and HYPERDX_SERVICE must be set");
    }

    HyperDX.init({
      apiKey: apiKey,
      service: service,
    });

    const pinoTargets: any[] = [
      {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
          customColors: "info:blue,warn:yellow,error:red",
        },
      },
    ];

    if (apiKey) {
      pinoTargets.push({
        target: "@hyperdx/node-logger/build/src/pino",
        options: { apiKey: apiKey, service: service },
      });
    }

    this.pinoLogger = pino.pino(
      {
        /**
         * Mixin function: Called on every log to add trace context
         *
         * HOW IT WORKS:
         * 1. Reads from OpenTelemetry's active context (doesn't create spans)
         * 2. Extracts trace_id, span_id, trace_flags from active span
         * 3. Returns empty object if no active span exists
         *
         * WHERE SPANS COME FROM:
         * - Spans must be created manually (e.g., via middleware)
         * - Use tracer.startActiveSpan() to create a span
         * - The span becomes "active" in the context automatically
         * - This mixin then reads from that active span
         */
        mixin() {
          // Get the active span from OpenTelemetry context
          const span = trace.getSpan(context.active());
          if (!span) return {} as Record<string, unknown>;

          // Extract span context (contains traceId, spanId, traceFlags)
          const sc = span.spanContext();
          if (!sc) return {} as Record<string, unknown>;

          // Return trace context to be merged into log
          return {
            trace_id: sc.traceId, // Unique ID for entire trace
            span_id: sc.spanId, // Unique ID for this span
            trace_flags: `0${(sc.traceFlags ?? 0).toString(16)}`, // Trace flags (sampling, etc.)
          } as Record<string, unknown>;
        },
      },
      pino.transport({ targets: pinoTargets })
    );

    this.isInitialized = true;
  }

  createLog(
    level: "info" | "warn" | "error" | "debug" | "trace",
    message: string,
    options?: { data?: Record<string, any>; tag?: string }
  ) {
    const data = options?.data ?? {};
    const tag = options?.tag ?? "";
    this.pinoLogger[level]({ data, tag }, message);
  }

  info(
    message: string,
    options?: { data?: Record<string, any>; tag?: string }
  ) {
    this.createLog("info", message, options);
  }

  warn(
    message: string,
    options?: { data?: Record<string, any>; tag?: string }
  ) {
    this.createLog("warn", message, options);
  }

  error(
    message: string,
    options?: { data?: Record<string, any>; tag?: string }
  ) {
    this.createLog("error", message, options);
  }
}

// Global logger instance
let globalLogger: AppLogger | null = null;

export function getLogger(): AppLogger {
  if (!globalLogger) {
    globalLogger = new AppLogger();
    globalLogger.initialize();
  }
  return globalLogger;
}

// Export the logger instance for convenience
export const logger = getLogger();

// Helper to get the tracer for creating spans
export function getTracer(name: string = "hono-hyperdx-poc") {
  return trace.getTracer(name);
}
