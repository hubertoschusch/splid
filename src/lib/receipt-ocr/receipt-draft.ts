export type ReceiptDraft = {
  groupId: string
  createdAt: number
  amount: string
  items: { name: string; price: string; assignees: string[] }[]
}

const PREFIX = 'receipt-draft:'
const MAX_AGE = 30 * 60 * 1000

export function writeReceiptDraft(draft: Omit<ReceiptDraft, 'createdAt'>) {
  try {
    const id = crypto.randomUUID()
    sessionStorage.setItem(
      `${PREFIX}${id}`,
      JSON.stringify({ ...draft, createdAt: Date.now() }),
    )
    return id
  } catch {
    return null
  }
}

export function readReceiptDraft(
  id: string | null,
  groupId: string,
  allowedParticipantIds?: ReadonlySet<string>,
): ReceiptDraft | null {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem(`${PREFIX}${id}`) ?? 'null',
    )
    if (!value || typeof value !== 'object') return null
    const draft = value as Partial<ReceiptDraft>
    if (
      draft.groupId !== groupId ||
      typeof draft.createdAt !== 'number' ||
      Date.now() - draft.createdAt > MAX_AGE ||
      typeof draft.amount !== 'string' ||
      !Array.isArray(draft.items) ||
      draft.items.length === 0 ||
      draft.items.length > 500
    )
      return null
    const items = draft.items.filter(
      (item) =>
        item &&
        typeof item.name === 'string' &&
        item.name.trim().length > 0 &&
        item.name.length <= 200 &&
        typeof item.price === 'string' &&
        Number(item.price) !== 0 &&
        Array.isArray(item.assignees) &&
        item.assignees.length > 0 &&
        item.assignees.every(
          (id) =>
            typeof id === 'string' &&
            (!allowedParticipantIds || allowedParticipantIds.has(id)),
        ),
    )
    return items.length === draft.items.length
      ? { groupId, createdAt: draft.createdAt, amount: draft.amount, items }
      : null
  } catch {
    return null
  }
}
