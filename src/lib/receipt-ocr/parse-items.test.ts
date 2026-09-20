import { parseReceiptItems } from './parse-items'

describe('parseReceiptItems', () => {
  it('extracts products while excluding receipt totals and taxes', () => {
    expect(
      parseReceiptItems(
        'MILCH 1,29 €\n2 x APFEL 3,00 A\nMwSt. 0,68\nZwischensumme 4,29\nZU ZAHLEN 4,29 EUR',
      ),
    ).toEqual([
      { name: 'MILCH', price: '1.29' },
      { name: 'APFEL', price: '3.00' },
    ])
  })

  it('supports decimal points and ignores lines without names', () => {
    expect(
      parseReceiptItems('Coffee 3.50\nOliva oil 4.20\n12345\nVISA 3.50'),
    ).toEqual([
      { name: 'Coffee', price: '3.50' },
      { name: 'Oliva oil', price: '4.20' },
    ])
  })

  it.each([
    ['TVA', 'TOTAL'],
    ['IMPOSTA', 'TOTALE'],
    ['DAVEK', 'SKUPAJ'],
    ['POREZ', 'UKUPNO'],
    ['ПОРЕЗ', 'УКУПНО'],
  ])('excludes localized %s and %s lines', (tax, total) => {
    expect(
      parseReceiptItems(`Coffee 2,00 EUR\n${tax} 0,40 EUR\n${total} 2,40 EUR`),
    ).toEqual([{ name: 'Coffee', price: '2.00' }])
  })

  it('rejects ordinary receipt text even when it ends in numbers', () => {
    expect(
      parseReceiptItems(
        'REWE Markt 1234\nFiliale 42\nMILCH 1,29\nAPFEL 2,71\nService 1,00\nSUMME 4,00',
        { expectedTotal: '4.00' },
      ),
    ).toEqual([
      { name: 'MILCH', price: '1.29' },
      { name: 'APFEL', price: '2.71' },
    ])
  })

  it('returns no products when candidates do not reconcile with the total', () => {
    expect(
      parseReceiptItems('MILCH 1,29\nWerbetext 5,00\nSUMME 1,29', {
        expectedTotal: '1.29',
      }),
    ).toEqual([])
  })

  it('rejects total labels whose words were joined by OCR', () => {
    expect(
      parseReceiptItems('GRANDTOTAL 24.000', { expectedTotal: '24.000' }),
    ).toEqual([])
  })

  it('supports integer amounts with thousands separators', () => {
    expect(
      parseReceiptItems('JASMINE TEA 24,000\nEGG TART 13,000', {
        expectedTotal: '37,000',
      }),
    ).toEqual([
      { name: 'JASMINE TEA', price: '24000' },
      { name: 'EGG TART', price: '13000' },
    ])
  })
})
