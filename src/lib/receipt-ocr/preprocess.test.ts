import { enhanceReceiptPixels } from './preprocess'

describe('enhanceReceiptPixels', () => {
  it('converts colour pixels to greyscale and stretches a dim receipt', () => {
    const data = new Uint8ClampedArray([
      40, 50, 60, 255, 80, 90, 100, 255, 160, 170, 180, 255, 200, 210, 220, 255,
    ])

    enhanceReceiptPixels(data)

    for (let index = 0; index < data.length; index += 4) {
      expect(data[index]).toBe(data[index + 1])
      expect(data[index]).toBe(data[index + 2])
      expect(data[index + 3]).toBe(255)
    }
    expect(data[0]).toBe(0)
    expect(data[12]).toBe(255)
  })

  it('keeps sparse dark text visible on white paper', () => {
    const data = new Uint8ClampedArray(100 * 4).fill(255)
    data.set([0, 0, 0, 255], 0)

    enhanceReceiptPixels(data)

    expect([...data.slice(0, 4)]).toEqual([0, 0, 0, 255])
    expect([...data.slice(4, 8)]).toEqual([255, 255, 255, 255])
  })

  it('does not turn a uniform image black', () => {
    const data = new Uint8ClampedArray([240, 240, 240, 255, 240, 240, 240, 255])

    enhanceReceiptPixels(data)

    expect([...data]).toEqual([240, 240, 240, 255, 240, 240, 240, 255])
  })
})
