import type { PropsWithChildren } from 'react'

type ModalProps = PropsWithChildren<{
  title: string
  onClose: () => void
  maxWidthClass?: string
}>

export function Modal({ title, onClose, maxWidthClass = 'max-w-xl', children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full ${maxWidthClass} rounded-2xl border border-slate-200 bg-white p-5 shadow-xl`}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-xl text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

