import { env } from '@/lib/env'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 25 * 1024 ** 2

export async function POST(request: Request) {
  if (!env.PADDLEOCR_URL || !env.ENABLE_LOCAL_RECEIPT_OCR)
    return NextResponse.json(
      { error: 'Server OCR is disabled.' },
      { status: 404 },
    )

  const input = await request.formData()
  const file = input.get('file')
  if (!(file instanceof File) || !file.type.startsWith('image/'))
    return NextResponse.json(
      { error: 'A receipt image is required.' },
      { status: 400 },
    )
  if (file.size > MAX_FILE_SIZE)
    return NextResponse.json(
      { error: 'The receipt image is too large.' },
      { status: 413 },
    )

  const body = new FormData()
  body.set('file', file, file.name)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.PADDLEOCR_TIMEOUT_MS)
  try {
    const response = await fetch(new URL('/analyze', env.PADDLEOCR_URL), {
      method: 'POST',
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok)
      return NextResponse.json(
        { error: 'The local OCR service could not analyze the receipt.' },
        { status: response.status >= 500 ? 503 : response.status },
      )
    return NextResponse.json(await response.json())
  } catch {
    return NextResponse.json(
      { error: 'The local OCR service is unavailable.' },
      { status: 503 },
    )
  } finally {
    clearTimeout(timeout)
  }
}
