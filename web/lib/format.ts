/** Vietnamese number formats: decimal comma, dot for thousands. */

const decimals = (min: number, max: number) =>
  new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })

/** 0.38 -> "0,38" */
export function formatScore(value: number | null | undefined): string {
  return typeof value === "number" ? decimals(2, 2).format(value) : "—"
}

/** 2246 -> "2,2 giây" */
export function formatSeconds(ms: number | null | undefined): string {
  return typeof ms === "number"
    ? `${decimals(1, 1).format(ms / 1000)} giây`
    : "—"
}

/** 0.0005031 -> "0,0005 USD" */
export function formatUsd(value: number | null | undefined): string {
  return typeof value === "number" ? `${decimals(4, 4).format(value)} USD` : "—"
}

/** 0.25 -> "25%" */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value)
}
