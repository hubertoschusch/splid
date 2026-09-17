const MAX_IMAGE_EDGE = 2400

/**
 * Downscale and increase the contrast of a receipt without uploading it.
 * createImageBitmap also applies the EXIF orientation in current browsers.
 */
export async function preprocessReceiptImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  })
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

  for (let index = 0; index < image.data.length; index += 4) {
    const grey =
      image.data[index] * 0.299 +
      image.data[index + 1] * 0.587 +
      image.data[index + 2] * 0.114
    const contrasted = Math.max(0, Math.min(255, (grey - 128) * 1.35 + 128))
    image.data[index] = contrasted
    image.data[index + 1] = contrasted
    image.data[index + 2] = contrasted
  }
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
