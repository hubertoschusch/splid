import { expenseFormSchema } from './schemas'

function byAmountExpense(amount: string, shares: string[]) {
  return {
    expenseDate: new Date('2026-09-01'),
    title: 'Dinner',
    amount,
    paidBy: 'a',
    splitMode: 'BY_AMOUNT',
    saveDefaultSplittingOptions: false,
    isReimbursement: false,
    paidFor: shares.map((shares, i) => ({ participant: `p${i}`, shares })),
  }
}

function issueMessages(input: unknown): string[] {
  const result = expenseFormSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((i) => i.message)
}

describe('expenseFormSchema, split by amount', () => {
  it('accepts amounts that add up to the expense amount', () => {
    expect(
      issueMessages(
        byAmountExpense('524.34', [
          '110.11',
          '209.74',
          '104.87',
          '89.14',
          '10.48',
        ]),
      ),
    ).toEqual([])
  })

  it('rejects amounts one cent off', () => {
    expect(
      issueMessages(
        byAmountExpense('524.34', [
          '110.11',
          '209.74',
          '104.87',
          '89.14',
          '10.49',
        ]),
      ),
    ).toEqual(['amountSum'])
  })

  it('sums amounts typed with a decimal comma', () => {
    expect(
      issueMessages(byAmountExpense('100', ['50', '30', '20,00'])),
    ).toEqual([])
  })

  it('reports an emptied amount instead of throwing on it', () => {
    expect(issueMessages(byAmountExpense('100', ['60', '']))).toEqual([
      'noZeroShares',
      'amountSum',
    ])
  })
})

describe('expenseFormSchema, itemized', () => {
  it('ignores hidden participant shares and derives the amount from items', () => {
    const result = expenseFormSchema.safeParse({
      ...byAmountExpense('0', []),
      splitMode: 'ITEMIZED',
      paidFor: [{ participant: 'stale', shares: 'not-a-number' }],
      items: [{ name: 'Pizza', price: '12.50', assignees: ['a'] }],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.amount).toBe(12.5)
      expect(result.data.paidFor).toEqual([])
    }
  })

  it('includes discounts in the derived itemized amount', () => {
    const result = expenseFormSchema.safeParse({
      ...byAmountExpense('0', []),
      splitMode: 'ITEMIZED',
      items: [
        { name: 'Product', price: '8.99', assignees: ['a'] },
        { name: 'Discount', price: '-1.80', assignees: ['a'] },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.amount).toBe(7.19)
  })

  it('rejects an itemized expense whose discounts erase its total', () => {
    expect(
      issueMessages({
        ...byAmountExpense('0', []),
        splitMode: 'ITEMIZED',
        items: [
          { name: 'Product', price: '1.00', assignees: ['a'] },
          { name: 'Discount', price: '-1.00', assignees: ['a'] },
        ],
      }),
    ).toContain('amountNotZero')
  })

  it('sums item prices without binary floating-point drift', () => {
    expect(
      issueMessages({
        ...byAmountExpense('0', []),
        splitMode: 'ITEMIZED',
        items: [
          { name: 'One', price: '0.10', assignees: ['a'] },
          { name: 'Two', price: '0.20', assignees: ['a'] },
          { name: 'Discount', price: '-0.30', assignees: ['a'] },
        ],
      }),
    ).toContain('amountNotZero')
  })

  it.each(['Infinity', '-Infinity'])('rejects the item price %s', (price) => {
    expect(
      issueMessages({
        ...byAmountExpense('0', []),
        splitMode: 'ITEMIZED',
        items: [{ name: 'Invalid', price, assignees: ['a'] }],
      }),
    ).toContain('invalidNumber')
  })

  it('still requires participants outside itemized mode', () => {
    expect(issueMessages(byAmountExpense('10', []))).toContain('paidForMin1')
  })
})
