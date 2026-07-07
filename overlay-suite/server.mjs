import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const require = createRequire(import.meta.url)

loadDotEnv()

const localDir = join(root, '.local')
const tokenFile = join(localDir, 'spotify-tokens.json')
const stateFile = join(localDir, 'spotify-oauth-state.json')
const twitchTokenFile = join(localDir, 'twitch-tokens.json')
const twitchStateFile = join(localDir, 'twitch-oauth-state.json')
const overlayStateFile = join(localDir, 'overlay-state.json')
const port = Number(process.env.PORT ?? 5173)
const host = process.env.HOST ?? 'localhost'
const obsHttpPort = Number(process.env.OBS_HTTP_PORT ?? 5174)
const obsHttpHost = process.env.OBS_HTTP_HOST ?? '127.0.0.1'
const scopes = ['user-read-currently-playing', 'user-read-playback-state']
const twitchRedirectUri = process.env.TWITCH_REDIRECT_URI ?? `https://localhost:${port}/api/twitch/callback`
const localHttps = parseBoolean(process.env.OVERLAY_LOCAL_HTTPS, host === 'localhost' && new URL(twitchRedirectUri).protocol === 'https:')
const httpsKeyFile = process.env.HTTPS_KEY_FILE ?? join(localDir, 'localhost-key.pem')
const httpsCertFile = process.env.HTTPS_CERT_FILE ?? join(localDir, 'localhost-cert.pem')
const serverProtocol = localHttps ? 'https' : 'http'
const serverOrigin = `${serverProtocol}://${host}:${port}`
const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? `${serverOrigin}/api/spotify/callback`
const twitchScopes = ['user:read:chat', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read']
const isProduction = process.argv.includes('--production') || process.env.NODE_ENV === 'production'

const clientId = process.env.SPOTIFY_CLIENT_ID ?? ''
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? ''
const spotifyRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN ?? ''
const hasSpotifyConfig = Boolean(clientId && clientSecret && !clientId.startsWith('your_') && !clientSecret.startsWith('your_'))
const twitchClientId = process.env.TWITCH_CLIENT_ID ?? ''
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET ?? ''
const twitchChannelLogin = (process.env.TWITCH_CHANNEL ?? process.env.TWITCH_CHANNEL_NAME ?? '').trim().toLowerCase()
const twitchChannelId = (process.env.TWITCH_CHANNEL_ID ?? '').trim()
const twitchEnvAccessToken = normalizeToken(process.env.TWITCH_ACCESS_TOKEN ?? '')
const twitchEnvRefreshToken = normalizeToken(process.env.TWITCH_REFRESH_TOKEN ?? '')
const hasTwitchConfig = Boolean(
  twitchClientId &&
    twitchClientSecret &&
    twitchChannelLogin &&
    !twitchClientId.startsWith('your_') &&
    !twitchClientSecret.startsWith('your_'),
)

const twitchState = {
  connected: false,
  connecting: false,
  sessionId: '',
  broadcaster: null,
  reader: null,
  subscriptions: [],
  errors: [],
  chat: [],
  alerts: [],
  socket: null,
  reconnectTimer: null,
}

let twitchGoalsCache = {
  expiresAt: 0,
  payload: null,
}

let twitchAppTokenCache = {
  accessToken: '',
  expiresAt: 0,
}

let overlayStateWrite = Promise.resolve()

let sevenTvCache = {
  expiresAt: 0,
  emotes: new Map(),
}

let twitchBadgeCache = {
  expiresAt: 0,
  badges: new Map(),
}

const defaultOverlayState = {
  timer: {
    mode: 'countdown',
    running: true,
    baseMs: 0,
    startedAt: null,
    targetAt: Date.parse('2026-07-20T16:00:00.000Z'),
  },
  eventTimer: {
    title: 'LIFESTEAL COUNTDOWN',
    infoLabel: 'INFO',
    info: 'COUNTDOWN',
    purpose: 'START OF LIFESTEAL',
  },
  info: {
    mode: 'timer',
  },
  ad: {
    mode: 'default',
  },
  goals: {
    followers: 842,
    followerTarget: 900,
    subs: 14,
    subTarget: 25,
    lifestealSignups: 18,
    lifestealSignupTarget: 40,
  },
  camera: {
    enabled: true,
  },
}

const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

let vite

if (!isProduction) {
  const { createServer: createViteServer } = await import('vite')

  vite = await createViteServer({
    appType: 'spa',
    root,
    server: {
      middlewareMode: true,
    },
  })
}

const handleRequest = async (request, response) => {
  const url = new URL(request.url ?? '/', `${serverProtocol}://${request.headers.host ?? `${host}:${port}`}`)

  try {
    if (url.pathname.startsWith('/api/spotify/')) {
      await handleSpotifyApi(request, response, url)
      return
    }

    if (url.pathname.startsWith('/api/twitch/')) {
      await handleTwitchApi(request, response, url)
      return
    }

    if (url.pathname.startsWith('/api/overlay/')) {
      await handleOverlayApi(request, response, url)
      return
    }

    if (vite) {
      vite.middlewares(request, response)
      return
    }

    await serveStatic(response, url.pathname)
  } catch (error) {
    console.error(error)
    sendJson(response, 500, { error: 'Internal server error' })
  }
}

const httpsOptions = await loadHttpsOptions()
const server = httpsOptions ? createHttpsServer(httpsOptions, handleRequest) : createHttpServer(handleRequest)

server.listen(port, host, () => {
  console.log(`LUIGI overlay server: ${serverOrigin}`)
  console.log(`Config page: ${serverOrigin}/config`)
  if (hasTwitchConfig) void ensureTwitchEventSub()
})

if (httpsOptions) {
  const obsServer = createHttpServer(handleRequest)
  obsServer.listen(obsHttpPort, obsHttpHost, () => {
    console.log(`OBS browser source URL: http://${obsHttpHost}:${obsHttpPort}/gameplay`)
  })
}

async function loadHttpsOptions() {
  if (!localHttps) return null

  try {
    return {
      key: await readFile(httpsKeyFile),
      cert: await readFile(httpsCertFile),
    }
  } catch {
    const { default: selfsigned } = await import('selfsigned')
    const certificate = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
      algorithm: 'sha256',
      days: 365,
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 7, ip: '127.0.0.1' },
          ],
        },
      ],
    })

    await mkdir(dirname(httpsKeyFile), { recursive: true })
    await mkdir(dirname(httpsCertFile), { recursive: true })
    await writeFile(httpsKeyFile, certificate.private)
    await writeFile(httpsCertFile, certificate.cert)

    return {
      key: certificate.private,
      cert: certificate.cert,
    }
  }
}

function loadDotEnv() {
  loadEnvFile(join(root, '.env'))
  loadEnvFile(resolve(root, '..', '.env'), {
    onlyKeys: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'],
    overrideKeys: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET', 'SPOTIFY_REFRESH_TOKEN'],
  })
}

function loadEnvFile(envPath, options = {}) {
  try {
    const raw = require('node:fs').readFileSync(envPath, 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const separator = trimmed.indexOf('=')
      if (separator === -1) continue

      const key = trimmed.slice(0, separator).trim()
      const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
      if (options.onlyKeys && !options.onlyKeys.includes(key)) continue
      if (options.overrideKeys?.includes(key) || !process.env[key]) process.env[key] = value
    }
  } catch {
    // .env is optional.
  }
}

async function handleSpotifyApi(request, response, url) {
  if (url.pathname === '/api/spotify/status') {
    const tokens = await readJsonFile(tokenFile)
    sendJson(response, 200, {
      configured: hasSpotifyConfig,
      connected: Boolean(tokens?.refresh_token || spotifyRefreshToken),
      redirectUri,
      scopes,
    })
    return
  }

  if (url.pathname === '/api/spotify/login') {
    if (!hasSpotifyConfig) {
      sendJson(response, 400, {
        error: 'Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env',
        redirectUri,
      })
      return
    }

    const state = randomUUID()
    await writeJsonFile(stateFile, { state, createdAt: Date.now() })

    const authUrl = new URL('https://accounts.spotify.com/authorize')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('scope', scopes.join(' '))
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('state', state)

    redirect(response, authUrl.toString())
    return
  }

  if (url.pathname === '/api/spotify/callback') {
    await handleSpotifyCallback(response, url)
    return
  }

  if (url.pathname === '/api/spotify/current') {
    await handleCurrentSpotify(response)
    return
  }

  if (url.pathname === '/api/spotify/logout') {
    await rm(tokenFile, { force: true })
    sendJson(response, 200, { connected: false })
    return
  }

  sendJson(response, 404, { error: 'Unknown Spotify API route' })
}

async function handleTwitchApi(request, response, url) {
  if (url.pathname === '/api/twitch/status') {
    const tokens = await readJsonFile(twitchTokenFile)
    sendJson(response, 200, {
      configured: hasTwitchConfig,
      connected: Boolean(tokens?.refresh_token),
      live: twitchState.connected,
      channel: twitchChannelLogin,
      broadcaster: twitchState.broadcaster,
      reader: twitchState.reader,
      redirectUri: twitchRedirectUri,
      scopes: twitchScopes,
      subscriptions: twitchState.subscriptions,
      errors: twitchState.errors.slice(-5),
    })
    return
  }

  if (url.pathname === '/api/twitch/login') {
    if (!hasTwitchConfig) {
      sendJson(response, 400, {
        error: 'Missing TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, or TWITCH_CHANNEL in .env',
        redirectUri: twitchRedirectUri,
      })
      return
    }

    const state = randomUUID()
    await writeJsonFile(twitchStateFile, { state, createdAt: Date.now() })

    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize')
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('client_id', twitchClientId)
    authUrl.searchParams.set('redirect_uri', twitchRedirectUri)
    authUrl.searchParams.set('scope', twitchScopes.join(' '))
    authUrl.searchParams.set('state', state)

    redirect(response, authUrl.toString())
    return
  }

  if (url.pathname === '/api/twitch/callback') {
    await handleTwitchCallback(response, url)
    return
  }

  if (url.pathname === '/api/twitch/logout') {
    closeTwitchSocket()
    await rm(twitchTokenFile, { force: true })
    twitchState.connected = false
    twitchState.sessionId = ''
    twitchState.broadcaster = null
    twitchState.reader = null
    twitchState.subscriptions = []
    sendJson(response, 200, { connected: false })
    return
  }

  if (url.pathname === '/api/twitch/chat') {
    sendJson(response, 200, {
      connected: twitchState.connected,
      messages: twitchState.chat,
    })
    return
  }

  if (url.pathname === '/api/twitch/alerts') {
    sendJson(response, 200, {
      connected: twitchState.connected,
      alerts: twitchState.alerts,
      current: twitchState.alerts.at(-1) ?? null,
    })
    return
  }

  sendJson(response, 404, { error: 'Unknown Twitch API route' })
}

async function handleOverlayApi(request, response, url) {
  if (request.method === 'GET' && url.pathname === '/api/overlay/goals') {
    sendJson(response, 200, await readOverlayGoals())
    return
  }

  if (request.method === 'POST' && url.pathname.startsWith('/api/overlay/')) {
    const body = await readRequestJson(request)
    if (!body) {
      sendJson(response, 400, { error: 'Expected JSON body' })
      return
    }

    const action = overlayActionPayload(url.pathname, body)
    if (!action) {
      sendJson(response, 404, { error: 'Unknown overlay API route' })
      return
    }

    sendJson(response, 200, await updateOverlayState(action))
    return
  }

  if (url.pathname === '/api/overlay/state') {
    if (request.method === 'GET') {
      sendJson(response, 200, await readOverlayState())
      return
    }

    if (request.method === 'POST') {
      const body = await readRequestJson(request)
      if (!body) {
        sendJson(response, 400, { error: 'Expected JSON body' })
        return
      }

      const next = await updateOverlayState(body)
      sendJson(response, 200, next)
      return
    }
  }

  sendJson(response, 404, { error: 'Unknown overlay API route' })
}

function overlayActionPayload(pathname, body) {
  if (pathname === '/api/overlay/info') return { info: { mode: body.mode } }
  if (pathname === '/api/overlay/ad') return { ad: { mode: body.mode } }
  if (pathname === '/api/overlay/camera') return { camera: { enabled: body.enabled } }
  if (pathname === '/api/overlay/goals') return { goals: body.goals ?? body }
  if (pathname === '/api/overlay/timer') return { timer: body.timer ?? body, eventTimer: body.eventTimer }
  return null
}

async function handleTwitchCallback(response, url) {
  const expected = await readJsonFile(twitchStateFile)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    sendHtml(response, 400, resultPage('Twitch rejected the login', error, '/config'))
    return
  }

  if (!code || !state || state !== expected?.state) {
    sendHtml(response, 400, resultPage('Twitch login failed', 'The OAuth state did not match. Try logging in again.', '/config'))
    return
  }

  const payload = new URLSearchParams({
    client_id: twitchClientId,
    client_secret: twitchClientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: twitchRedirectUri,
  })

  const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  })

  const tokenBody = await tokenResponse.json()
  if (!tokenResponse.ok) {
    sendHtml(response, 400, resultPage('Twitch token exchange failed', tokenBody.message ?? tokenBody.error ?? 'Unknown error', '/config'))
    return
  }

  await writeJsonFile(twitchTokenFile, {
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    expires_at: Date.now() + tokenBody.expires_in * 1000,
    token_type: tokenBody.token_type,
    scope: tokenBody.scope,
  })

  await rm(twitchStateFile, { force: true })
  void ensureTwitchEventSub(true)
  sendHtml(response, 200, resultPage('Twitch connected', 'You can close this tab. The chat and alert widgets will update from Twitch.', '/config'))
}

async function handleSpotifyCallback(response, url) {
  const expected = await readJsonFile(stateFile)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    sendHtml(response, 400, spotifyResultPage('Spotify rejected the login', error))
    return
  }

  if (!code || !state || state !== expected?.state) {
    sendHtml(response, 400, spotifyResultPage('Spotify login failed', 'The OAuth state did not match. Try logging in again.'))
    return
  }

  const payload = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  })

  const tokenBody = await tokenResponse.json()
  if (!tokenResponse.ok) {
    sendHtml(response, 400, spotifyResultPage('Spotify token exchange failed', tokenBody.error_description ?? tokenBody.error ?? 'Unknown error'))
    return
  }

  await writeJsonFile(tokenFile, {
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token,
    expires_at: Date.now() + tokenBody.expires_in * 1000,
    token_type: tokenBody.token_type,
    scope: tokenBody.scope,
  })

  await rm(stateFile, { force: true })
  sendHtml(response, 200, spotifyResultPage('Spotify connected', 'You can close this tab. The OBS Spotify widget will update while music is playing.'))
}

async function handleCurrentSpotify(response) {
  if (!hasSpotifyConfig) {
    sendJson(response, 200, {
      connected: false,
      reason: 'missing-config',
      song: 'Spotify not configured',
      artist: 'Open /config',
      durationMs: 0,
      progressMs: 0,
      isPlaying: false,
      albumArtUrl: '',
    })
    return
  }

  const tokens = await getValidTokens()
  if (!tokens) {
    sendJson(response, 200, {
      connected: false,
      reason: 'not-connected',
      song: 'Spotify not connected',
      artist: 'Open /config',
      durationMs: 0,
      progressMs: 0,
      isPlaying: false,
      albumArtUrl: '',
    })
    return
  }

  const spotifyResponse = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  })

  if (spotifyResponse.status === 204) {
    sendJson(response, 200, {
      connected: true,
      song: 'No song playing',
      artist: 'Spotify',
      durationMs: 0,
      progressMs: 0,
      isPlaying: false,
      albumArtUrl: '',
    })
    return
  }

  if (!spotifyResponse.ok) {
    sendJson(response, spotifyResponse.status, {
      connected: true,
      error: 'spotify-api-error',
      status: spotifyResponse.status,
    })
    return
  }

  const payload = await spotifyResponse.json()
  const track = payload.item

  if (!track?.name) {
    sendJson(response, 200, {
      connected: true,
      song: 'No song playing',
      artist: 'Spotify',
      durationMs: 0,
      progressMs: 0,
      isPlaying: false,
      albumArtUrl: '',
    })
    return
  }

  sendJson(response, 200, {
    connected: true,
    song: track.name,
    artist: track.artists?.map((artist) => artist.name).filter(Boolean).join(', ') || 'Unknown artist',
    durationMs: track.duration_ms ?? 0,
    progressMs: payload.progress_ms ?? 0,
    isPlaying: payload.is_playing ?? false,
    albumArtUrl: track.album?.images?.[0]?.url ?? '',
    fetchedAt: Date.now(),
  })
}

async function getValidTokens() {
  const cachedTokens = await readJsonFile(tokenFile)
  const tokens = spotifyRefreshToken
    ? { ...cachedTokens, refresh_token: spotifyRefreshToken, expires_at: 0 }
    : cachedTokens
  if (!tokens?.refresh_token) return null

  if (tokens.access_token && tokens.expires_at > Date.now() + 60_000) return tokens

  const payload = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  })

  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload,
  })

  const tokenBody = await tokenResponse.json()
  if (!tokenResponse.ok) {
    console.error('Spotify refresh failed:', tokenBody)
    return null
  }

  const nextTokens = {
    ...tokens,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + tokenBody.expires_in * 1000,
    token_type: tokenBody.token_type,
    scope: tokenBody.scope ?? tokens.scope,
  }

  await writeJsonFile(tokenFile, nextTokens)
  return nextTokens
}

async function ensureTwitchEventSub(force = false) {
  if (!hasTwitchConfig || twitchState.connecting) return
  if (twitchState.connected && !force) return
  if (force) closeTwitchSocket()

  const tokens = await getValidTwitchTokens()
  if (!tokens) return

  twitchState.connecting = true
  twitchState.errors = []

  try {
    twitchState.reader = await getTwitchUser(tokens.access_token)
    twitchState.broadcaster = await getTwitchUser(tokens.access_token, twitchChannelLogin)

    if (!twitchState.reader?.id || !twitchState.broadcaster?.id) {
      throw new Error('Could not resolve Twitch channel or connected user.')
    }

    await openTwitchSocket(tokens.access_token)
  } catch (error) {
    pushTwitchError(error)
    scheduleTwitchReconnect()
  } finally {
    twitchState.connecting = false
  }
}

async function openTwitchSocket(accessToken) {
  if (!globalThis.WebSocket) {
    throw new Error('This Node.js runtime does not provide WebSocket. Use Node 22+ or add a WebSocket dependency.')
  }

  const socket = new WebSocket('wss://eventsub.wss.twitch.tv/ws')
  twitchState.socket = socket

  socket.addEventListener('open', () => {
    twitchState.connected = true
  })

  socket.addEventListener('message', (event) => {
    void handleTwitchSocketMessage(accessToken, event.data)
  })

  socket.addEventListener('close', () => {
    twitchState.connected = false
    twitchState.sessionId = ''
    if (twitchState.socket === socket) twitchState.socket = null
    scheduleTwitchReconnect()
  })

  socket.addEventListener('error', () => {
    pushTwitchError(new Error('Twitch EventSub WebSocket error.'))
  })
}

async function handleTwitchSocketMessage(accessToken, raw) {
  let payload
  try {
    payload = JSON.parse(String(raw))
  } catch {
    return
  }

  const messageType = payload.metadata?.message_type
  if (messageType === 'session_welcome') {
    twitchState.sessionId = payload.payload?.session?.id ?? ''
    await createTwitchSubscriptions(accessToken, twitchState.sessionId)
    return
  }

  if (messageType === 'session_reconnect') {
    const reconnectUrl = payload.payload?.session?.reconnect_url
    if (reconnectUrl) {
      closeTwitchSocket()
      const socket = new WebSocket(reconnectUrl)
      twitchState.socket = socket
      twitchState.connected = true
      socket.addEventListener('message', (event) => {
        void handleTwitchSocketMessage(accessToken, event.data)
      })
      socket.addEventListener('close', () => {
        twitchState.connected = false
        scheduleTwitchReconnect()
      })
    }
    return
  }

  if (messageType !== 'notification') return

  const subscriptionType = payload.payload?.subscription?.type
  const event = payload.payload?.event

  if (subscriptionType === 'channel.chat.message') {
    const chatterLogin = (event.chatter_user_login ?? '').toLowerCase()
    if (chatterLogin === 'shd_ttv_bot') return

    const fragments = await buildChatFragments(event.message)
    const badges = await buildChatBadges(event.badges)
    pushChatMessage({
      id: event.message_id ?? randomUUID(),
      user: event.chatter_user_name ?? event.chatter_user_login ?? 'viewer',
      message: fragments.map((fragment) => fragment.text).join(''),
      fragments,
      color: event.color || '',
      badges,
      timestamp: Date.now(),
    })
    return
  }

  if (subscriptionType === 'channel.chat.notification') {
    pushAlert(fromChatNotification(event))
    return
  }

  if (subscriptionType === 'channel.follow') {
    pushAlert({
      id: randomUUID(),
      kind: 'NEW FOLLOWER',
      name: event.user_name ?? event.user_login ?? 'New follower',
      detail: 'THANKS FOR YOUR FOLLOW!',
      timestamp: Date.now(),
    })
    return
  }

  if (subscriptionType === 'channel.subscribe') {
    pushAlert({
      id: randomUUID(),
      kind: 'NEW SUBSCRIBER',
      name: event.user_name ?? event.user_login ?? 'Subscriber',
      detail: event.is_gift ? 'GIFTED SUB' : 'THANKS FOR YOUR SUB',
      timestamp: Date.now(),
    })
    return
  }

  if (subscriptionType === 'channel.subscription.message') {
    const months = event.cumulative_months ?? event.duration_months ?? event.streak_months ?? 1
    pushAlert({
      id: randomUUID(),
      kind: 'RESUB',
      name: event.user_name ?? event.user_login ?? 'Subscriber',
      detail: `${months} MONTHS. THANKS!`,
      timestamp: Date.now(),
    })
    return
  }

  if (subscriptionType === 'channel.subscription.gift') {
    pushAlert({
      id: randomUUID(),
      kind: 'GIFTED SUBS',
      name: event.user_name ?? event.user_login ?? 'Anonymous',
      detail: `${event.total ?? 1} SUB${Number(event.total ?? 1) === 1 ? '' : 'S'} GIFTED`,
      timestamp: Date.now(),
    })
    return
  }

  if (subscriptionType === 'channel.raid') {
    pushAlert({
      id: randomUUID(),
      kind: 'RAID',
      name: event.from_broadcaster_user_name ?? event.from_broadcaster_user_login ?? 'Raid',
      detail: `${event.viewers ?? 0} VIEWERS`,
      timestamp: Date.now(),
    })
    return
  }

  if (subscriptionType === 'channel.cheer') {
    pushAlert({
      id: randomUUID(),
      kind: 'CHEER',
      name: event.user_name ?? event.user_login ?? 'Viewer',
      detail: `${event.bits ?? 0} BITS`,
      timestamp: Date.now(),
    })
  }
}

async function createTwitchSubscriptions(accessToken, sessionId) {
  const subscriptions = [
    {
      type: 'channel.chat.message',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
        user_id: twitchState.reader.id,
      },
    },
    {
      type: 'channel.chat.notification',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
        user_id: twitchState.reader.id,
      },
    },
    {
      type: 'channel.follow',
      version: '2',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
        moderator_user_id: twitchState.broadcaster.id,
      },
    },
    {
      type: 'channel.subscribe',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
      },
    },
    {
      type: 'channel.subscription.gift',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
      },
    },
    {
      type: 'channel.subscription.message',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
      },
    },
    {
      type: 'channel.raid',
      version: '1',
      condition: {
        to_broadcaster_user_id: twitchState.broadcaster.id,
      },
    },
    {
      type: 'channel.cheer',
      version: '1',
      condition: {
        broadcaster_user_id: twitchState.broadcaster.id,
      },
    },
  ]

  twitchState.subscriptions = []

  for (const subscription of subscriptions) {
    try {
      const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': twitchClientId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...subscription,
          transport: {
            method: 'websocket',
            session_id: sessionId,
          },
        }),
      })

      const body = await response.json()
      if (!response.ok) {
        pushTwitchError(new Error(`${subscription.type}: ${body.message ?? body.error ?? response.status}`))
        continue
      }

      twitchState.subscriptions.push(subscription.type)
    } catch (error) {
      pushTwitchError(error)
    }
  }
}

async function getTwitchUser(accessToken, login = '') {
  const url = new URL('https://api.twitch.tv/helix/users')
  if (login) url.searchParams.set('login', login)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': twitchClientId,
    },
  })

  const body = await response.json()
  if (!response.ok) throw new Error(body.message ?? 'Could not load Twitch user.')

  const user = body.data?.[0]
  return user
    ? {
        id: user.id,
        login: user.login,
        name: user.display_name,
      }
    : null
}

async function getValidTwitchTokens() {
  const tokens = (await readJsonFile(twitchTokenFile)) ?? envTwitchTokens()
  if (!tokens?.refresh_token) return null

  if (tokens.access_token && tokens.expires_at > Date.now() + 60_000) return tokens

  const payload = new URLSearchParams({
    client_id: twitchClientId,
    client_secret: twitchClientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
  })

  const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  })

  const tokenBody = await tokenResponse.json()
  if (!tokenResponse.ok) {
    console.error('Twitch refresh failed:', tokenBody)
    return null
  }

  const nextTokens = {
    ...tokens,
    access_token: tokenBody.access_token,
    refresh_token: tokenBody.refresh_token ?? tokens.refresh_token,
    expires_at: Date.now() + tokenBody.expires_in * 1000,
    token_type: tokenBody.token_type,
    scope: tokenBody.scope ?? tokens.scope,
  }

  await writeJsonFile(twitchTokenFile, nextTokens)
  return nextTokens
}

function envTwitchTokens() {
  if (!twitchEnvAccessToken && !twitchEnvRefreshToken) return null

  return {
    access_token: twitchEnvAccessToken,
    refresh_token: twitchEnvRefreshToken,
    expires_at: twitchEnvAccessToken ? Date.now() + 10 * 60_000 : 0,
    token_type: 'bearer',
    scope: '',
  }
}

function normalizeToken(token) {
  return token.replace(/^oauth:/i, '')
}

function parseBoolean(value, fallback) {
  if (value === undefined) return fallback
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function closeTwitchSocket() {
  if (twitchState.reconnectTimer) {
    clearTimeout(twitchState.reconnectTimer)
    twitchState.reconnectTimer = null
  }

  if (twitchState.socket) {
    const socket = twitchState.socket
    twitchState.socket = null
    try {
      socket.close()
    } catch {
      // The socket may already be closed.
    }
  }
}

function scheduleTwitchReconnect() {
  if (twitchState.reconnectTimer || !hasTwitchConfig) return
  twitchState.reconnectTimer = setTimeout(() => {
    twitchState.reconnectTimer = null
    void ensureTwitchEventSub(true)
  }, 5000)
}

function pushChatMessage(message) {
  if (!message.message) return
  twitchState.chat = [...twitchState.chat, message].slice(-24)
}

function pushAlert(alert) {
  if (!alert?.name) return
  twitchState.alerts = [...twitchState.alerts, alert].slice(-12)
}

function pushTwitchError(error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error('Twitch:', message)
  twitchState.errors = [...twitchState.errors, message].slice(-10)
}

function flattenTwitchMessage(message) {
  if (message?.text) return message.text
  if (Array.isArray(message?.fragments)) {
    return message.fragments.map((fragment) => fragment.text ?? '').join('')
  }
  return ''
}

async function buildChatFragments(message) {
  const source = Array.isArray(message?.fragments) ? message.fragments : [{ type: 'text', text: flattenTwitchMessage(message) }]
  const sevenTvEmotes = await getSevenTvEmotes()
  const fragments = []

  for (const fragment of source) {
    const text = fragment.text ?? ''
    if (!text) continue

    const twitchEmoteId = fragment.emote?.id
    if (fragment.type === 'emote' && twitchEmoteId) {
      fragments.push({
        type: 'emote',
        text,
        url: `https://static-cdn.jtvnw.net/emoticons/v2/${twitchEmoteId}/default/dark/2.0`,
      })
      continue
    }

    fragments.push(...replaceSevenTvEmotes(text, sevenTvEmotes))
  }

  return fragments
}

async function buildChatBadges(badges = []) {
  const badgeMap = await getTwitchBadges()

  return badges
    .map((badge) => {
      const setId = badge.set_id ?? ''
      const id = badge.id ?? ''
      const url = badgeMap.get(`${setId}:${id}`) ?? badgeMap.get(`${setId}:1`) ?? ''
      return { setId, id, url }
    })
    .filter((badge) => badge.setId && badge.id && badge.url)
}

async function getTwitchBadges() {
  if (twitchBadgeCache.expiresAt > Date.now()) return twitchBadgeCache.badges

  const badges = new Map()
  const tokens = await getValidTwitchTokens()
  if (!tokens?.access_token) return badges

  for (const path of ['/chat/badges/global', `/chat/badges?broadcaster_id=${twitchState.broadcaster?.id ?? twitchChannelId}`]) {
    try {
      const response = await fetch(`https://api.twitch.tv/helix${path}`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          'Client-Id': twitchClientId,
        },
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.message ?? `Twitch badges ${response.status}`)

      for (const set of body.data ?? []) {
        for (const version of set.versions ?? []) {
          if (set.set_id && version.id && version.image_url_2x) {
            badges.set(`${set.set_id}:${version.id}`, version.image_url_2x)
          }
        }
      }
    } catch (error) {
      pushTwitchError(error)
    }
  }

  twitchBadgeCache = {
    expiresAt: Date.now() + (badges.size ? 60 * 60_000 : 60_000),
    badges,
  }

  return badges
}

function replaceSevenTvEmotes(text, emotes) {
  if (!emotes.size) return [{ type: 'text', text }]

  const fragments = []
  for (const part of text.split(/(\s+)/)) {
    const emote = emotes.get(part)
    if (emote) {
      fragments.push({ type: 'emote', text: part, url: emote })
    } else if (part) {
      fragments.push({ type: 'text', text: part })
    }
  }

  return fragments
}

async function getSevenTvEmotes() {
  if (sevenTvCache.expiresAt > Date.now()) return sevenTvCache.emotes
  if (!twitchChannelId) return new Map()

  try {
    const body = await fetchSevenTvJson(`/v3/users/twitch/${twitchChannelId}`)
    const emotes = new Map()
    for (const emote of body.emote_set?.emotes ?? []) {
      const url = sevenTvEmoteUrl(emote)
      if (!emote.name || !url) continue
      emotes.set(emote.name, url)
    }

    sevenTvCache = {
      expiresAt: Date.now() + 10 * 60_000,
      emotes,
    }
  } catch (error) {
    sevenTvCache = {
      expiresAt: Date.now() + 60_000,
      emotes: new Map(),
    }
  }

  return sevenTvCache.emotes
}

async function fetchSevenTvJson(path) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'SHD-OBS-Overlay/1.0',
  }

  for (const origin of ['https://7tv.io', 'https://api.7tv.app']) {
    const response = await fetch(`${origin}${path}`, { headers })
    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('application/json')) continue
    return response.json()
  }

  throw new Error('7TV unavailable')
}

function sevenTvEmoteUrl(emote) {
  const files = emote.data?.host?.files ?? []
  const file = files.find((candidate) => candidate.name === '2x.webp') ?? files.find((candidate) => candidate.format === 'WEBP') ?? files.at(-1)
  const hostUrl = emote.data?.host?.url

  if (!hostUrl || !file?.name) return ''
  return `https:${hostUrl}/${file.name}`
}

function fromChatNotification(event) {
  const noticeType = event.notice_type ?? ''
  const user = event.chatter_user_name ?? event.chatter_user_login ?? event.user_name ?? 'Viewer'
  const message = flattenTwitchMessage(event.message)

  if (noticeType.includes('sub')) {
    const months = event.cumulative_months ?? event.sub?.cumulative_months ?? event.resub?.cumulative_months ?? event.sub_gift?.cumulative_months
    return {
      id: randomUUID(),
      kind: noticeType.includes('resub') ? 'RESUB' : noticeType.includes('gift') ? 'GIFTED SUB' : 'NEW SUBSCRIBER',
      name: user,
      detail: noticeType.includes('resub') && months ? `${months} MONTHS. THANKS!` : message || 'THANKS FOR YOUR SUB',
      timestamp: Date.now(),
    }
  }

  if (noticeType.includes('raid')) {
    return {
      id: randomUUID(),
      kind: 'RAID',
      name: user,
      detail: 'WELCOME RAIDERS',
      timestamp: Date.now(),
    }
  }

  if (noticeType.includes('cheer')) {
    return {
      id: randomUUID(),
      kind: 'CHEER',
      name: user,
      detail: message || 'THANK YOU',
      timestamp: Date.now(),
    }
  }

  return {
    id: randomUUID(),
    kind: 'TWITCH EVENT',
    name: user,
    detail: message || 'THANK YOU',
    timestamp: Date.now(),
  }
}

async function serveStatic(response, pathname) {
  const distRoot = resolve(root, 'dist')
  const requested = resolve(distRoot, `.${decodeURIComponent(pathname)}`)
  const candidate = requested.startsWith(distRoot) ? requested : join(distRoot, 'index.html')
  const file = await getExistingFile(candidate)
  const fallback = file ?? join(distRoot, 'index.html')

  response.writeHead(200, {
    'Content-Type': mimeTypes.get(extname(fallback)) ?? 'application/octet-stream',
  })
  createReadStream(fallback).pipe(response)
}

async function getExistingFile(path) {
  try {
    const details = await stat(path)
    if (details.isFile()) return path
  } catch {
    return null
  }

  return null
}

async function readOverlayState() {
  const stored = await readJsonFile(overlayStateFile)

  return {
    timer: {
      ...defaultOverlayState.timer,
      ...(stored?.timer && typeof stored.timer === 'object' ? stored.timer : {}),
    },
    eventTimer: {
      ...defaultOverlayState.eventTimer,
      ...(stored?.eventTimer && typeof stored.eventTimer === 'object' ? stored.eventTimer : {}),
    },
    info: {
      ...defaultOverlayState.info,
      ...(stored?.info && typeof stored.info === 'object' ? stored.info : {}),
    },
    ad: {
      ...defaultOverlayState.ad,
      ...(stored?.ad && typeof stored.ad === 'object' ? stored.ad : {}),
    },
    goals: {
      ...defaultOverlayState.goals,
      ...(stored?.goals && typeof stored.goals === 'object' ? stored.goals : {}),
    },
    camera: {
      ...defaultOverlayState.camera,
      ...(stored?.camera && typeof stored.camera === 'object' ? stored.camera : {}),
    },
  }
}

async function updateOverlayState(payload) {
  overlayStateWrite = overlayStateWrite.catch(() => null).then(() => applyOverlayStateUpdate(payload))
  return overlayStateWrite
}

async function applyOverlayStateUpdate(payload) {
  const current = await readOverlayState()
  const next = {
    ...current,
    timer: {
      ...current.timer,
      ...sanitizeTimerState(payload.timer),
    },
    eventTimer: {
      ...current.eventTimer,
      ...sanitizeEventTimer(payload.eventTimer),
    },
    info: {
      ...current.info,
      ...sanitizeMode(payload.info, ['spotify', 'valorant', 'premier', 'lifesteal', 'timer']),
    },
    ad: {
      ...current.ad,
      ...sanitizeMode(payload.ad, ['default', 'minecraft']),
    },
    goals: {
      ...current.goals,
      ...sanitizeGoals(payload.goals),
    },
    camera: {
      ...current.camera,
      ...sanitizeCamera(payload.camera),
    },
  }

  await writeJsonFile(overlayStateFile, next)
  return next
}

async function readOverlayGoals() {
  const state = await readOverlayState()
  const twitchGoals = await getTwitchGoalCounts()
  const goals = {
    ...state.goals,
    followers: twitchGoals.followers ?? state.goals.followers,
    subs: twitchGoals.subs ?? state.goals.subs,
  }

  return {
    connected: twitchGoals.connected,
    updatedAt: Date.now(),
    goals,
    errors: twitchGoals.errors,
  }
}

async function getTwitchGoalCounts() {
  if (twitchGoalsCache.payload && twitchGoalsCache.expiresAt > Date.now()) return twitchGoalsCache.payload

  const payload = {
    connected: false,
    followers: null,
    subs: null,
    errors: [],
  }

  if (!hasTwitchConfig) {
    payload.errors.push('Missing Twitch configuration.')
    return cacheTwitchGoals(payload)
  }

  const tokens = await getValidTwitchTokens()
  if (!tokens?.access_token) {
    payload.errors.push('Twitch is not connected.')
    return cacheTwitchGoals(payload)
  }

  try {
    if (!twitchState.broadcaster?.id && twitchChannelId) {
      twitchState.broadcaster = {
        id: twitchChannelId,
        login: twitchChannelLogin,
        name: twitchChannelLogin,
      }
    }

    if (!twitchState.broadcaster?.id) {
      twitchState.broadcaster = await getTwitchUser(tokens.access_token, twitchChannelLogin)
    }

    if (!twitchState.broadcaster?.id) throw new Error('Could not resolve Twitch channel.')

    const [followers, subs] = await Promise.all([
      getTwitchFollowerCount(tokens.access_token, twitchState.broadcaster.id),
      getTwitchSubCount(tokens.access_token, twitchState.broadcaster.id),
    ])
    const appFollowers = followers.value === null ? await getTwitchFollowerCountWithAppToken() : { value: null, errors: [] }

    payload.followers = followers.value ?? appFollowers.value
    payload.subs = subs.value
    payload.connected = payload.followers !== null || payload.subs !== null
    payload.errors = [...(appFollowers.value !== null ? [] : followers.errors), ...appFollowers.errors, ...subs.errors]
  } catch (error) {
    payload.errors.push(error instanceof Error ? error.message : String(error))

    const followers = await getTwitchFollowerCountWithAppToken()
    payload.followers = followers.value
    payload.connected = payload.followers !== null
    payload.errors.push(...followers.errors)
  }

  return cacheTwitchGoals(payload)
}

function cacheTwitchGoals(payload) {
  twitchGoalsCache = {
    expiresAt: Date.now() + 60_000,
    payload,
  }

  return payload
}

async function getTwitchFollowerCount(accessToken, broadcasterId) {
  const url = new URL('https://api.twitch.tv/helix/channels/followers')
  url.searchParams.set('broadcaster_id', broadcasterId)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': twitchClientId,
    },
  })
  const body = await response.json()

  if (!response.ok) {
    return { value: null, errors: [`followers: ${body.message ?? body.error ?? response.status}`] }
  }

  return { value: Number.isFinite(body.total) ? body.total : null, errors: [] }
}

async function getTwitchFollowerCountWithAppToken() {
  if (!twitchChannelId) return { value: null, errors: ['followers: missing TWITCH_CHANNEL_ID'] }

  const accessToken = await getTwitchAppAccessToken()
  if (!accessToken) return { value: null, errors: ['followers: could not create Twitch app token'] }

  return getTwitchFollowerCount(accessToken, twitchChannelId)
}

async function getTwitchAppAccessToken() {
  if (twitchAppTokenCache.accessToken && twitchAppTokenCache.expiresAt > Date.now() + 60_000) {
    return twitchAppTokenCache.accessToken
  }

  if (!twitchClientId || !twitchClientSecret) return ''

  const payload = new URLSearchParams({
    client_id: twitchClientId,
    client_secret: twitchClientSecret,
    grant_type: 'client_credentials',
  })

  const response = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  })
  const body = await response.json()

  if (!response.ok) {
    pushTwitchError(new Error(`App token: ${body.message ?? body.error ?? response.status}`))
    return ''
  }

  twitchAppTokenCache = {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  }

  return twitchAppTokenCache.accessToken
}

async function getTwitchSubCount(accessToken, broadcasterId) {
  const url = new URL('https://api.twitch.tv/helix/subscriptions')
  url.searchParams.set('broadcaster_id', broadcasterId)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Client-Id': twitchClientId,
    },
  })
  const body = await response.json()

  if (!response.ok) {
    return { value: null, errors: [`subs: ${body.message ?? body.error ?? response.status}`] }
  }

  return { value: Number.isFinite(body.total) ? body.total : null, errors: [] }
}

function sanitizeTimerState(value) {
  if (!value || typeof value !== 'object') return {}

  const next = {}
  if (value.mode === 'stopwatch' || value.mode === 'countdown') next.mode = value.mode
  if (typeof value.running === 'boolean') next.running = value.running
  if (Number.isFinite(value.baseMs)) next.baseMs = Math.max(0, Math.floor(value.baseMs))
  if (value.startedAt === null || Number.isFinite(value.startedAt)) next.startedAt = value.startedAt === null ? null : Math.floor(value.startedAt)
  if (value.targetAt === null || Number.isFinite(value.targetAt)) next.targetAt = value.targetAt === null ? null : Math.floor(value.targetAt)

  return next
}

function sanitizeEventTimer(value) {
  if (!value || typeof value !== 'object') return {}

  return Object.fromEntries(
    ['title', 'infoLabel', 'info', 'purpose']
      .filter((key) => typeof value[key] === 'string')
      .map((key) => [key, value[key].trim().slice(0, 48)]),
  )
}

function sanitizeMode(value, allowed) {
  if (!value || typeof value !== 'object') return {}
  return allowed.includes(value.mode) ? { mode: value.mode } : {}
}

function sanitizeGoals(value) {
  if (!value || typeof value !== 'object') return {}

  const next = {}
  for (const key of ['followers', 'followerTarget', 'subs', 'subTarget', 'lifestealSignups', 'lifestealSignupTarget']) {
    if (Number.isFinite(value[key])) next[key] = Math.max(0, Math.floor(value[key]))
  }

  return next
}

function sanitizeCamera(value) {
  if (!value || typeof value !== 'object') return {}
  return typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}
}

async function readRequestJson(request) {
  const chunks = []

  for await (const chunk of request) {
    chunks.push(chunk)
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

async function readJsonFile(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

async function writeJsonFile(path, value) {
  await mkdir(localDir, { recursive: true })
  await writeFile(path, JSON.stringify(value, null, 2))
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(html)
}

function redirect(response, location) {
  response.writeHead(302, { Location: location })
  response.end()
}

function resultPage(title, detail, backHref) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #090909;
        color: #f5f5f5;
        font-family: Inter, system-ui, sans-serif;
      }
      main {
        width: min(520px, calc(100vw - 48px));
        border: 1px solid rgba(216, 191, 138, 0.22);
        padding: 28px;
        background: #121212;
      }
      h1 {
        margin: 0 0 12px;
        color: #d8bf8a;
        font: 500 24px Montserrat, system-ui, sans-serif;
      }
      p {
        margin: 0 0 20px;
        color: #c9c7c0;
        line-height: 1.5;
      }
      a {
        color: #d8bf8a;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
      <a href="${escapeHtml(backHref)}">Back to config</a>
    </main>
  </body>
</html>`
}

function spotifyResultPage(title, detail) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: #090909;
        color: #f5f5f5;
        font-family: Inter, system-ui, sans-serif;
      }
      main {
        width: min(520px, calc(100vw - 48px));
        border: 1px solid rgba(216, 191, 138, 0.22);
        padding: 28px;
        background: #121212;
      }
      h1 {
        margin: 0 0 12px;
        color: #d8bf8a;
        font: 500 24px Montserrat, system-ui, sans-serif;
      }
      p {
        margin: 0 0 20px;
        color: #c9c7c0;
        line-height: 1.5;
      }
      a {
        color: #d8bf8a;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(detail)}</p>
      <a href="/config">Back to config</a>
    </main>
  </body>
</html>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}
