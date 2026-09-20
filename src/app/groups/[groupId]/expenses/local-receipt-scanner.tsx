'use client'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAnalytics } from '@/lib/analytics/context'
import {
  RECEIPT_OCR_LANGUAGES,
  isReceiptOcrLanguageCode,
  suggestReceiptOcrLanguage,
} from '@/lib/receipt-ocr/languages'
import {
  ReceiptItem,
  parseReceiptItemsDetailed,
} from '@/lib/receipt-ocr/parse-items'
import {
  ReceiptAmountCandidate,
  parseReceiptTotal,
} from '@/lib/receipt-ocr/parse-total'
import { writeReceiptDraft } from '@/lib/receipt-ocr/receipt-draft'
import { ReceiptOcrLanguageCode } from '@/lib/receipt-ocr/types'
import { formatFileSize } from '@/lib/utils'
import {
  Camera,
  Images,
  Loader2,
  Plus,
  ScanText,
  Trash2,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

const MAX_FILE_SIZE = 25 * 1024 ** 2
const LANGUAGE_STORAGE_KEY = 'receipt-ocr-languages'

function initialLanguages(locale: string): ReceiptOcrLanguageCode[] {
  if (typeof window !== 'undefined') {
    try {
      const stored = JSON.parse(
        localStorage.getItem(LANGUAGE_STORAGE_KEY) ?? '[]',
      )
      if (Array.isArray(stored)) {
        const valid = stored.filter(
          (value): value is ReceiptOcrLanguageCode =>
            typeof value === 'string' && isReceiptOcrLanguageCode(value),
        )
        if (valid.length) return valid.slice(0, 2)
      }
    } catch {
      // Ignore damaged local preferences and use the locale suggestion.
    }
  }
  return [suggestReceiptOcrLanguage(locale)]
}

export function LocalReceiptScanner({
  serverOcr = false,
}: {
  serverOcr?: boolean
}) {
  const locale = useLocale()
  const t = useTranslations('CreateFromReceipt')
  const tr = (key: string, fallback: string) =>
    t.has(`Local.${key}`) ? t(`Local.${key}`) : fallback
  const { groupId, group } = useCurrentGroup()
  const router = useRouter()
  const sendEvent = useAnalytics()
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [languages, setLanguages] = useState<ReceiptOcrLanguageCode[]>(() =>
    initialLanguages(locale),
  )
  const [automaticLanguage, setAutomaticLanguage] = useState(true)
  const [detectedLanguages, setDetectedLanguages] = useState<
    ReceiptOcrLanguageCode[]
  >([])
  const [progress, setProgress] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ReceiptAmountCandidate[]>([])
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<string | null>(null)
  const [items, setItems] = useState<ReceiptItem[]>([])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    if (!selected.type.startsWith('image/')) {
      setError(tr('unsupportedImage', 'Select a supported image file.'))
      return
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError(
        tr(
          'tooBig',
          `The image must be smaller than ${formatFileSize(MAX_FILE_SIZE, locale)}.`,
        ),
      )
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(selected)
    setPreviewUrl(URL.createObjectURL(selected))
    setCandidates([])
    setAmount('')
    setCurrency(null)
    setItems([])
    setDetectedLanguages([])
    setError(null)
  }

  const updateLanguage = (index: number, value: string) => {
    if (value === 'auto') {
      setAutomaticLanguage(true)
      return
    }
    setAutomaticLanguage(false)
    const next = [...languages]
    if (value === 'none') next.splice(index, 1)
    else if (isReceiptOcrLanguageCode(value)) next[index] = value
    const unique = Array.from(new Set(next)).slice(0, 2)
    setLanguages(unique)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(unique))
  }

  const scan = async () => {
    if (!file || (!automaticLanguage && languages.length === 0)) return
    setPending(true)
    setError(null)
    setProgress(0)
    setCandidates([])
    setItems([])
    setDetectedLanguages([])
    const controller = new AbortController()
    abortRef.current = controller
    sendEvent(
      { event: 'expense: scan receipt', props: {} },
      `/groups/${groupId}/expenses`,
    )

    try {
      const [
        { preprocessReceiptImage },
        { recognizeReceipt },
        { detectReceiptLanguages },
      ] = await Promise.all([
        import('@/lib/receipt-ocr/preprocess'),
        import('@/lib/receipt-ocr/recognize'),
        import('@/lib/receipt-ocr/detect-language'),
      ])
      const pilotLanguages: ReceiptOcrLanguageCode[] = automaticLanguage
        ? ['eng', 'srp']
        : languages
      let usedServer = serverOcr
      let processed: Blob | null = null
      let recognized
      try {
        if (!serverOcr) throw new Error('Use browser OCR.')
        recognized = await (
          await import('@/lib/receipt-ocr/recognize-server')
        ).recognizeReceiptOnServer(file, groupId, languages, controller.signal)
      } catch (serverError) {
        if (
          serverError instanceof DOMException &&
          serverError.name === 'AbortError'
        )
          throw serverError
        usedServer = false
        processed = await preprocessReceiptImage(file)
        recognized = await recognizeReceipt(
          processed,
          pilotLanguages,
          ({ progress: nextProgress }) =>
            setProgress(automaticLanguage ? nextProgress * 0.45 : nextProgress),
          controller.signal,
        )
      }
      const receiptLanguages = automaticLanguage
        ? detectReceiptLanguages(recognized.text, locale)
        : languages
      setDetectedLanguages(receiptLanguages)
      if (
        !usedServer &&
        automaticLanguage &&
        receiptLanguages.join('+') !== pilotLanguages.join('+')
      ) {
        recognized = await recognizeReceipt(
          processed!,
          receiptLanguages,
          ({ progress: nextProgress }) =>
            setProgress(0.45 + nextProgress * 0.55),
          controller.signal,
        )
      }
      const parsed = parseReceiptTotal(recognized.text, receiptLanguages)
      const parsedItems = parsed.best
        ? parseReceiptItemsDetailed(recognized.text, {
            lines: recognized.lines,
            expectedTotal: parsed.best.amount,
          })
        : null
      setItems(parsedItems?.items ?? [])
      setCandidates(parsed.candidates)
      if (parsed.best) {
        setAmount(parsed.best.amount)
        setCurrency(parsed.best.currency)
      } else {
        setError(
          tr(
            'uncertain',
            'No reliable total was found. Choose a candidate or enter the amount.',
          ),
        )
      }
    } catch (scanError) {
      if (scanError instanceof DOMException && scanError.name === 'AbortError')
        return
      console.error(scanError)
      setError(
        scanError instanceof Error &&
          scanError.name === 'UnsupportedReceiptImageError'
          ? tr(
              'unsupportedImage',
              'This image format is not supported by your browser.',
            )
          : tr('error', 'The receipt could not be read. Try another image.'),
      )
    } finally {
      setPending(false)
      abortRef.current = null
    }
  }

  const selectCandidate = (candidate: ReceiptAmountCandidate) => {
    setAmount(candidate.amount)
    setCurrency(candidate.currency)
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {serverOcr
          ? tr(
              'serverPrivacy',
              'The image is analyzed by the private OCR service on this server.',
            )
          : tr(
              'privacy',
              'The image is read on this device and is not uploaded for OCR.',
            )}
      </p>

      <input
        ref={cameraInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={chooseFile}
      />
      <input
        ref={galleryInputRef}
        className="sr-only"
        type="file"
        accept="image/*"
        onChange={chooseFile}
      />
      {previewUrl && (
        <div className="flex min-h-36 items-center justify-center overflow-hidden rounded-md border bg-secondary">
          {/* A local blob URL cannot be handled by next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={tr('previewAlt', 'Selected receipt')}
            className="max-h-64 object-contain"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-10 whitespace-normal"
          disabled={pending}
          onClick={() => cameraInputRef.current?.click()}
        >
          <Camera className="mr-2 size-4" />
          {tr('takePhoto', 'Take photo')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-10 whitespace-normal"
          disabled={pending}
          onClick={() => galleryInputRef.current?.click()}
        >
          <Images className="mr-2 size-4" />
          {tr('chooseGallery', 'Choose from gallery')}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <Select
            key={index}
            value={
              automaticLanguage && index === 0
                ? 'auto'
                : (languages[index] ?? 'none')
            }
            onValueChange={(value) => updateLanguage(index, value)}
            disabled={pending || (automaticLanguage && index === 1)}
          >
            <SelectTrigger aria-label={tr('language', 'Receipt language')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {index === 0 && (
                <SelectItem value="auto">
                  {tr('automaticLanguage', 'Detect automatically')}
                </SelectItem>
              )}
              {index === 1 && (
                <SelectItem value="none">
                  {tr('noSecondLanguage', 'One language')}
                </SelectItem>
              )}
              {RECEIPT_OCR_LANGUAGES.filter(
                ({ code }) =>
                  !languages.includes(code) || languages[index] === code,
              ).map(({ code, label }) => (
                <SelectItem key={code} value={code}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>

      {detectedLanguages.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {tr('detectedLanguage', 'Detected language')}:{' '}
          {detectedLanguages
            .map(
              (code) =>
                RECEIPT_OCR_LANGUAGES.find((language) => language.code === code)
                  ?.label ?? code,
            )
            .join(' + ')}
        </p>
      )}

      {pending && (
        <div className="space-y-2" aria-live="polite">
          <div className="h-2 overflow-hidden rounded bg-secondary">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => abortRef.current?.abort()}
          >
            <X className="mr-2 size-4" /> {tr('cancel', 'Cancel')}
          </Button>
        </div>
      )}

      {!pending && file && (
        <Button
          type="button"
          onClick={scan}
          disabled={!automaticLanguage && languages.length === 0}
        >
          <ScanText className="mr-2 size-4" />
          {serverOcr
            ? tr('scanServer', 'Scan on server')
            : tr('scan', 'Scan locally')}
        </Button>
      )}

      {candidates.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {candidates.map((candidate) => (
            <Button
              key={`${candidate.amount}-${candidate.currency}`}
              type="button"
              size="sm"
              variant={amount === candidate.amount ? 'default' : 'outline'}
              onClick={() => selectCandidate(candidate)}
            >
              {candidate.amount} {candidate.currency}
            </Button>
          ))}
        </div>
      )}

      <label className="grid gap-1 text-sm">
        <span>{tr('amount', 'Amount')}</span>
        <div className="flex items-center gap-2">
          <input
            className="h-10 flex-1 rounded-md border bg-background px-3"
            inputMode="decimal"
            value={amount}
            onChange={(event) =>
              setAmount(event.target.value.replace(',', '.'))
            }
            placeholder="0.00"
          />
          {currency && (
            <span className="text-muted-foreground">{currency}</span>
          )}
        </div>
      </label>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <strong className="text-sm">{tr('items', 'Products')}</strong>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setItems([...items, { name: '', price: '' }])}
            >
              <Plus className="mr-1 size-4" /> {tr('addItem', 'Add')}
            </Button>
          </div>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_6rem_2.5rem] gap-2">
              <input
                aria-label={tr('itemName', 'Product name')}
                className="h-10 min-w-0 rounded-md border bg-background px-3"
                value={item.name}
                onChange={(event) =>
                  setItems(
                    items.map((value, i) =>
                      i === index
                        ? { ...value, name: event.target.value }
                        : value,
                    ),
                  )
                }
              />
              <input
                aria-label={tr('itemPrice', 'Price')}
                className="h-10 min-w-0 rounded-md border bg-background px-2"
                inputMode="decimal"
                value={item.price}
                onChange={(event) =>
                  setItems(
                    items.map((value, i) =>
                      i === index
                        ? {
                            ...value,
                            price: event.target.value.replace(',', '.'),
                          }
                        : value,
                    ),
                  )
                }
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={tr('removeItem', 'Remove product')}
                onClick={() => setItems(items.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {Number(amount) > 0 &&
            Math.abs(
              items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) -
                Number(amount),
            ) > 0.01 && (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {tr(
                  'itemsMismatch',
                  'The product total differs from the receipt total. Review the products before continuing.',
                )}
              </p>
            )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        disabled={
          pending ||
          !Number.isFinite(Number(amount)) ||
          Number(amount) <= 0 ||
          items.some(
            (item) =>
              !item.name.trim() ||
              !Number.isFinite(Number(item.price)) ||
              Number(item.price) === 0,
          ) ||
          (items.length > 0 &&
            Math.abs(
              items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) -
                Number(amount),
            ) > 0.01)
        }
        onClick={() => {
          sendEvent(
            { event: 'expense: create from receipt', props: {} },
            `/groups/${groupId}/expenses`,
          )
          const validItems = items.filter(
            (item) =>
              item.name.trim() &&
              Number.isFinite(Number(item.price)) &&
              Number(item.price) !== 0,
          )
          if (validItems.length && group) {
            const draftId = writeReceiptDraft({
              groupId,
              amount,
              items: validItems.map((item) => ({
                ...item,
                name: item.name.trim(),
                assignees: group.participants.map(({ id }) => id),
              })),
            })
            if (draftId) {
              router.push(
                `/groups/${groupId}/expenses/create?receiptDraft=${draftId}`,
              )
              return
            }
            setError(
              tr(
                'draftError',
                'The recognized products could not be transferred. Check browser storage permissions and try again.',
              ),
            )
            return
          } else {
            router.push(
              `/groups/${groupId}/expenses/create?amount=${encodeURIComponent(amount)}`,
            )
          }
        }}
      >
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {tr('continue', 'Use amount')}
      </Button>
    </div>
  )
}
