# Hono + HyperDX Tracing & Logging POC

A proof of concept demonstrating how to integrate **Pino** logging and **HyperDX** tracing in a Hono application.

## Overview

This POC shows how to:
- Set up automatic request tracing with OpenTelemetry
- Integrate Pino logger with HyperDX
- Automatically inject trace context (`trace_id`, `span_id`, `trace_flags`) into all logs
- Correlate logs with traces in HyperDX dashboard

## Features

- ✅ **Automatic request tracing** - Each HTTP request gets a span
- ✅ **Structured logging** - Pino logger with trace context auto-injected
- ✅ **Global logger** - Import and use logger from anywhere
- ✅ **Trace correlation** - All logs include trace context automatically

## Setup

1. Install dependencies:
```sh
bun install
```

2. Create `.env` file:
```env
HYPERDX_API_KEY=your-api-key-here
HYPERDX_SERVICE=hono-hyperdx-poc
```

3. Run the server:
```sh
bun run dev
```

4. Test endpoints:
- `GET http://localhost:3000` - Simple logging example
- `POST http://localhost:3000` - Create post with external API call

## How It Works

### Architecture

```
Request → Middleware (creates span) → Handler → Logger (reads active span)
                                              ↓
                                    Logs with trace context
```

### 1. Logger Setup (`src/lib/logger.ts`)

The logger uses a **mixin function** that automatically reads from OpenTelemetry's active context:

```typescript
mixin() {
  const span = trace.getSpan(context.active());
  const sc = span?.spanContext();
  return {
    trace_id: sc.traceId,
    span_id: sc.spanId,
    trace_flags: `0${(sc.traceFlags ?? 0).toString(16)}`,
  };
}
```

This mixin is called on every log, automatically injecting trace context without manual passing.

### 2. Tracing Middleware (`src/index.ts`)

The middleware creates a span for each request, making trace context available:

```typescript
app.use("*", async (c, next) => {
  return tracer.startActiveSpan(`${c.req.method} ${c.req.path}`, async (span) => {
    // All logs here will have trace context
    const result = await next();
    span.setStatus({ code: 1 });
    return result;
  });
});
```

### 3. Log Format

Every log automatically includes trace context:

```
[10:01:21] INFO: Post created
    trace_id: "20d03309c6d332bbedd41417394df824"
    span_id: "1fba4d5dbb9fa624"
    trace_flags: "01"
    data: {
      "responseData": {
        "id": 101
      }
    }
    tag: "create-post-response"
```

## Usage

### Basic Logging

```typescript
import { logger } from "./lib/logger";

logger.info("Operation started", {
  data: { userId: 123 },
  tag: "operation-start"
});
```

### Creating Child Spans

```typescript
import { logger, getTracer } from "./lib/logger";

const tracer = getTracer();

tracer.startActiveSpan("external-api-call", async (span) => {
  // All logs here share the same trace_id
  logger.info("Calling external API");
  // ... your code
  span.end();
});
```

## Key Concepts

- **Spans** are created manually (via middleware or `tracer.startActiveSpan()`)
- **Trace context** is automatically injected into logs via the mixin
- **No manual passing** of trace IDs needed - it's all automatic
- **Global logger** - same instance used throughout the app

## Dependencies

- `@hyperdx/node-opentelemetry` - OpenTelemetry setup for HyperDX
- `@hyperdx/node-logger` - Pino transport for HyperDX
- `pino` - Fast JSON logger
- `pino-pretty` - Pretty console output
- `@opentelemetry/api` - OpenTelemetry API

## Notes

- The mixin **reads** from active spans, it doesn't create them
- Spans must be created before logging (via middleware or manually)
- All logs within an active span automatically get trace context
- Logs are sent to both console (pino-pretty) and HyperDX dashboard
