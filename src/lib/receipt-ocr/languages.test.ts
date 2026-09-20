import {
  isReceiptOcrLanguageCode,
  suggestReceiptOcrLanguage,
} from './languages'

describe('receipt OCR languages', () => {
  it.each([
    ['de-DE', 'deu'],
    ['en-US', 'eng'],
    ['hr-HR', 'hrv'],
    ['bs-BA', 'bos'],
    ['sr-Latn-RS', 'srp_latn'],
    ['sr-Cyrl-RS', 'srp'],
    ['unknown', 'eng'],
  ])('suggests a language for %s', (locale, language) => {
    expect(suggestReceiptOcrLanguage(locale)).toBe(language)
  })

  it('validates supported language codes', () => {
    expect(isReceiptOcrLanguageCode('hrv')).toBe(true)
    expect(isReceiptOcrLanguageCode('unknown')).toBe(false)
  })
})
