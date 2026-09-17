import { ReceiptOcrLanguageCode } from './types'

export type ReceiptDictionary = {
  strongTotal: string[]
  total: string[]
  exclude: string[]
}

const commonExclude = ['subtotal', 'tax', 'vat', 'discount', 'change', 'cash']

export const RECEIPT_DICTIONARIES: Record<
  ReceiptOcrLanguageCode,
  ReceiptDictionary
> = {
  deu: {
    strongTotal: ['zu zahlen', 'endbetrag', 'rechnungsbetrag'],
    total: ['gesamt', 'summe', 'betrag'],
    exclude: ['zwischensumme', 'mwst', 'steuer', 'rabatt', 'rueckgeld'],
  },
  eng: {
    strongTotal: ['amount due', 'grand total', 'balance due'],
    total: ['total', 'amount'],
    exclude: commonExclude,
  },
  hrv: {
    strongTotal: ['za platiti', 'iznos za platiti', 'sveukupno'],
    total: ['ukupno', 'iznos'],
    exclude: ['meduzbroj', 'osnovica', 'pdv', 'porez', 'popust', 'povrat'],
  },
  bos: {
    strongTotal: ['za platiti', 'iznos za platiti', 'sveukupno'],
    total: ['ukupno', 'iznos'],
    exclude: ['meduzbir', 'osnovica', 'pdv', 'porez', 'popust', 'povrat'],
  },
  srp_latn: {
    strongTotal: ['za uplatu', 'za placanje', 'svega za uplatu'],
    total: ['ukupno', 'iznos'],
    exclude: ['medjuzbir', 'osnovica', 'pdv', 'porez', 'popust', 'povracaj'],
  },
  srp: {
    strongTotal: ['за уплату', 'за плаћање', 'свега за уплату'],
    total: ['укупно', 'износ'],
    exclude: ['међузбир', 'основица', 'пдв', 'порез', 'попуст', 'повраћај'],
  },
  slv: {
    strongTotal: ['za placilo', 'koncni znesek'],
    total: ['skupaj', 'znesek'],
    exclude: ['vmesni seštevek', 'ddv', 'davek', 'popust', 'vracilo'],
  },
  ita: {
    strongTotal: ['da pagare', 'totale dovuto'],
    total: ['totale', 'importo'],
    exclude: ['subtotale', 'iva', 'imposta', 'sconto', 'resto'],
  },
  fra: {
    strongTotal: ['a payer', 'net a payer', 'montant du'],
    total: ['total', 'montant'],
    exclude: ['sous-total', 'tva', 'taxe', 'remise', 'monnaie'],
  },
  spa: {
    strongTotal: ['a pagar', 'total a pagar', 'importe debido'],
    total: ['total', 'importe'],
    exclude: ['subtotal', 'iva', 'impuesto', 'descuento', 'cambio'],
  },
}
