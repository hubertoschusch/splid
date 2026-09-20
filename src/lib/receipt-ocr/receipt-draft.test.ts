import { readReceiptDraft, writeReceiptDraft } from './receipt-draft'

describe('receipt draft transfer', () => {
  beforeEach(() => sessionStorage.clear())

  it('round-trips valid items for the same group', () => {
    const id = writeReceiptDraft({
      groupId: 'group-a',
      amount: '3.50',
      items: [{ name: 'Coffee', price: '3.50', assignees: ['alice'] }],
    })
    expect(readReceiptDraft(id, 'group-a', new Set(['alice']))).toMatchObject({
      amount: '3.50',
      items: [{ name: 'Coffee', price: '3.50', assignees: ['alice'] }],
    })
  })

  it('round-trips a receipt discount', () => {
    const id = writeReceiptDraft({
      groupId: 'group-a',
      amount: '7.19',
      items: [
        { name: 'Product', price: '8.99', assignees: ['alice'] },
        { name: 'Discount', price: '-1.80', assignees: ['alice'] },
      ],
    })
    expect(readReceiptDraft(id, 'group-a', new Set(['alice']))?.items).toEqual([
      { name: 'Product', price: '8.99', assignees: ['alice'] },
      { name: 'Discount', price: '-1.80', assignees: ['alice'] },
    ])
  })

  it('does not expose a draft to another group', () => {
    const id = writeReceiptDraft({
      groupId: 'group-a',
      amount: '3.50',
      items: [{ name: 'Coffee', price: '3.50', assignees: ['alice'] }],
    })
    expect(readReceiptDraft(id, 'group-b')).toBeNull()
  })

  it('rejects assignees that are not in the group', () => {
    const id = writeReceiptDraft({
      groupId: 'group-a',
      amount: '3.50',
      items: [{ name: 'Coffee', price: '3.50', assignees: ['mallory'] }],
    })
    expect(readReceiptDraft(id, 'group-a', new Set(['alice']))).toBeNull()
  })

  it.each(['abc', 'Infinity', '-Infinity'])('rejects the price %s', (price) => {
    const id = writeReceiptDraft({
      groupId: 'group-a',
      amount: '3.50',
      items: [{ name: 'Coffee', price, assignees: ['alice'] }],
    })

    expect(readReceiptDraft(id, 'group-a', new Set(['alice']))).toBeNull()
  })
})
