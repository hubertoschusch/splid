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
      ),
    ).resolves.toMatchObject({
      text: expect.stringContaining('BIJELA KOBASICA'),
      lines: [{ text: expect.stringContaining('BIJELA KOBASICA') }],
    })
  })

  it('rejects malformed service responses', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ text: 42 }) })

    await expect(
      recognizeReceiptOnServer(
        new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }),
      ),
    ).rejects.toThrow('Invalid server OCR response.')
  })
})
