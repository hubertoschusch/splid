import { createWorker } from 'tesseract.js'
import {
  ReceiptOcrLanguageCode,
  ReceiptOcrProgress,
  ReceiptOcrText,
} from './types'

export async function recognizeReceipt(
  image: Blob,
  languages: ReceiptOcrLanguageCode[],
  onProgress?: (progress: ReceiptOcrProgress) => void,
  signal?: AbortSignal,
): Promise<ReceiptOcrText> {
  if (languages.length === 0 || languages.length > 2) {
    throw new Error('Choose one or two OCR languages.')
  }

  const worker = await createWorker(languages.join('+'), undefined, {
    logger: ({ status, progress }) =>
      onProgress?.({
        status,
        progress: Number.isFinite(progress) ? progress : 0,
      }),
  })
  const abort = () => void worker.terminate()
  signal?.addEventListener('abort', abort, { once: true })

  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const result = await worker.recognize(image)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return { text: result.data.text, confidence: result.data.confidence }
  } finally {
    signal?.removeEventListener('abort', abort)
    await worker.terminate()
  }
}
