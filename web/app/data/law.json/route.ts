import { getArticles } from "@/lib/data"

// Built once into a static file: the full Labor Code (~0,34 MB) for a results.json the
// user opens in the browser, whose citations can name any article.
export const dynamic = "force-static"

export async function GET() {
  return Response.json(await getArticles())
}
