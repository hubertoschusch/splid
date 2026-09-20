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
})
