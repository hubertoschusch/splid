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
  /(-?\d(?:[\d .,'’]*\d)?)\s*(?:EUR|USD|GBP|CHF|HRK|BAM|RSD|€|\$|£)?(?:\s+[A-Z])?\s*$/iu

const administrativeLine =
  /(?:\bgrand\s*total\b|\bsub\s*total\b|\b(?:invoice|receipt|rechnung|beleg|racun|račun|facture|fattura|factura|ticket|order|bestellung|cashier|kasse|bedienung|operator|server|table|tisch|tel|phone|fax|www|https?|email|date|datum|zeit|time|transaction|transaktion|filiale|store|market|markt|supermarket|gmbh|sarl|srl|tax id|vat id|ust-?id|items?|artikel|qty|quantity|menge|service|charge|tip|trinkgeld|payment|zahlung|paid|tendered|change|changed|ruckgeld|rueckgeld|kembalian|kembali|discount|diskon|pajak|net sales|dpp|pb-?1|p\.rest|svc chg|other)\b|@|\.(?:com|net|org|de|fr|it|es)\b)/iu

const paymentLine =
  /\b(?:bar|cash|karte|card|visa|mastercard|maestro|amex|ec|girocard|credit|debit|bon|coupon|gutschein)\b/iu

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
  if (!line || confidence < 55 || isExcluded(line)) return null
  const match = line.match(amountAtEnd)
  if (!match || match.index === undefined) return null
  const price = normalizeReceiptAmount(match[1])
  if (!price) return null
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

/** Extract only product rows whose layout and sum are plausible. */
export function parseReceiptItems(
  text: string,
  options: ParseReceiptItemsOptions = {},
): ReceiptItem[] {
  const sourceLines = options.lines?.length
    ? [...options.lines]
        .sort((a, b) => a.bbox.y0 - b.bbox.y0)
        .map((line) => ({
          text: line.text.replace(/\s+/g, ' ').trim(),
          confidence: line.confidence,
          x1: line.bbox.x1,
        }))
    : text.split(/\r?\n/).map((line) => ({
        text: line.replace(/\s+/g, ' ').trim(),
        confidence: 100,
        x1: undefined,
      }))

  let candidates = sourceLines
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

  const expectedTotal = normalizeReceiptAmount(options.expectedTotal ?? '')
  if (expectedTotal && candidates.length) {
    const expected = Number(expectedTotal)
    const actual = candidates.reduce(
      (sum, candidate) => sum + Number(candidate.price),
      0,
    )
    const tolerance = Math.max(0.02, expected * 0.001)
    if (Math.abs(actual - expected) > tolerance) return []
  }

  return candidates.map(({ name, price }) => ({ name, price })).slice(0, 500)
}
