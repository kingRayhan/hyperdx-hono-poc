import "dotenv/config";
import { Hono } from "hono";
import { logger, getTracer } from "./lib/logger";

const app = new Hono();
const tracer = getTracer();

// Middleware to automatically trace all requests
// This creates a span for each request, making trace context available to logs
app.use("*", async (c, next) => {
  return tracer.startActiveSpan(
    `${c.req.method} ${c.req.path}`,
    async (span) => {
      try {
        const result = await next();
        span.setStatus({ code: 1 }); // OK
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: 2, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    }
  );
});

app.get("/", async (c) => {
  logger.info("info log test 1!", {
    data: { message: "Hello Hono 1!" },
    tag: "hello-hono",
  });

  logger.error("error log test 1!", {
    data: { message: "Error Hono 1!" },
    tag: "error-hono",
  });

  return c.text("Hello Hono!");
});

export default app;
