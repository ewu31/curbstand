import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"
import { actorFromDemoHeader } from "../seed"
import { createDemoController } from "./state"

type DemoController = ReturnType<typeof createDemoController>

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const text = Buffer.concat(chunks).toString("utf8").trim()
  if (!text) return null
  return JSON.parse(text) as unknown
}

function mount(demo: DemoController, ready: Promise<void>) {
  return (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
    void (async () => {
      try {
        await ready
        const url = new URL(request.url ?? "/", "http://127.0.0.1")
        if (!url.pathname.startsWith("/api/")) {
          next()
          return
        }
        let body: unknown = null
        if (request.method !== "GET" && request.method !== "HEAD") {
          try {
            body = await readBody(request)
          } catch {
            response.statusCode = 400
            response.setHeader("content-type", "application/json")
            response.end(JSON.stringify({ error: { code: "bad_request", message: "Request body must be JSON." } }))
            return
          }
        }
        const result = await demo.api({
          method: request.method ?? "GET",
          path: url.pathname.slice("/api".length) || "/",
          query: url.searchParams,
          body,
          actor: actorFromDemoHeader(request.headers["x-demo-user"]),
        })
        response.statusCode = result.status
        response.setHeader("content-type", "application/json")
        response.end(JSON.stringify(result.body))
      } catch {
        if (!response.headersSent) {
          response.statusCode = 500
          response.setHeader("content-type", "application/json")
          response.end(JSON.stringify({ error: { code: "internal", message: "Request failed." } }))
        }
      }
    })()
  }
}

export function fulfillmentApi(): Plugin {
  const demo = createDemoController()
  const ready = demo.seedScenario("ready_for_pickup")
  return {
    name: "fulfillment-api",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(mount(demo, ready))
    },
    configurePreviewServer(server) {
      server.middlewares.use(mount(demo, ready))
    },
  }
}
