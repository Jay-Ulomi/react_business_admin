import { type FormEvent, useEffect, useState } from 'react'
import {
  checkGiftCardBalance,
  deactivateGiftCard,
  fetchGiftCards,
  issueGiftCard,
  type GiftCardBalanceResponse,
  type GiftCardResponse,
  type IssueGiftCardRequest,
} from '../features/gift-cards/gift-cards-api'
import { Modal } from '../features/ui/modal'
import { ConfirmModal, type ConfirmState } from '../features/ui/confirm-modal'
import { useToast } from '../features/ui/toast-context'
import { formatCurrency } from '../lib/format'

const EMPTY_FORM: IssueGiftCardRequest = {
  code: '',
  initialBalance: 0,
  expiryDate: '',
  note: '',
}

export function GiftCardsPage() {
  const { pushToast } = useToast()
  const [cards, setCards] = useState<GiftCardResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)

  // Issue modal
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<IssueGiftCardRequest>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Deactivate confirm
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  // Balance lookup
  const [lookupCode, setLookupCode] = useState('')
  const [lookupResult, setLookupResult] = useState<GiftCardBalanceResponse | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      try {
        const resp = await fetchGiftCards(page)
        if (!cancelled) {
          setCards(resp.content)
          setTotalPages(resp.totalPages)
        }
      } catch (err) {
        if (!cancelled) pushToast('error', err instanceof Error ? err.message : 'Failed to load gift cards')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [page, refreshKey])

  const openIssue = () => {
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.initialBalance || form.initialBalance <= 0) {
      setFormError('Initial balance must be greater than zero.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      const payload: IssueGiftCardRequest = {
        ...form,
        code: form.code?.trim() || undefined,
        expiryDate: form.expiryDate || undefined,
        note: form.note?.trim() || undefined,
      }
      const created = await issueGiftCard(payload)
      pushToast('success', `Gift card ${created.code} issued.`)
      setModalOpen(false)
      setRefreshKey((k) => k + 1)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to issue gift card')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeactivate = (card: GiftCardResponse) => {
    setConfirmState({
      title: 'Deactivate Gift Card',
      message: `Deactivate card "${card.code}"? It can no longer be used at the POS.`,
      confirmLabel: 'Deactivate',
      destructive: true,
      onConfirm: async () => {
        try {
          await deactivateGiftCard(card.id)
          pushToast('success', 'Gift card deactivated.')
          setRefreshKey((k) => k + 1)
        } catch (err) {
          pushToast('error', err instanceof Error ? err.message : 'Failed to deactivate')
        }
        setConfirmState(null)
      },
    })
  }

  const handleLookup = async () => {
    const code = lookupCode.trim().toUpperCase()
    if (!code) return
    setLookupLoading(true)
    setLookupError(null)
    setLookupResult(null)
    try {
      const result = await checkGiftCardBalance(code)
      setLookupResult(result)
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Card not found')
    } finally {
      setLookupLoading(false)
    }
  }

  const usedPercent = (card: GiftCardResponse) =>
    card.initialBalance > 0
      ? Math.round(((card.initialBalance - card.currentBalance) / card.initialBalance) * 100)
      : 0

  return (
    <section className="space-y-4">
      {/* Balance Lookup */}
      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <p className="mb-2 text-xs uppercase tracking-[0.18em] text-slate-500">Balance Check</p>
        <div className="flex gap-2">
          <input
            placeholder="Enter gift card code…"
            value={lookupCode}
            onChange={(e) => setLookupCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && void handleLookup()}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => void handleLookup()}
            disabled={lookupLoading}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {lookupLoading ? 'Checking…' : 'Check'}
          </button>
        </div>
        {lookupResult && (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <p className="font-mono text-sm font-bold text-emerald-800">{lookupResult.code}</p>
                <p className="text-xs text-slate-500">
                  {lookupResult.isActive ? 'Active' : 'Inactive'}
                  {lookupResult.expiryDate ? ` · Expires ${lookupResult.expiryDate}` : ''}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(lookupResult.currentBalance)}</p>
                <p className="text-xs text-slate-500">available</p>
              </div>
            </div>
          </div>
        )}
        {lookupError && <p className="mt-2 text-xs text-rose-600">{lookupError}</p>}
      </div>

      {/* Cards list */}
      <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Gift Cards</p>
            <h2 className="font-display text-xl text-slate-900">Issued Cards</h2>
          </div>
          <button
            type="button"
            onClick={openIssue}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Issue Gift Card
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading gift cards…</p>
        ) : cards.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 py-10 text-center">
            <p className="text-sm text-slate-500">No gift cards issued yet.</p>
            <p className="mt-1 text-xs text-slate-400">Issue a card to let customers redeem it at the POS.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <div
                key={card.id}
                className={`rounded-xl border px-4 py-3 ${card.isActive ? 'border-emerald-100 bg-emerald-50' : 'border-slate-200 bg-slate-50 opacity-60'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold text-slate-900">{card.code}</p>
                      {!card.isActive && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Inactive</span>
                      )}
                      {card.expiryDate && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          Exp {card.expiryDate}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatCurrency(card.currentBalance)}
                      </span>
                      <span className="text-xs text-slate-400">
                        of {formatCurrency(card.initialBalance)} · {usedPercent(card)}% used
                      </span>
                    </div>
                    {/* Balance bar */}
                    <div className="mt-1.5 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${100 - usedPercent(card)}%` }}
                      />
                    </div>
                    {card.note && <p className="mt-0.5 text-xs text-slate-400">{card.note}</p>}
                  </div>
                  <div className="flex gap-2">
                    {card.isActive && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(card)}
                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-2 pt-2 text-sm">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-slate-500">Page {page + 1} / {totalPages}</span>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Issue modal */}
      {modalOpen && (
        <Modal title="Issue Gift Card" onClose={() => setModalOpen(false)}>
          <form className="space-y-3" onSubmit={(e) => void handleSubmit(e)}>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Card Code (blank = auto-generate)</label>
              <input
                placeholder="e.g. GIFT2024"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Initial Balance *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.initialBalance || ''}
                onChange={(e) => setForm((f) => ({ ...f, initialBalance: Number(e.target.value) }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Expiry Date (blank = no expiry)</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Note (optional)</label>
              <input
                placeholder="e.g. Birthday gift"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            {formError && <p className="text-xs text-rose-600">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? 'Issuing…' : 'Issue Card'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}
    </section>
  )
}
