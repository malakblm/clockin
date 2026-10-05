'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Location = {
  id: string
  name: string
  lat: number
  lng: number
  radius_m: number
}

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const toRad = (v: number) => (v * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function durationMs(start: string, end: string) {
  return new Date(end).getTime() - new Date(start).getTime()
}

function formatDuration(ms: number) {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.round((ms % 3600000) / 60000)
  return `${hours}h ${minutes}m`
}

function formatClock(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function startOfWeek(d: Date) {
  const date = new Date(d)
  const day = date.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

export default function HomePage() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [activeSince, setActiveSince] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [statusIsError, setStatusIsError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [entries, setEntries] = useState<any[]>([])
  const [now, setNow] = useState(new Date())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(tick)
  }, [])

  const fetchHistory = async (userId: string) => {
    const { data: history } = await supabase
      .from('time_entries')
      .select('id, clock_in_at, clock_out_at, locations(name)')
      .eq('user_id', userId)
      .not('clock_out_at', 'is', null)
      .order('clock_in_at', { ascending: false })
      .limit(20)
    setEntries(history ?? [])
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserEmail(user.email ?? null)

      const { data: locs } = await supabase.from('locations').select('*')
      setLocations(locs ?? [])

      const { data: openEntry } = await supabase
        .from('time_entries')
        .select('id, clock_in_at')
        .eq('user_id', user.id)
        .is('clock_out_at', null)
        .maybeSingle()

      setActiveEntryId(openEntry?.id ?? null)
      setActiveSince(openEntry?.clock_in_at ?? null)

      await fetchHistory(user.id)
      setLoading(false)
    }
    load()
  }, [router])

  const handleClockIn = async () => {
    if (locations.length === 0) {
      setStatus('No work locations configured yet.')
      setStatusIsError(true)
      return
    }
    setBusy(true)
    setStatus('Checking your location…')
    setStatusIsError(false)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        const nearest = locations
          .map((loc) => ({ loc, dist: distanceMeters(latitude, longitude, loc.lat, loc.lng) }))
          .sort((a, b) => a.dist - b.dist)[0]

        if (nearest.dist > nearest.loc.radius_m) {
          setStatus(`${Math.round(nearest.dist)}m from ${nearest.loc.name} — outside the ${nearest.loc.radius_m}m range.`)
          setStatusIsError(true)
          setBusy(false)
          return
        }

        const { data: { user } } = await supabase.auth.getUser()
        const { data, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: user!.id,
            location_id: nearest.loc.id,
            clock_in_at: new Date().toISOString(),
            in_lat: latitude,
            in_lng: longitude,
          })
          .select('id, clock_in_at')
          .single()

        setBusy(false)
        if (error) {
          setStatus(`Couldn't clock in: ${error.message}`)
          setStatusIsError(true)
        } else {
          setActiveEntryId(data.id)
          setActiveSince(data.clock_in_at)
          setStatus(`On shift at ${nearest.loc.name}.`)
          setStatusIsError(false)
        }
      },
      () => {
        setStatus('Location access is needed to clock in.')
        setStatusIsError(true)
        setBusy(false)
      }
    )
  }

  const handleClockOut = async () => {
    if (!activeEntryId) return
    setBusy(true)
    setStatus('Checking your location…')
    setStatusIsError(false)

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        const { error } = await supabase
          .from('time_entries')
          .update({
            clock_out_at: new Date().toISOString(),
            out_lat: latitude,
            out_lng: longitude,
          })
          .eq('id', activeEntryId)

        setBusy(false)
        if (error) {
          setStatus(`Couldn't clock out: ${error.message}`)
          setStatusIsError(true)
        } else {
          setActiveEntryId(null)
          setActiveSince(null)
          setStatus('Shift ended.')
          setStatusIsError(false)
          const { data: { user } } = await supabase.auth.getUser()
          if (user) fetchHistory(user.id)
        }
      },
      () => {
        setStatus('Location access is needed to clock out.')
        setStatusIsError(true)
        setBusy(false)
      }
    )
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F5F1] font-mono text-sm text-[#374151]">
        loading…
      </div>
    )
  }

  const onShift = Boolean(activeEntryId)
  const weekStart = startOfWeek(new Date())
  const weekMs = entries
    .filter((e) => new Date(e.clock_in_at) >= weekStart)
    .reduce((sum, e) => sum + durationMs(e.clock_in_at, e.clock_out_at), 0)

  return (
    <div className="min-h-screen bg-[#F7F5F1]">
      <header className="flex items-center justify-between bg-[#1C2321] px-6 py-4 text-[#F7F5F1]">
        <div>
          <p className="text-sm font-semibold tracking-tight">Clockin</p>
          <p className="text-xs text-[#C7CCD1]">{userEmail}</p>
        </div>
        <div className="text-right font-mono text-2xl tabular-nums">
          {formatClock(now)}
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col items-center gap-6 px-6 py-12">
        <div className="w-full rounded-sm border border-[#1C2321]/10 bg-white p-8 text-center shadow-sm">
          <div className="mb-6 flex items-center justify-center gap-2">
            <span className={`h-2 w-2 rounded-full ${onShift ? 'bg-[#2F6F4E]' : 'bg-[#9CA3AF]'}`} />
            <p className="font-mono text-xs text-[#374151]">
              {onShift && activeSince
                ? `on shift since ${new Date(activeSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'not on shift'}
            </p>
          </div>

          <button
            onClick={onShift ? handleClockOut : handleClockIn}
            disabled={busy}
            className={`w-full rounded-sm py-5 text-lg font-semibold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              onShift
                ? 'bg-[#B5482D] text-white hover:bg-[#9c3d26]'
                : 'bg-[#E8A33D] text-[#1C2321] hover:bg-[#d5922f]'
            }`}
          >
            {busy ? 'Working…' : onShift ? 'Clock Out' : 'Clock In'}
          </button>

          {status && (
            <p className={`mt-4 text-sm ${statusIsError ? 'text-[#B5482D]' : 'text-[#374151]'}`}>
              {status}
            </p>
          )}
        </div>

        <div className="grid w-full grid-cols-2 gap-3">
          <div className="rounded-sm border border-[#1C2321]/10 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[#4B5563]">This week</p>
            <p className="mt-1 font-mono text-xl font-semibold text-[#1C2321]">
              {formatDuration(weekMs)}
            </p>
          </div>
          <div className="rounded-sm border border-[#1C2321]/10 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[#4B5563]">Shifts logged</p>
            <p className="mt-1 font-mono text-xl font-semibold text-[#1C2321]">{entries.length}</p>
          </div>
        </div>

        <div className="w-full">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4B5563]">Shift log</p>
          {entries.length === 0 ? (
            <div className="border-t border-[#1C2321]/10 py-6 text-center">
              <p className="text-sm text-[#374151]">No shifts logged yet.</p>
              <p className="mt-1 text-xs text-[#6B7280]">Clock in once to see your history here.</p>
            </div>
          ) : (
            <ul className="border-t border-[#1C2321]/10">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between border-b border-[#1C2321]/10 py-3 text-sm"
                >
                  <span className="text-[#1C2321]">
                    {entry.locations?.name ?? 'Unknown'}
                    <span className="ml-2 text-[#6B7280]">
                      {new Date(entry.clock_in_at).toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-[#1C2321]">
                    {formatDuration(durationMs(entry.clock_in_at, entry.clock_out_at))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button onClick={handleLogout} className="text-sm text-[#4B5563] underline underline-offset-2">
          Log out
        </button>
      </main>
    </div>
  )
}