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

  it('keeps a negative Croatian discount so items reconcile with the total', () => {
    expect(
      parseReceiptItems(
        'XXL BBQ rebra 8,99 C\nPOPUST 20% -1,80\nKarlovačko svijetlo 7,99 C\nKokos 0,99 A\nDonut čokoladni 0,66 C\nPontino špek-luk-sir 1,39 C\nRolica meksička 0,99 C\nLisnato hrenovka 0,69 C\nPerec pivski 2,10 A\nSomersby Cider 10,74 C\nSomersby Višnja 10,74 C\nSomersby Mango 10,74 C\nZa platiti 54,21',
        { expectedTotal: '54.21' },
      ),
    ).toEqual([
      { name: 'XXL BBQ rebra', price: '8.99' },
      { name: 'POPUST 20%', price: '-1.80' },
      { name: 'Karlovačko svijetlo', price: '7.99' },
      { name: 'Kokos', price: '0.99' },
      { name: 'Donut čokoladni', price: '0.66' },
      { name: 'Pontino špek-luk-sir', price: '1.39' },
      { name: 'Rolica meksička', price: '0.99' },
      { name: 'Lisnato hrenovka', price: '0.69' },
      { name: 'Perec pivski', price: '2.10' },
      { name: 'Somersby Cider', price: '10.74' },
      { name: 'Somersby Višnja', price: '10.74' },
      { name: 'Somersby Mango', price: '10.74' },
    ])
  })

  it('extracts the supplied Interspar product and ignores payment rows', () => {
    expect(
      parseReceiptItems(
        'PIZZA ŠUNKA SPAR 330 g 2,79 A\n1 x 2,79\nUKUPNO 2,79\nPLAĆANJE VISA 2,79',
        { expectedTotal: '2.79' },
      ),
    ).toEqual([{ name: 'PIZZA ŠUNKA SPAR 330 g', price: '2.79' }])
  })

  it('joins a product name with a price split into the next OCR line', () => {
    expect(
      parseReceiptItems('', {
        expectedTotal: '2.79',
        lines: [
          {
            text: 'PIZZA ŠUNKA SPAR 330 g',
            confidence: 91,
            bbox: { x0: 20, y0: 100, x1: 320, y1: 120 },
          },
          {
            text: '2,79 A',
            confidence: 88,
            bbox: { x0: 400, y0: 121, x1: 480, y1: 141 },
          },
        ],
      }),
    ).toEqual([{ name: 'PIZZA ŠUNKA SPAR 330 g', price: '2.79' }])
  })
})
