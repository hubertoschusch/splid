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
  ReceiptAmountCandidate,
  parseReceiptTotal,
} from '@/lib/receipt-ocr/parse-total'
import { ReceiptOcrLanguageCode } from '@/lib/receipt-ocr/types'
import { formatFileSize } from '@/lib/utils'
import { Camera, Loader2, ScanText, X } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { useCurrentGroup } from '../current-group-context'

const MAX_FILE_SIZE = 10 * 1024 ** 2
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

export function LocalReceiptScanner() {
  const locale = useLocale()
  const t = useTranslations('CreateFromReceipt')
  const tr = (key: string, fallback: string) =>
    t.has(`Local.${key}`) ? t(`Local.${key}`) : fallback
  const { groupId } = useCurrentGroup()
  const router = useRouter()
  const sendEvent = useAnalytics()
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [languages, setLanguages] = useState<ReceiptOcrLanguageCode[]>(() =>
    initialLanguages(locale),
  )
  const [progress, setProgress] = useState(0)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ReceiptAmountCandidate[]>([])
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    if (!selected) return
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
    setError(null)
  }

  const updateLanguage = (index: number, value: string) => {
    const next = [...languages]
    if (value === 'none') next.splice(index, 1)
    else if (isReceiptOcrLanguageCode(value)) next[index] = value
    const unique = Array.from(new Set(next)).slice(0, 2)
    setLanguages(unique)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, JSON.stringify(unique))
  }

  const scan = async () => {
    if (!file || languages.length === 0) return
    setPending(true)
    setError(null)
    setProgress(0)
    setCandidates([])
    const controller = new AbortController()
    abortRef.current = controller
    sendEvent(
      { event: 'expense: scan receipt', props: {} },
      `/groups/${groupId}/expenses`,
    )

    try {
      const [{ preprocessReceiptImage }, { recognizeReceipt }] =
        await Promise.all([
          import('@/lib/receipt-ocr/preprocess'),
          import('@/lib/receipt-ocr/recognize'),
        ])
      const processed = await preprocessReceiptImage(file)
      const recognized = await recognizeReceipt(
        processed,
        languages,
        ({ progress: nextProgress }) => setProgress(nextProgress),
        controller.signal,
      )
      const parsed = parseReceiptTotal(recognized.text, languages)
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
      setError(tr('error', 'The receipt could not be read. Try another image.'))
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
        {tr(
          'privacy',
          'The image is read on this device and is not uploaded for OCR.',
        )}
      </p>

      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={chooseFile}
      />
      <Button
        type="button"
        variant="secondary"
        className="min-h-36 overflow-hidden"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {previewUrl ? (
          // A local blob URL cannot be handled by next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={tr('previewAlt', 'Selected receipt')}
            className="max-h-64 object-contain"
          />
        ) : (
          <span className="flex items-center gap-2">
            <Camera className="size-5" />
            {tr('selectImage', 'Take a photo or select an image')}
          </span>
        )}
      </Button>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[0, 1].map((index) => (
          <Select
            key={index}
            value={languages[index] ?? 'none'}
            onValueChange={(value) => updateLanguage(index, value)}
            disabled={pending}
          >
            <SelectTrigger aria-label={tr('language', 'Receipt language')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
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
        <Button type="button" onClick={scan} disabled={languages.length === 0}>
          <ScanText className="mr-2 size-4" /> {tr('scan', 'Scan locally')}
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button
        type="button"
        disabled={
          pending || !Number.isFinite(Number(amount)) || Number(amount) <= 0
        }
        onClick={() => {
          sendEvent(
            { event: 'expense: create from receipt', props: {} },
            `/groups/${groupId}/expenses`,
          )
          router.push(
            `/groups/${groupId}/expenses/create?amount=${encodeURIComponent(amount)}`,
          )
        }}
      >
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {tr('continue', 'Use amount')}
      </Button>
    </div>
  )
}
