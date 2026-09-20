export type ReceiptOcrScript = 'latin' | 'cyrillic'

export type ReceiptOcrLanguageCode =
  | 'deu'
  | 'eng'
  | 'hrv'
  | 'bos'
  | 'srp_latn'
  | 'srp'
  | 'slv'
  | 'ita'
  | 'fra'
  | 'spa'

export type ReceiptOcrLanguage = {
  code: ReceiptOcrLanguageCode
  label: string
  locales: string[]
  script: ReceiptOcrScript
}

export type ReceiptOcrProgress = {
  status: string
  progress: number
}

export type ReceiptOcrText = {
  text: string
  confidence: number
  lines: ReceiptOcrLine[]
}

export type ReceiptOcrLine = {
  text: string
  confidence: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}
