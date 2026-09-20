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
  let terminated = false
  const terminate = async () => {
    if (terminated) return
    terminated = true
    await worker.terminate()
  }
  let rejectAbort: ((reason: DOMException) => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject
  })
  const abort = () => {
    rejectAbort?.(new DOMException('Aborted', 'AbortError'))
    void terminate()
  }
  signal?.addEventListener('abort', abort, { once: true })

  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const recognition = worker.recognize(
      image,
      { rotateAuto: true },
      { text: true, blocks: true },
    )
    const result = await (signal
      ? Promise.race([recognition, aborted])
      : recognition)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const lines =
      result.data.blocks?.flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.map(({ text, confidence, bbox }) => ({
            text: text.trim(),
            confidence,
            bbox,
          })),
        ),
      ) ?? []
    return { text: result.data.text, confidence: result.data.confidence, lines }
  } finally {
    signal?.removeEventListener('abort', abort)
    await terminate()
  }
}
