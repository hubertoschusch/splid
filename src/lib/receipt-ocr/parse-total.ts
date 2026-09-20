import { RECEIPT_DICTIONARIES } from './dictionaries'
import { ReceiptOcrLanguageCode } from './types'

export type ReceiptAmountCandidate = {
  amount: string
  currency: string | null
  raw: string
  line: string
  score: number
  confidence: 'high' | 'medium' | 'low'
}

export type ReceiptTotalResult = {
  best: ReceiptAmountCandidate | null
  candidates: ReceiptAmountCandidate[]
}

const amountPattern =
  /(?:(EUR|USD|GBP|CHF|HRK|BAM|RSD|€|\$|£)\s*)?(-?\d{1,3}(?:[ .,'’]\d{3})*(?:[.,]\d{1,2})|-?\d+(?:[.,]\d{1,2})?)(?:\s*(EUR|USD|GBP|CHF|HRK|BAM|RSD|€|\$|£))?/giu

const normalizeForComparison = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

export function normalizeReceiptAmount(raw: string): string | null {
  const compact = raw.replace(/[\s'’]/g, '')
  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  const decimalIndex = Math.max(lastComma, lastDot)
  let normalized: string

  if (decimalIndex >= 0 && compact.length - decimalIndex - 1 <= 2) {
    normalized = `${compact.slice(0, decimalIndex).replace(/[.,]/g, '')}.${compact.slice(decimalIndex + 1)}`
  } else {
    normalized = compact.replace(/[.,]/g, '')
  }

  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) return null
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10_000_000)
    return null
  return amount.toFixed(
    normalized.includes('.') ? normalized.split('.')[1].length : 0,
  )
}

export function parseReceiptTotal(
  text: string,
  languages: ReceiptOcrLanguageCode[],
): ReceiptTotalResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const dictionaries = languages.map(
    (language) => RECEIPT_DICTIONARIES[language],
  )
  const candidates: ReceiptAmountCandidate[] = []

  lines.forEach((line, lineIndex) => {
    const normalizedLine = normalizeForComparison(line)
    const previousLine = normalizeForComparison(lines[lineIndex - 1] ?? '')
    const context = `${previousLine} ${normalizedLine}`
    const strongTotal = dictionaries.some(({ strongTotal }) =>
      strongTotal.some((term) =>
        context.includes(normalizeForComparison(term)),
      ),
    )
    const total = dictionaries.some(({ total }) =>
      total.some((term) => context.includes(normalizeForComparison(term))),
    )
    const excluded = dictionaries.some(({ exclude }) =>
      exclude.some((term) =>
        normalizedLine.includes(normalizeForComparison(term)),
      ),
    )

    for (const match of line.matchAll(amountPattern)) {
      const amount = normalizeReceiptAmount(match[2])
      if (!amount) continue
      let score = 5
      if (strongTotal) score += 70
      else if (total) score += 45
      if (excluded) score -= 55
      if (match[1] || match[3]) score += 10
      score += Math.round((lineIndex / Math.max(lines.length - 1, 1)) * 12)

      candidates.push({
        amount,
        currency: match[1] ?? match[3] ?? null,
        raw: match[0],
        line,
        score,
        confidence: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
      })
    }
  })

  const deduplicated = Array.from(
    candidates
      .sort((a, b) => b.score - a.score)
      .reduce((result, candidate) => {
        const key = `${candidate.amount}:${candidate.currency ?? ''}`
        if (!result.has(key)) result.set(key, candidate)
        return result
      }, new Map<string, ReceiptAmountCandidate>())
      .values(),
  ).slice(0, 5)

  const best = deduplicated[0]
  return {
    best: best && best.confidence !== 'low' ? best : null,
    candidates: deduplicated,
  }
}
