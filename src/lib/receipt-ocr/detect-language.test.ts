import { detectReceiptLanguages } from './detect-language'

describe('detectReceiptLanguages', () => {
  it.each([
    ['Zwischensumme 10,00\nMwSt 1,90\nZu zahlen 11,90', 'de-DE', 'deu'],
    ['Subtotal 10.00\nTax 1.90\nAmount due 11.90', 'de-DE', 'eng'],
    ['Sous-total 10,00\nTVA 1,90\nNet à payer 11,90', 'de-DE', 'fra'],
    ['Subtotale 10,00\nIVA 1,90\nDa pagare 11,90', 'de-DE', 'ita'],
    ['Укупно 1000\nПорез 200\nЗа уплату 1200', 'de-DE', 'srp'],
  ])('detects receipt language from %s', (text, locale, expected) => {
    expect(detectReceiptLanguages(text, locale)).toContain(expected)
  })

  it('uses the locale when the receipt has too little language evidence', () => {
    expect(detectReceiptLanguages('ABC 12,00', 'es-ES')).toEqual(['spa'])
  })
})
