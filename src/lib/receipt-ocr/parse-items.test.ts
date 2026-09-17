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
    expect(parseReceiptItems('Coffee 3.50\n12345\nVISA 3.50')).toEqual([
      { name: 'Coffee', price: '3.50' },
    ])
  })
})
