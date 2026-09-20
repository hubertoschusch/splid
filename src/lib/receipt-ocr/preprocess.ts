const MAX_IMAGE_EDGE = 2400
const LOW_PERCENTILE = 0.02
const HIGH_PERCENTILE = 0.98

export class UnsupportedReceiptImageError extends Error {
  name = 'UnsupportedReceiptImageError'
}

/** Stretch the useful luminance range while ignoring small dark/bright outliers. */
export function enhanceReceiptPixels(data: Uint8ClampedArray) {
  const histogram = new Uint32Array(256)
  let pixels = 0
  for (let index = 0; index < data.length; index += 4) {
    const grey = Math.round(
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114,
    )
    histogram[grey]++
    pixels++
  }

  const percentile = (target: number) => {
    let seen = 0
    for (let value = 0; value < histogram.length; value++) {
      seen += histogram[value]
      if (seen >= target) return value
    }
    return 255
  }
  const black = percentile(pixels * LOW_PERCENTILE)
  const white = percentile(pixels * HIGH_PERCENTILE)
  const range = Math.max(32, white - black)

  for (let index = 0; index < data.length; index += 4) {
    const grey =
      data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    const enhanced = Math.max(0, Math.min(255, ((grey - black) * 255) / range))
    data[index] = enhanced
    data[index + 1] = enhanced
    data[index + 2] = enhanced
  }
}

/**
 * Downscale and increase the contrast of a receipt without uploading it.
 * createImageBitmap also applies the EXIF orientation in current browsers.
 */
export async function preprocessReceiptImage(file: Blob): Promise<Blob> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnsupportedReceiptImageError(
      'The browser could not decode this image format.',
    )
  }
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height),
  )
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    bitmap.close()
    throw new Error('Canvas is unavailable.')
  }

  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const image = context.getImageData(0, 0, width, height)

  enhanceReceiptPixels(image.data)
  context.putImageData(image, 0, 0)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Image conversion failed.')),
      'image/jpeg',
      0.9,
    )
  })
}
