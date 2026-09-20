/** Integer-only item allocation. Remainders go to lexically ordered IDs. */
export type ItemizedInput = { name: string; price: number; assignees: string[] }

export function itemizedShares(items: ItemizedInput[]) {
  const totals = new Map<string, number>()
  for (const item of items) {
    const assignees = [...new Set(item.assignees)].sort()
    if (!item.name.trim()) throw new Error('itemNameRequired')
    if (!Number.isInteger(item.price) || item.price <= 0)
      throw new Error('itemPricePositive')
    if (!assignees.length) throw new Error('itemAssigneesRequired')
    const each = Math.floor(item.price / assignees.length)
    const remainder = item.price % assignees.length
    assignees.forEach((id, index) =>
      totals.set(
        id,
        (totals.get(id) ?? 0) + each + (index < remainder ? 1 : 0),
      ),
    )
  }
  return [...totals]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([participant, shares]) => ({ participant, shares }))
}
