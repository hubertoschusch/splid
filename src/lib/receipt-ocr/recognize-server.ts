import {
  ReceiptOcrLanguageCode,
  ReceiptOcrText,
  StructuredReceipt,
} from './types'

function validatedReceipt(value: unknown): StructuredReceipt | undefined {
  if (!value || typeof value !== 'object') return undefined
  const receipt = value as Partial<StructuredReceipt>
  if (!Array.isArray(receipt.items)) return undefined
  const nullableString = (field: unknown) =>
    field === null || typeof field === 'string'
  const nullableNumber = (field: unknown) =>
    field === null || (typeof field === 'number' && Number.isFinite(field))
  if (
    !nullableString(receipt.merchant) ||
    !nullableString(receipt.date) ||
    !nullableString(receipt.currency) ||
    !nullableNumber(receipt.subtotal) ||
    !nullableNumber(receipt.tax) ||
    !nullableNumber(receipt.total)
  )
    return undefined
  const items = receipt.items.filter(
    (item) =>
      item &&
      typeof item.name === 'string' &&
      item.name.trim().length > 0 &&
      nullableNumber(item.quantity) &&
      nullableNumber(item.unitPrice) &&
      typeof item.total === 'number' &&
      Number.isFinite(item.total),
  )
  if (items.length !== receipt.items.length) return undefined
  return { ...receipt, items } as StructuredReceipt
}

export async function recognizeReceiptOnServer(
  file: Blob,
  groupId: string,
  languages: ReceiptOcrLanguageCode[],
  signal?: AbortSignal,
): Promise<ReceiptOcrText> {
  const response = await fetch(
    `/api/groups/${encodeURIComponent(groupId)}/receipt-ocr`,
    {
      method: 'POST',
      body: file,
      headers: {
        'Content-Type': file.type,
        'X-Receipt-Languages': languages.join(','),
      },
      signal,
    },
  )
  if (!response.ok) throw new Error('Server receipt OCR failed.')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object')
    throw new Error('Invalid server OCR response.')
  const result = value as Partial<ReceiptOcrText>
  if (typeof result.text !== 'string' || !Array.isArray(result.lines))
    throw new Error('Invalid server OCR response.')
  const receipt = validatedReceipt(result.receipt)
  if (!receipt) throw new Error('Invalid structured receipt response.')
  return {
    text: result.text,
    confidence: typeof result.confidence === 'number' ? result.confidence : 0,
    lines: result.lines.filter(
      (line) =>
        line &&
        typeof line.text === 'string' &&
        typeof line.confidence === 'number' &&
        line.bbox &&
        Object.values(line.bbox).every((coordinate) =>
          Number.isFinite(coordinate),
        ),
    ),
    receipt,
  }
}
