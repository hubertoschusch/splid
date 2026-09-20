import { ReceiptOcrLanguage, ReceiptOcrLanguageCode } from './types'

export const RECEIPT_OCR_LANGUAGES: readonly ReceiptOcrLanguage[] = [
  { code: 'deu', label: 'Deutsch', locales: ['de'], script: 'latin' },
  { code: 'eng', label: 'English', locales: ['en'], script: 'latin' },
  { code: 'hrv', label: 'Hrvatski', locales: ['hr'], script: 'latin' },
  { code: 'bos', label: 'Bosanski', locales: ['bs'], script: 'latin' },
  {
    code: 'srp_latn',
    label: 'Srpski (latinica)',
    locales: ['sr-Latn'],
    script: 'latin',
  },
  {
    code: 'srp',
    label: 'Српски (ћирилица)',
    locales: ['sr', 'sr-Cyrl'],
    script: 'cyrillic',
  },
  { code: 'slv', label: 'Slovenščina', locales: ['sl'], script: 'latin' },
  { code: 'ita', label: 'Italiano', locales: ['it'], script: 'latin' },
  { code: 'fra', label: 'Français', locales: ['fr'], script: 'latin' },
  { code: 'spa', label: 'Español', locales: ['es'], script: 'latin' },
] as const

export const DEFAULT_RECEIPT_OCR_LANGUAGES: ReceiptOcrLanguageCode[] = [
  'deu',
  'eng',
  'hrv',
]

export function isReceiptOcrLanguageCode(
  value: string,
): value is ReceiptOcrLanguageCode {
  return RECEIPT_OCR_LANGUAGES.some(({ code }) => code === value)
}

export function suggestReceiptOcrLanguage(
  locale: string,
): ReceiptOcrLanguageCode {
  const normalized = locale.toLowerCase()
  return (
    RECEIPT_OCR_LANGUAGES.find(({ locales }) =>
      locales.some((candidate) =>
        normalized.startsWith(candidate.toLowerCase()),
      ),
    )?.code ?? 'eng'
  )
}
