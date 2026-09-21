import { recognizeReceiptOnServer } from './recognize-server'

describe('recognizeReceiptOnServer', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: fetchMock,
    })
  })

  it('returns validated text and line geometry', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        text: 'BIJELA KOBASICA 300 g 5,38 A\nUKUPNO 5,38',
        confidence: 100,
        receipt: {
          merchant: 'TEST MARKET',
          date: '2026-09-20',
          currency: 'EUR',
          subtotal: 5.38,
          tax: 0.35,
          total: 5.38,
          items: [
            {
              name: 'BIJELA KOBASICA 300 g',
              quantity: 1,
              unitPrice: 5.38,
              total: 5.38,
            },
          ],
        },
        lines: [
          {
            text: 'BIJELA KOBASICA 300 g 5,38 A',
            confidence: 100,
            bbox: { x0: 10, y0: 20, x1: 300, y1: 40 },
          },
        ],
      }),
    })

    await expect(
      recognizeReceiptOnServer(
        new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }),
        'group-a',
        ['deu'],
      ),
    ).resolves.toMatchObject({
      text: expect.stringContaining('BIJELA KOBASICA'),
      lines: [{ text: expect.stringContaining('BIJELA KOBASICA') }],
      receipt: {
        items: [expect.objectContaining({ name: 'BIJELA KOBASICA 300 g' })],
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/groups/group-a/receipt-ocr',
      expect.objectContaining({
        body: expect.any(File),
        headers: {
          'Content-Type': 'image/jpeg',
          'X-Receipt-Languages': 'deu',
        },
      }),
    )
  })

  it('rejects malformed service responses', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ text: 42 }) })

    await expect(
      recognizeReceiptOnServer(
        new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }),
        'group-a',
        ['eng'],
      ),
    ).rejects.toThrow('Invalid server OCR response.')
  })
})
