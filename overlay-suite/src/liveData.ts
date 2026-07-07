import { useEffect, useMemo, useState } from 'react'
import { overlayData } from './overlayConfig'

const OVERLAY_CHANNEL = 'luigi-overlay-live-data'
const TIMER_STORAGE_KEY = 'luigi:event-timer'
const SPOTIFY_STORAGE_KEY = 'luigi:spotify'

export type SpotifyNowPlaying = {
  song: string
  artist: string
  durationMs: number
  progressMs: number
  isPlaying: boolean
  albumArtUrl: string
  updatedAt: number
}

export type SpotifyStatus = {
  configured: boolean
  connected: boolean
  redirectUri: string
  scopes: string[]
}

export type TwitchStatus = {
  configured: boolean
  connected: boolean
  live: boolean
  channel: string
  broadcaster: { id: string; login: string; name: string } | null
  reader: { id: string; login: string; name: string } | null
  redirectUri: string
  scopes: string[]
  subscriptions: string[]
  errors: string[]
}

export type TwitchChatMessage = {
  id: string
  user: string
  message: string
  color: string
  badges: Array<TwitchChatBadge | string>
  fragments?: TwitchChatFragment[]
  timestamp: number
}

export type TwitchChatBadge = {
  setId: string
  id: string
  url: string
}

export type TwitchChatFragment =
  | { type: 'text'; text: string }
  | { type: 'emote'; text: string; url: string }

export type TwitchAlert = {
  id: string
  kind: string
  name: string
  detail: string
  timestamp: number
}

type SpotifyCurrentResponse = Partial<SpotifyNowPlaying> & {
  connected?: boolean
  fetchedAt?: number
  reason?: string
}

type TimerMode = 'stopwatch' | 'countdown'

export type EventTimerState = {
  mode: TimerMode
  running: boolean
  baseMs: number
  startedAt: number | null
  targetAt?: number | null
}

export type EventTimerCardConfig = {
  title: string
  infoLabel: string
  info: string
  purpose: string
}

type OverlayStateResponse = {
  timer?: Partial<EventTimerState>
  eventTimer?: Partial<EventTimerCardConfig>
  goals?: Partial<OverlayGoals>
  camera?: Partial<OverlayCameraState>
  info?: Partial<OverlayModeState<InfoMode>>
  ad?: Partial<OverlayModeState<AdMode>>
}

export type InfoMode = 'spotify' | 'valorant' | 'premier' | 'lifesteal' | 'timer'
export type AdMode = 'default' | 'minecraft'

export type OverlayModeState<T extends string> = {
  mode: T
}

export type OverlayCameraState = {
  enabled: boolean
}

export type OverlayGoals = {
  followers: number
  followerTarget: number
  subs: number
  subTarget: number
  lifestealSignups: number
  lifestealSignupTarget: number
}

type OverlayGoalsResponse = {
  connected?: boolean
  goals?: Partial<OverlayGoals>
  errors?: string[]
}

export type LifestealOverlayState = {
  hearts: number
  max: number
  configured: boolean
  live: boolean
  updatedAt: number | null
}

type LifestealOverlayResponse = {
  configured?: boolean
  player?: {
    hearts?: number | null
    eliminated?: boolean
    updated_at?: number
  } | null
}

type OverlayMessage =
  | { type: 'spotify:update'; payload: Partial<SpotifyNowPlaying> }
  | { type: 'timer:set'; payload: Partial<EventTimerState> }
  | { type: 'timer:start' }
  | { type: 'timer:pause' }
  | { type: 'timer:reset'; payload?: Partial<Pick<EventTimerState, 'mode' | 'baseMs'>> }

const idleSpotify: SpotifyNowPlaying = {
  ...overlayData.spotify,
  updatedAt: Date.now(),
}

const initialTimer: EventTimerState = {
  mode: 'countdown',
  running: true,
  baseMs: 0,
  startedAt: null,
  targetAt: Date.parse('2026-07-20T16:00:00.000Z'),
}

const lifestealApiUrl = import.meta.env.VITE_LIFESTEAL_OVERLAY_URL ?? ''
const lifestealApiToken = import.meta.env.VITE_LIFESTEAL_OVERLAY_TOKEN ?? ''

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function readJson<T>(key: string): T | null {
  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function currentTimerMs(timer: EventTimerState, now = Date.now()) {
  if (timer.mode === 'countdown' && Number.isFinite(timer.targetAt)) return Math.max(0, Math.floor(timer.targetAt ?? 0) - now)
  if (!timer.running || timer.startedAt === null) return timer.baseMs

  const elapsed = now - timer.startedAt
  if (timer.mode === 'countdown') return Math.max(0, timer.baseMs - elapsed)

  return timer.baseMs + elapsed
}

function normalizeTimer(timer: Partial<EventTimerState> | undefined, fallback: EventTimerState): EventTimerState {
  const baseMs = timer?.baseMs
  const startedAt = timer?.startedAt
  const targetAt = timer?.targetAt

  return {
    mode: timer?.mode === 'countdown' || timer?.mode === 'stopwatch' ? timer.mode : fallback.mode,
    running: typeof timer?.running === 'boolean' ? timer.running : fallback.running,
    baseMs: Number.isFinite(baseMs) ? Math.max(0, Math.floor(baseMs ?? 0)) : fallback.baseMs,
    startedAt: startedAt === null || Number.isFinite(startedAt) ? (startedAt ?? null) : fallback.startedAt,
    targetAt: targetAt === null || Number.isFinite(targetAt) ? (targetAt ?? null) : fallback.targetAt,
  }
}

function normalizeEventTimer(config: Partial<EventTimerCardConfig> | undefined, fallback: EventTimerCardConfig): EventTimerCardConfig {
  return {
    title: typeof config?.title === 'string' && config.title ? config.title : fallback.title,
    infoLabel: typeof config?.infoLabel === 'string' && config.infoLabel ? config.infoLabel : fallback.infoLabel,
    info: typeof config?.info === 'string' && config.info ? config.info : fallback.info,
    purpose: typeof config?.purpose === 'string' && config.purpose ? config.purpose : fallback.purpose,
  }
}

function normalizeGoals(goals: Partial<OverlayGoals> | undefined, fallback: OverlayGoals): OverlayGoals {
  return {
    followers: numberOrFallback(goals?.followers, fallback.followers),
    followerTarget: numberOrFallback(goals?.followerTarget, fallback.followerTarget),
    subs: numberOrFallback(goals?.subs, fallback.subs),
    subTarget: numberOrFallback(goals?.subTarget, fallback.subTarget),
    lifestealSignups: numberOrFallback(goals?.lifestealSignups, fallback.lifestealSignups),
    lifestealSignupTarget: numberOrFallback(goals?.lifestealSignupTarget, fallback.lifestealSignupTarget),
  }
}

function normalizeCamera(camera: Partial<OverlayCameraState> | undefined, fallback: OverlayCameraState): OverlayCameraState {
  return {
    enabled: typeof camera?.enabled === 'boolean' ? camera.enabled : fallback.enabled,
  }
}

function normalizeMode<T extends string>(value: Partial<OverlayModeState<T>> | undefined, fallback: OverlayModeState<T>, allowed: readonly T[]) {
  return {
    mode: value?.mode && allowed.includes(value.mode) ? value.mode : fallback.mode,
  }
}

function numberOrFallback(value: unknown, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : fallback
}

function applyTimerMessage(timer: EventTimerState, message: OverlayMessage): EventTimerState {
  if (message.type === 'timer:set') {
    return {
      ...timer,
      ...message.payload,
      baseMs: Math.max(0, message.payload.baseMs ?? timer.baseMs),
    }
  }

  if (message.type === 'timer:start') {
    if (timer.running) return timer
    return {
      ...timer,
      running: true,
      startedAt: Date.now(),
    }
  }

  if (message.type === 'timer:pause') {
    return {
      ...timer,
      running: false,
      baseMs: currentTimerMs(timer),
      startedAt: null,
    }
  }

  if (message.type === 'timer:reset') {
    return {
      mode: message.payload?.mode ?? timer.mode,
      running: false,
      baseMs: message.payload?.baseMs ?? 0,
      startedAt: null,
      targetAt: timer.targetAt ?? null,
    }
  }

  return timer
}

export function formatDuration(totalMs: number) {
  const totalSeconds = Math.floor(Math.max(0, totalMs) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatCountdown(totalMs: number) {
  const totalSeconds = Math.floor(Math.max(0, totalMs) / 1000)
  const days = Math.floor(totalSeconds / 86400)
  if (days === 0) return formatDuration(totalMs)

  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return `${days}d ${[hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':')}`
}

export function useSpotifyNowPlaying() {
  const [spotify, setSpotify] = useState<SpotifyNowPlaying>(() => readJson<SpotifyNowPlaying>(SPOTIFY_STORAGE_KEY) ?? idleSpotify)

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return

    const channel = new BroadcastChannel(OVERLAY_CHANNEL)

    channel.onmessage = (event: MessageEvent<OverlayMessage>) => {
      const message = event.data
      if (message.type !== 'spotify:update') return

      setSpotify((current) => {
        const next = { ...current, ...message.payload, updatedAt: Date.now() }
        writeJson(SPOTIFY_STORAGE_KEY, next)
        return next
      })
    }

    return () => channel.close()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function pollSpotify() {
      try {
        const response = await fetch('/api/spotify/current', { cache: 'no-store' })
        if (!response.ok) return

        const payload = (await response.json()) as SpotifyCurrentResponse
        if (!cancelled) {
          const next = {
            song: payload.song ?? idleSpotify.song,
            artist: payload.artist ?? idleSpotify.artist,
            durationMs: payload.durationMs ?? 0,
            progressMs: payload.progressMs ?? 0,
            isPlaying: payload.isPlaying ?? false,
            albumArtUrl: payload.albumArtUrl ?? '',
            updatedAt: payload.fetchedAt ?? Date.now(),
          }

          setSpotify(next)
          writeJson(SPOTIFY_STORAGE_KEY, next)
        }
      } catch {
        // OBS should stay quiet if the local helper server is temporarily unreachable.
      }
    }

    void pollSpotify()
    const interval = window.setInterval(pollSpotify, 2000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  const [now, setNow] = useState(0)

  useEffect(() => {
    let animationFrame = 0

    function tick() {
      setNow(Date.now())
      animationFrame = window.requestAnimationFrame(tick)
    }

    animationFrame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  return useMemo(() => {
    const elapsed = spotify.isPlaying && now > 0 ? now - spotify.updatedAt : 0
    const progressMs = clamp(spotify.progressMs + elapsed, 0, spotify.durationMs)
    const progress = spotify.durationMs > 0 ? (progressMs / spotify.durationMs) * 100 : 0

    return {
      ...spotify,
      progressMs,
      progress,
    }
  }, [now, spotify])
}

export function useSpotifyStatus() {
  const [status, setStatus] = useState<SpotifyStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      try {
        const response = await fetch('/api/spotify/status', { cache: 'no-store' })
        if (!response.ok) return

        const next = (await response.json()) as SpotifyStatus
        if (!cancelled) setStatus(next)
      } catch {
        if (!cancelled) {
          setStatus({
            configured: false,
            connected: false,
            redirectUri: 'https://localhost:5173/api/spotify/callback',
            scopes: [],
          })
        }
      }
    }

    void loadStatus()
    const interval = window.setInterval(loadStatus, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return status
}

export function useTwitchStatus() {
  const [status, setStatus] = useState<TwitchStatus | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadStatus() {
      try {
        const response = await fetch('/api/twitch/status', { cache: 'no-store' })
        if (!response.ok) return

        const next = (await response.json()) as TwitchStatus
        if (!cancelled) setStatus(next)
      } catch {
        if (!cancelled) {
          setStatus({
            configured: false,
            connected: false,
            live: false,
            channel: '',
            broadcaster: null,
            reader: null,
            redirectUri: 'https://localhost:5173/api/twitch/callback',
            scopes: [],
            subscriptions: [],
            errors: [],
          })
        }
      }
    }

    void loadStatus()
    const interval = window.setInterval(loadStatus, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return status
}

export function useTwitchChat() {
  const [messages, setMessages] = useState<TwitchChatMessage[]>([])
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    let cancelled = false

    async function pollChat() {
      try {
        const response = await fetch('/api/twitch/chat', { cache: 'no-store' })
        if (!response.ok) return

        const payload = (await response.json()) as { messages?: TwitchChatMessage[] }
        if (!cancelled) {
          setNow(Date.now())
          setMessages(payload.messages ?? [])
        }
      } catch {
        if (!cancelled) setMessages([])
      }
    }

    void pollChat()
    const interval = window.setInterval(pollChat, 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return messages.filter((message) => now - message.timestamp < 45_000).slice(-6)
}

function subscribeOverlayState(onState: (state: OverlayStateResponse) => void) {
  if (!('EventSource' in window)) return () => undefined

  const events = new EventSource('/api/overlay/events')

  events.addEventListener('state', (event) => {
    try {
      onState(JSON.parse((event as MessageEvent<string>).data) as OverlayStateResponse)
    } catch {
      // Ignore malformed event payloads and keep the polling fallback alive.
    }
  })

  return () => events.close()
}

export function useOverlayCamera() {
  const [camera, setCamera] = useState<OverlayCameraState>({ enabled: true })

  useEffect(() => {
    let cancelled = false

    function applyOverlayState(state: OverlayStateResponse) {
      if (!cancelled) setCamera((current) => normalizeCamera(state.camera, current))
    }

    async function pollOverlayState() {
      try {
        const response = await fetch('/api/overlay/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = (await response.json()) as OverlayStateResponse
        applyOverlayState(state)
      } catch {
        // Static preview routes do not provide the overlay API.
      }
    }

    void pollOverlayState()
    const unsubscribe = subscribeOverlayState(applyOverlayState)
    const interval = window.setInterval(pollOverlayState, 2000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  return camera
}

export function useOverlayInfoMode() {
  const [info, setInfo] = useState<OverlayModeState<InfoMode>>({ mode: 'timer' })

  useEffect(() => {
    let cancelled = false

    function applyOverlayState(state: OverlayStateResponse) {
      if (!cancelled) setInfo((current) => normalizeMode(state.info, current, ['spotify', 'valorant', 'premier', 'lifesteal', 'timer']))
    }

    async function pollOverlayState() {
      try {
        const response = await fetch('/api/overlay/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = (await response.json()) as OverlayStateResponse
        applyOverlayState(state)
      } catch {
        // Static preview routes do not provide the overlay API.
      }
    }

    void pollOverlayState()
    const unsubscribe = subscribeOverlayState(applyOverlayState)
    const interval = window.setInterval(pollOverlayState, 2000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  return info
}

export function useOverlayAdMode() {
  const [ad, setAd] = useState<OverlayModeState<AdMode>>({ mode: 'default' })

  useEffect(() => {
    let cancelled = false

    function applyOverlayState(state: OverlayStateResponse) {
      if (!cancelled) setAd((current) => normalizeMode(state.ad, current, ['default', 'minecraft']))
    }

    async function pollOverlayState() {
      try {
        const response = await fetch('/api/overlay/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = (await response.json()) as OverlayStateResponse
        applyOverlayState(state)
      } catch {
        // Static preview routes do not provide the overlay API.
      }
    }

    void pollOverlayState()
    const unsubscribe = subscribeOverlayState(applyOverlayState)
    const interval = window.setInterval(pollOverlayState, 2000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  return ad
}

export function useTwitchAlert() {
  const [alert, setAlert] = useState<TwitchAlert | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function pollAlerts() {
      try {
        const response = await fetch('/api/twitch/alerts', { cache: 'no-store' })
        if (!response.ok) return

        const payload = (await response.json()) as { current?: TwitchAlert | null }
        if (!cancelled) setAlert(payload.current ?? null)
      } catch {
        if (!cancelled) setAlert(null)
      }
    }

    void pollAlerts()
    const interval = window.setInterval(() => {
      setNow(Date.now())
      void pollAlerts()
    }, 1000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  if (!alert || now - alert.timestamp > 12_000) return null
  return alert
}

export function useLifestealOverlay() {
  const [state, setState] = useState<LifestealOverlayState>({
    hearts: overlayData.lifesteal.hearts,
    max: overlayData.lifesteal.max,
    configured: false,
    live: false,
    updatedAt: null,
  })

  useEffect(() => {
    if (!lifestealApiUrl) return

    let cancelled = false

    async function pollLifesteal() {
      try {
        const url = new URL(lifestealApiUrl)
        if (lifestealApiToken) url.searchParams.set('token', lifestealApiToken)

        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) return

        const payload = (await response.json()) as LifestealOverlayResponse
        if (cancelled) return

        setState((current) => ({
          hearts: payload.player?.hearts ?? current.hearts,
          max: overlayData.lifesteal.max,
          configured: Boolean(payload.configured),
          live: Boolean(payload.player),
          updatedAt: payload.player?.updated_at ?? current.updatedAt,
        }))
      } catch {
        if (!cancelled) {
          setState((current) => ({ ...current, live: false }))
        }
      }
    }

    void pollLifesteal()
    const interval = window.setInterval(pollLifesteal, 2000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [])

  return state
}

export function useOverlayGoals() {
  const [goals, setGoals] = useState<OverlayGoals>(overlayData.goals)

  useEffect(() => {
    let cancelled = false

    async function pollGoals() {
      try {
        const response = await fetch('/api/overlay/goals', { cache: 'no-store' })
        if (!response.ok) return

        const payload = (await response.json()) as OverlayGoalsResponse
        if (!cancelled) setGoals((current) => normalizeGoals(payload.goals, current))
      } catch {
        // Static preview routes do not provide the overlay API.
      }
    }

    void pollGoals()
    const unsubscribe = subscribeOverlayState(() => void pollGoals())
    const interval = window.setInterval(pollGoals, 5000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  return goals
}

export function useEventTimer() {
  const [timer, setTimer] = useState<EventTimerState>(() => readJson<EventTimerState>(TIMER_STORAGE_KEY) ?? initialTimer)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return

    const channel = new BroadcastChannel(OVERLAY_CHANNEL)

    channel.onmessage = (event: MessageEvent<OverlayMessage>) => {
      setTimer((current) => {
        const next = applyTimerMessage(current, event.data)
        writeJson(TIMER_STORAGE_KEY, next)
        return next
      })
    }

    return () => channel.close()
  }, [])

  useEffect(() => {
    let cancelled = false

    function applyOverlayState(state: OverlayStateResponse) {
      if (cancelled || !state.timer) return

      setTimer((current) => {
        const next = normalizeTimer(state.timer, current)
        writeJson(TIMER_STORAGE_KEY, next)
        return next
      })
    }

    async function pollOverlayState() {
      try {
        const response = await fetch('/api/overlay/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = (await response.json()) as OverlayStateResponse
        applyOverlayState(state)
      } catch {
        // Static preview routes do not provide the overlay API.
      }
    }

    void pollOverlayState()
    const unsubscribe = subscribeOverlayState(applyOverlayState)
    const interval = window.setInterval(pollOverlayState, 1000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextNow = Date.now()
      setNow(nextNow)
      setTimer((current) => {
        if (current.mode !== 'countdown' || !current.running || currentTimerMs(current, nextNow) > 0) return current

        const next = { ...current, running: false, baseMs: 0, startedAt: null }
        writeJson(TIMER_STORAGE_KEY, next)
        return next
      })
    }, 250)
    return () => window.clearInterval(interval)
  }, [])

  const displayMs = currentTimerMs(timer, now || timer.startedAt || 0)

  return {
    ...timer,
    displayMs,
    label: timer.mode === 'countdown' ? formatCountdown(displayMs) : formatDuration(displayMs),
  }
}

export function useEventTimerCard() {
  const [config, setConfig] = useState<EventTimerCardConfig>(overlayData.eventTimer)

  useEffect(() => {
    let cancelled = false

    function applyOverlayState(state: OverlayStateResponse) {
      if (!cancelled) setConfig((current) => normalizeEventTimer(state.eventTimer, current))
    }

    async function pollOverlayState() {
      try {
        const response = await fetch('/api/overlay/state', { cache: 'no-store' })
        if (!response.ok) return

        const state = (await response.json()) as OverlayStateResponse
        applyOverlayState(state)
      } catch {
        // Static preview routes do not provide the overlay API.
      }
    }

    void pollOverlayState()
    const unsubscribe = subscribeOverlayState(applyOverlayState)
    const interval = window.setInterval(pollOverlayState, 2000)

    return () => {
      cancelled = true
      unsubscribe()
      window.clearInterval(interval)
    }
  }, [])

  return config
}
