import { getGroup } from '@/lib/api'
import { env } from '@/lib/env'
import { isReceiptOcrLanguageCode } from '@/lib/receipt-ocr/languages'
import { NextResponse } from 'next/server'

const MAX_FILE_SIZE = 25 * 1024 ** 2
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_REQUESTS = 5
const requestsByCapability = new Map<string, number[]>()
let activeRequests = 0

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

function isRateLimited(key: string) {
  const now = Date.now()
  const recent = (requestsByCapability.get(key) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  )
  recent.push(now)
  requestsByCapability.set(key, recent)
  return recent.length > RATE_LIMIT_REQUESTS
}

async function readLimitedBody(request: Request, contentType: string) {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_SIZE)
    throw new Response(null, { status: 413 })
  if (!request.body) throw new Response(null, { status: 400 })

  const reader = request.body.getReader()
  const chunks: ArrayBuffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_FILE_SIZE) throw new Response(null, { status: 413 })
      const copy = new Uint8Array(value.byteLength)
      copy.set(value)
      chunks.push(copy.buffer)
    }
  } catch (caught) {
    await reader.cancel().catch(() => undefined)
    throw caught
  }
  return new Blob(chunks, { type: contentType })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  if (!env.PADDLEOCR_URL || !env.ENABLE_LOCAL_RECEIPT_OCR)
    return error('Server OCR is disabled.', 404)

  const { groupId } = await params
  if (!(await getGroup(groupId))) return error('Group not found.', 404)

  const contentType = request.headers.get('content-type')?.split(';')[0]
  if (
    !contentType ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(contentType)
  )
    return error('A supported receipt image is required.', 415)

  const requestedLanguages = (request.headers.get('x-receipt-languages') ?? '')
    .split(',')
    .filter(isReceiptOcrLanguageCode)
    .slice(0, 2)
  if (!requestedLanguages.length)
    return error('An OCR language is required.', 400)

  const client =
    request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'local'
  if (isRateLimited(`${groupId}:${client.trim()}`))
    return error('Too many OCR requests.', 429)
  if (activeRequests >= 1) return error('The OCR service is busy.', 429)

  let file: Blob
  try {
    file = await readLimitedBody(request, contentType)
  } catch (caught) {
    if (caught instanceof Response && caught.status === 413)
      return error('The receipt image is too large.', 413)
    return error('A receipt image is required.', 400)
  }
  if (!file.size) return error('A receipt image is required.', 400)

  const body = new FormData()
  const extension =
    contentType === 'image/png'
      ? 'png'
      : contentType === 'image/webp'
        ? 'webp'
        : 'jpg'
  body.set('file', file, `receipt.${extension}`)
  body.set('language', requestedLanguages[0])
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), env.PADDLEOCR_TIMEOUT_MS)
  if (activeRequests >= 1) {
    clearTimeout(timeout)
    return error('The OCR service is busy.', 429)
  }
  activeRequests++
  try {
    const response = await fetch(new URL('/analyze', env.PADDLEOCR_URL), {
      method: 'POST',
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok)
      return error(
        'The local OCR service could not analyze the receipt.',
        response.status >= 500 ? 503 : response.status,
      )
    return NextResponse.json(await response.json())
  } catch {
    return error('The local OCR service is unavailable.', 503)
  } finally {
    activeRequests--
    clearTimeout(timeout)
  }
}
