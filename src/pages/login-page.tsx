import { useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../types/api'
import { useAuth } from '../features/auth/auth-context'
import { useBusinessContext } from '../features/context/business-context'

type FromState = {
  from?: string
}

export function LoginPage() {
  const { login, isLoading } = useAuth()
  const { loadContexts, selectContext } = useBusinessContext()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('owner@demo.com')
  const [password, setPassword] = useState('password')
  const [error, setError] = useState<string | null>(null)

  const from = (location.state as FromState | null)?.from ?? '/app/dashboard'

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    try {
      await login({ email, password })
      const accesses = await loadContexts()
      const first = accesses[0]
      const firstBranch = first?.branchAccesses?.[0]
      if (first?.businessId && firstBranch?.branchId) {
        await selectContext(first.businessId, firstBranch.branchId)
      }
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Login failed')
      }
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-emerald-100 bg-white/95 p-6 shadow-sm">
        <img src="/logo.png" alt="Aduinola" className="mx-auto mb-4 h-12" />
        <h1 className="mt-2 text-center font-display text-2xl text-slate-900">Business Admin</h1>
        <p className="mt-1 text-center text-sm text-slate-500">Sign in with your business account.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <label className="block text-sm text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none ring-emerald-400 focus:ring"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>

          <label className="block text-sm text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none ring-emerald-400 focus:ring"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
            />
          </label>

          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
