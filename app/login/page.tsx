'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F5F1] px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-sm border border-[#1C2321]/10 bg-white p-8 shadow-sm">
        <p className="mb-1 font-mono text-xs text-[#4B5563]">Clockin</p>
        <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[#1C2321]">
          {isSignUp ? 'Create an account' : 'Sign in'}
        </h1>

        <label className="mb-1 block text-xs font-medium text-[#4B5563]">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="mb-3 w-full rounded-sm border border-[#1C2321]/15 p-2.5 text-sm text-[#1C2321] outline-none focus:border-[#E8A33D]"
        />

        <label className="mb-1 block text-xs font-medium text-[#4B5563]">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="mb-4 w-full rounded-sm border border-[#1C2321]/15 p-2.5 text-sm text-[#1C2321] outline-none focus:border-[#E8A33D]"
        />

        {error && <p className="mb-4 text-sm text-[#B5482D]">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-sm bg-[#1C2321] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#2a322f] disabled:opacity-50"
        >
          {loading ? 'Please wait…' : isSignUp ? 'Sign up' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="mt-4 w-full text-sm text-[#4B5563] underline underline-offset-2"
        >
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </button>
      </form>
    </div>
  )
}