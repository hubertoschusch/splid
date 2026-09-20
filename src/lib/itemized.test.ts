import { itemizedShares } from './itemized'

describe('itemizedShares', () => {
  it('aggregates overlapping assignments and allocates remainders by participant id', () => {
    expect(
      itemizedShares([
        { name: 'Pizza', price: 2400, assignees: ['sam', 'alex'] },
        { name: 'Wine', price: 1800, assignees: ['sam'] },
        { name: 'Dessert', price: 901, assignees: ['jo', 'sam', 'alex'] },
      ]),
    ).toEqual([
      { participant: 'alex', shares: 1501 },
      { participant: 'jo', shares: 300 },
      { participant: 'sam', shares: 3300 },
    ])
  })

  it('rejects empty, non-positive, and unassigned items', () => {
    expect(() =>
      itemizedShares([{ name: '', price: 1, assignees: ['a'] }]),
    ).toThrow('itemNameRequired')
    expect(() =>
      itemizedShares([{ name: 'x', price: 0, assignees: ['a'] }]),
    ).toThrow('itemPricePositive')
    expect(() =>
      itemizedShares([{ name: 'x', price: 1, assignees: [] }]),
    ).toThrow('itemAssigneesRequired')
  })
})
