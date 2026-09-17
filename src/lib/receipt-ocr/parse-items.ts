import { normalizeReceiptAmount } from './parse-total'

export type ReceiptItem = {
  name: string
  price: string
}

const amountAtEnd =
  /(-?\d{1,3}(?:[ .,'’]\d{3})*(?:[.,]\d{1,2})|-?\d+(?:[.,]\d{1,2})?)\s*(?:EUR|USD|GBP|CHF|HRK|BAM|RSD|€|\$|£)?(?:\s+[A-Z])?\s*$/iu

const excludedLine =
  /\b(total|subtotal|summe|gesamt|zwischensumme|betrag|zu zahlen|steuer|mwst|ust|tax|vat|pdv|iva|rabatt|discount|coupon|gutschein|r[üu]ckgeld|change|bar|cash|karte|card|visa|mastercard)\b/iu

/** Extract conservative product/price pairs from OCR text. */
export function parseReceiptItems(text: string): ReceiptItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .flatMap((line) => {
      if (!line || excludedLine.test(line)) return []
      const match = line.match(amountAtEnd)
      if (!match || match.index === undefined) return []
      const price = normalizeReceiptAmount(match[1])
      if (!price) return []

      const name = line
        .slice(0, match.index)
        .replace(/^\s*\d+(?:[.,]\d+)?\s*[xX×]\s*/, '')
        .replace(/[.:;\-–—\s]+$/g, '')
        .trim()
      if (name.length < 2 || name.length > 200 || !/\p{L}/u.test(name))
        return []
      return [{ name, price }]
    })
    .slice(0, 500)
}
