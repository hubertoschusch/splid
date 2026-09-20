import { ReceiptOcrText } from './types'

export async function recognizeReceiptOnServer(
  file: File,
  signal?: AbortSignal,
): Promise<ReceiptOcrText> {
  const body = new FormData()
  body.set('file', file, file.name)
  const response = await fetch('/api/receipt-ocr', {
    method: 'POST',
    body,
    signal,
  })
  if (!response.ok) throw new Error('Server receipt OCR failed.')
  const value: unknown = await response.json()
  if (!value || typeof value !== 'object')
    throw new Error('Invalid server OCR response.')
  const result = value as Partial<ReceiptOcrText>
  if (typeof result.text !== 'string' || !Array.isArray(result.lines))
    throw new Error('Invalid server OCR response.')
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
  }
}
