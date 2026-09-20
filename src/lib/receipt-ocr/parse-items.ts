import { RECEIPT_DICTIONARIES } from './dictionaries'
import { normalizeReceiptAmount } from './parse-total'
import { ReceiptOcrLine } from './types'

export type ReceiptItem = {
  name: string
  price: string
}

export type ParseReceiptItemsOptions = {
  lines?: ReceiptOcrLine[]
  expectedTotal?: string | null
}

const amountAtEnd =
  /(-?\d(?:[\d .,'’]*\d)?)\s*(?:EUR|USD|GBP|CHF|HRK|BAM|RSD|€|\$|£)?(?:\s+[A-Z])?\s*$/u

const administrativeLine =
  /(?:\bgrand\s*total\b|\bsub\s*total\b|\b(?:invoice|receipt|rechnung|beleg|racun|račun|facture|fattura|factura|ticket|order|bestellung|cashier|kasse|bedienung|operator|server|table|tisch|tel|phone|fax|www|https?|email|date|datum|zeit|time|transaction|transaktion|filiale|store|market|markt|supermarket|gmbh|sarl|srl|tax id|vat id|ust-?id|items?|artikel|qty|quantity|menge|service|charge|tip|trinkgeld|payment|zahlung|paid|tendered|change|changed|ruckgeld|rueckgeld|kembalian|kembali|discount|diskon|pajak|net sales|dpp|pb-?1|p\.rest|svc chg|other)\b|@|\.(?:com|net|org|de|fr|it|es)\b)/iu

const paymentLine =
  /\b(?:bar|cash|karte|card|visa|mastercard|maestro|amex|ec|girocard|credit|debit|bon|coupon|gutschein)\b/iu

const discountLine =
  /\b(?:discount|rabatt|popust|sconto|remise|descuento|descompte|korting)\b/iu

const normalizeForComparison = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

const excludedTermPatterns = Array.from(
  new Set(
    Object.values(RECEIPT_DICTIONARIES).flatMap(
      ({ strongTotal, total, exclude }) =>
        [...strongTotal, ...total, ...exclude].map(normalizeForComparison),
    ),
  ),
).map(
  (term) =>
    new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`,
      'u',
    ),
)

const isExcluded = (line: string) => {
  const normalized = normalizeForComparison(line)
  return (
    administrativeLine.test(normalized) ||
    paymentLine.test(normalized) ||
    excludedTermPatterns.some((pattern) => pattern.test(normalized)) ||
    /\b(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}:\d{2}(?::\d{2})?)\b/u.test(
      line,
    ) ||
    /\b(?:\+?\d[\d ()/-]{6,})\b/u.test(line)
  )
}

type ItemCandidate = ReceiptItem & {
  x1: number | undefined
  confidence: number
}

function candidateFromLine(line: string, confidence = 100, x1?: number) {
  if (!line || confidence < 55) return null
  const match = line.match(amountAtEnd)
  if (!match || match.index === undefined) return null
  const price = normalizeReceiptAmount(match[1])
  if (!price) return null
  const isDiscount = discountLine.test(normalizeForComparison(line))
  if (isExcluded(line) && !isDiscount) return null
  if (isDiscount && !match[1].trim().startsWith('-')) return null
  const name = line
    .slice(0, match.index)
    .replace(/^\s*\d+(?:[.,]\d+)?\s*(?:[xX×]|@)\s*/, '')
    .replace(/^\s*\d+\s+(?=\p{L})/u, '')
    .replace(/[.:;\-–—\s]+$/g, '')
    .trim()
  if (
    name.length < 2 ||
    name.length > 200 ||
    !/\p{L}/u.test(name) ||
    /^\W*\d/u.test(name) ||
    /^(?:EUR|USD|GBP|CHF|HRK|BAM|RSD|RP|€|\$|£)\b/iu.test(name)
  )
    return null
  return { name, price, confidence, x1 } satisfies ItemCandidate
}

function mergeSplitItemLines(lines: SourceLine[]) {
  return lines.map((line, index) => {
    if (!/^\s*-?\d[\d .,'’]*(?:\s+[A-Z])?\s*$/u.test(line.text)) return line
    const previous = lines[index - 1]
    if (!previous || !/\p{L}/u.test(previous.text)) return line
    const verticalGap = line.y0 - previous.y1
    if (verticalGap < -4 || verticalGap > Math.max(24, previous.height * 1.5))
      return line
    return {
      ...line,
      text: `${previous.text} ${line.text}`,
      confidence: Math.min(previous.confidence, line.confidence),
    }
  })
}

function mergeVisualRows(lines: SourceLine[]) {
  const rows: SourceLine[][] = []
  for (const line of [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const center = (line.y0 + line.y1) / 2
    const row = rows.find((parts) => {
      const y0 = Math.min(...parts.map((part) => part.y0))
      const y1 = Math.max(...parts.map((part) => part.y1))
      const overlap = Math.min(y1, line.y1) - Math.max(y0, line.y0)
      const minHeight = Math.max(1, Math.min(y1 - y0, line.height))
      const rowCenter = (y0 + y1) / 2
      return (
        overlap / minHeight >= 0.45 ||
        Math.abs(center - rowCenter) <= minHeight * 0.35
      )
    })
    if (row) row.push(line)
    else rows.push([line])
  }

  return rows
    .map((parts) => {
      const ordered = [...parts].sort((a, b) => a.x0 - b.x0)
      const y0 = Math.min(...parts.map((part) => part.y0))
      const y1 = Math.max(...parts.map((part) => part.y1))
      const characterCount = parts.reduce(
        (sum, part) => sum + Math.max(1, part.text.length),
        0,
      )
      return {
        text: ordered.map((part) => part.text).join(' '),
        confidence:
          parts.reduce(
            (sum, part) =>
              sum + part.confidence * Math.max(1, part.text.length),
            0,
          ) / characterCount,
        x0: Math.min(...parts.map((part) => part.x0)),
        x1: Math.max(...parts.map((part) => part.x1 ?? 0)),
        y0,
        y1,
        height: y1 - y0,
      }
    })
    .sort((a, b) => a.y0 - b.y0)
}

type SourceLine = {
  text: string
  confidence: number
  x0: number
  x1: number | undefined
  y0: number
  y1: number
  height: number
}

/** Extract only product rows whose layout and sum are plausible. */
export type ParseReceiptItemsResult = {
  items: ReceiptItem[]
  reconciles: boolean
  expectedTotal: string | null
  actualTotal: string | null
}

export function parseReceiptItemsDetailed(
  text: string,
  options: ParseReceiptItemsOptions = {},
): ParseReceiptItemsResult {
  const sourceLines: SourceLine[] = options.lines?.length
    ? [...options.lines]
        .sort((a, b) => a.bbox.y0 - b.bbox.y0)
        .map((line) => ({
          text: line.text.replace(/\s+/g, ' ').trim(),
          confidence: line.confidence,
          x0: line.bbox.x0,
          x1: line.bbox.x1,
          y0: line.bbox.y0,
          y1: line.bbox.y1,
          height: line.bbox.y1 - line.bbox.y0,
        }))
    : text.split(/\r?\n/).map((line, index) => ({
        text: line.replace(/\s+/g, ' ').trim(),
        confidence: 100,
        x0: 0,
        x1: undefined,
        y0: index * 20,
        y1: index * 20 + 16,
        height: 16,
      }))

  let candidates = mergeSplitItemLines(
    options.lines?.length ? mergeVisualRows(sourceLines) : sourceLines,
  )
    .map(({ text: line, confidence, x1 }) =>
      candidateFromLine(line, confidence, x1),
    )
    .filter((candidate): candidate is ItemCandidate => candidate !== null)

  if (options.lines?.length && candidates.length > 1) {
    const rightEdges = candidates
      .map(({ x1 }) => x1)
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b)
    const median = rightEdges[Math.floor(rightEdges.length / 2)]
    const pageWidth = Math.max(...options.lines.map(({ bbox }) => bbox.x1), 1)
    candidates = candidates.filter(
      ({ x1 }) => x1 === undefined || Math.abs(x1 - median) <= pageWidth * 0.08,
    )
  }

  const items = candidates
    .map(({ name, price }) => ({ name, price }))
    .slice(0, 500)
  const expectedTotal = normalizeReceiptAmount(options.expectedTotal ?? '')
  const actual = items.length
    ? items.reduce((sum, item) => sum + Number(item.price), 0)
    : null
  const tolerance = expectedTotal
    ? Math.max(0.02, Number(expectedTotal) * 0.001)
    : 0
  const reconciles =
    actual !== null &&
    (!expectedTotal || Math.abs(actual - Number(expectedTotal)) <= tolerance)

  return {
    items,
    reconciles,
    expectedTotal,
    actualTotal: actual === null ? null : actual.toFixed(2),
  }
}

export function parseReceiptItems(
  text: string,
  options: ParseReceiptItemsOptions = {},
): ReceiptItem[] {
  const result = parseReceiptItemsDetailed(text, options)
  return result.reconciles ? result.items : []
}
