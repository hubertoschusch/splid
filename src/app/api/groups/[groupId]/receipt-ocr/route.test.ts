/** @jest-environment node */

jest.mock('../../../../../lib/api', () => ({
  getGroup: jest.fn().mockResolvedValue({ id: 'group-a' }),
}))

jest.mock('../../../../../lib/env', () => ({
  env: {
    ENABLE_LOCAL_RECEIPT_OCR: true,
    PADDLEOCR_TIMEOUT_MS: 1_000,
    PADDLEOCR_URL: 'http://receipt-ai:8080',
  },
}))

import { POST } from './route'

describe('receipt OCR route', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ confidence: 100, lines: [], text: 'TOTAL 12.34' }),
    })
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      value: fetchMock,
    })
  })

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])(
    'preserves %s when forwarding the image',
    async (contentType, extension) => {
      const request = new Request(
        'http://localhost/api/groups/group-a/receipt-ocr',
        {
          body: new Blob(['receipt'], { type: contentType }),
          headers: {
            'Content-Type': contentType,
            'X-Receipt-Languages': 'eng',
          },
          method: 'POST',
        },
      )

      const response = await POST(request, {
        params: Promise.resolve({ groupId: 'group-a' }),
      })

      expect(response.status).toBe(200)
      const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
      const forwarded = (init.body as FormData).get('file')
      expect(forwarded).toBeInstanceOf(File)
      expect(forwarded).toMatchObject({
        name: `receipt.${extension}`,
        size: 7,
        type: contentType,
      })
    },
  )

  it('rejects an unsupported type without contacting the OCR service', async () => {
    const response = await POST(
      new Request('http://localhost/api/groups/group-a/receipt-ocr', {
        body: 'receipt',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Receipt-Languages': 'eng',
        },
        method: 'POST',
      }),
      { params: Promise.resolve({ groupId: 'group-a' }) },
    )

    expect(response.status).toBe(415)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
