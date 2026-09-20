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
})
