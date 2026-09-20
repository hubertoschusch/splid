import { normalizeReceiptAmount, parseReceiptTotal } from './parse-total'

describe('normalizeReceiptAmount', () => {
  it.each([
    ['12,50', '12.50'],
    ['12.50', '12.50'],
    ['1.234,56', '1234.56'],
    ['1,234.56', '1234.56'],
    ['1 234,5', '1234.5'],
    ['1234', '1234'],
    ['-1,80', '-1.80'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeReceiptAmount(input)).toBe(expected)
  })
})

describe('parseReceiptTotal', () => {
  it('extracts a German total instead of tax and subtotal', () => {
    const result = parseReceiptTotal(
      'Zwischensumme 80,00 €\nMwSt. 16,00 €\nZu zahlen 96,00 €',
      ['deu'],
    )
    expect(result.best).toMatchObject({ amount: '96.00', currency: '€' })
  })

  it('extracts a Croatian total and ignores PDV', () => {
    const result = parseReceiptTotal(
      'Osnovica 100,00 EUR\nPDV 25,00 EUR\nUKUPNO ZA PLATITI 125,00 EUR',
      ['hrv'],
    )
    expect(result.best).toMatchObject({ amount: '125.00', currency: 'EUR' })
  })

  it('handles Croatian text without diacritics', () => {
    const result = parseReceiptTotal('Meduzbroj 10,00\nSveukupno 12,50 EUR', [
      'hrv',
    ])
    expect(result.best?.amount).toBe('12.50')
  })

  it('supports Serbian Cyrillic', () => {
    const result = parseReceiptTotal('ПДВ 4,00\nЗа уплату 24,00 RSD', ['srp'])
    expect(result.best?.amount).toBe('24.00')
  })

  it('does not silently choose an amount without total context', () => {
    const result = parseReceiptTotal('Coffee 3,50\nCake 4,00', ['eng'])
    expect(result.best).toBeNull()
    expect(result.candidates).toHaveLength(2)
  })
})
