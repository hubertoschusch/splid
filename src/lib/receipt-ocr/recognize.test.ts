jest.mock('tesseract.js', () => ({
  createWorker: jest.fn(),
}))

import { createWorker } from 'tesseract.js'
import { recognizeReceipt } from './recognize'

const mockedCreateWorker = jest.mocked(createWorker)
const recognize = jest.fn()
const terminate = jest.fn().mockResolvedValue(undefined)

describe('recognizeReceipt', () => {
  beforeEach(() => {
    recognize.mockReset()
    terminate.mockClear()
    mockedCreateWorker.mockResolvedValue({
      recognize,
      terminate,
    } as unknown as Awaited<ReturnType<typeof createWorker>>)
  })

  it('rejects promptly and terminates the worker when aborted', async () => {
    recognize.mockReturnValue(new Promise(() => undefined))
    const controller = new AbortController()
    const result = recognizeReceipt(
      new Blob(['receipt']),
      ['eng'],
      undefined,
      controller.signal,
    )

    await Promise.resolve()
    controller.abort()

    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(terminate).toHaveBeenCalledTimes(1)
  })
})
