import type { NextConfig } from "next"

/**
 * Chat API (api/server.py, FastAPI). The backend has no CORS, so the browser calls the
 * relative /api/... and Next.js proxies it. Rewrites are read when the config loads: set
 * API_URL before `next dev`, and before `next build` for `next start`.
 */
const API_URL = (process.env.API_URL || "http://localhost:8000").replace(
  /\/+$/,
  ""
)

const nextConfig: NextConfig = {
  async rewrites() {
    // web/ has no route of its own under /api, so this shadows nothing.
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }]
  },
}

export default nextConfig
