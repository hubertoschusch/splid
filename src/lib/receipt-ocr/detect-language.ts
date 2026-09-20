import { RECEIPT_DICTIONARIES } from './dictionaries'
import { suggestReceiptOcrLanguage } from './languages'
import { ReceiptOcrLanguageCode } from './types'

const LATIN_LANGUAGES: ReceiptOcrLanguageCode[] = [
  'deu',
  'eng',
  'hrv',
  'bos',
  'srp_latn',
  'slv',
  'ita',
  'fra',
  'spa',
]

const LANGUAGE_MARKERS: Partial<Record<ReceiptOcrLanguageCode, string[]>> = {
  deu: ['danke', 'einkauf', 'filiale', 'kasse', 'artikel'],
  eng: ['thank you', 'receipt', 'store', 'cashier', 'quantity'],
  hrv: ['hvala', 'racun', 'blagajna'],
  bos: ['hvala', 'racun', 'kasa'],
  srp_latn: ['hvala', 'racun', 'kasa'],
  slv: ['hvala', 'racun', 'blagajna'],
  ita: ['grazie', 'scontrino', 'cassa'],
  fra: ['merci', 'ticket de caisse', 'quantite'],
  spa: ['gracias', 'recibo', 'caja'],
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()

/** Detect only among languages for which the receipt scanner has OCR data. */
export function detectReceiptLanguages(
  text: string,
  locale: string,
): ReceiptOcrLanguageCode[] {
  if (/\p{Script=Cyrillic}/u.test(text)) return ['srp']

  const normalized = normalize(text)
  const scores = new Map<ReceiptOcrLanguageCode, number>(
    LATIN_LANGUAGES.map((language) => [language, 0]),
  )
  for (const language of LATIN_LANGUAGES) {
    const dictionary = RECEIPT_DICTIONARIES[language]
    for (const term of [
      ...dictionary.strongTotal,
      ...dictionary.total,
      ...dictionary.exclude,
      ...(LANGUAGE_MARKERS[language] ?? []),
    ]) {
      if (normalized.includes(normalize(term))) {
        scores.set(language, (scores.get(language) ?? 0) + 3)
      }
    }
  }

  const localeLanguage = suggestReceiptOcrLanguage(locale)
  if (localeLanguage !== 'srp') {
    scores.set(localeLanguage, (scores.get(localeLanguage) ?? 0) + 2)
  }
  const ranked = [...scores].sort((a, b) => b[1] - a[1])
  const best = ranked[0]
  if (!best || best[1] <= 2) return [localeLanguage]
  const second = ranked[1]
  return second && second[1] >= best[1] - 1 ? [best[0], second[0]] : [best[0]]
}
