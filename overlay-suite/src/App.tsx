import './App.css'
import { useEffect, useState } from 'react'
import lifestealHeart from './assets/lifesteal-heart.png'
import luigiMark from './assets/luigi-mark.png'
import {
  useEventTimer,
  useEventTimerCard,
  useLifestealOverlay,
  useOverlayAdMode,
  useOverlayGoals,
  useOverlayCamera,
  useOverlayInfoMode,
  useSpotifyNowPlaying,
  useSpotifyStatus,
  useTwitchAlert,
  useTwitchChat,
  useTwitchStatus,
} from './liveData'
import { boxes, canvas, overlayData, type WidgetBox } from './overlayConfig'

type Route =
  | 'hub'
  | 'layout'
  | 'starting'
  | 'brb'
  | 'spotify'
  | 'challenge'
  | 'camera-frame'
  | 'chat-widget'
  | 'chat-widget-clean'
  | 'alert-widget'
  | 'config'
  | 'hud'
  | 'gameplay'

const links: Array<{ label: string; path: string }> = [
  { label: 'Layout Template', path: '/layout' },
  { label: 'Spotify Widget', path: '/spotify' },
  { label: 'Challenge Widget', path: '/challenge?mode=timer' },
  { label: 'Lifesteal Widget', path: '/challenge?mode=lifesteal' },
  { label: 'Camera Frame', path: '/camera-frame' },
  { label: 'Chat Widget', path: '/chat-widget' },
  { label: 'Chat Clean', path: '/chat-widget-clean' },
  { label: 'Alert Widget', path: '/alert-widget' },
  { label: 'Gameplay Overlay', path: '/gameplay' },
  { label: 'Starting Soon', path: '/starting' },
  { label: 'BRB', path: '/brb' },
  { label: 'Config', path: '/config' },
]

const data = overlayData

function routeFromPath(): Route {
  const segments = window.location.pathname.split('/').filter(Boolean)
  const lastSegment = segments.at(-1) ?? ''
  const path = (isKnownRoute(lastSegment) ? lastSegment : segments[0] ?? '') as Route
  if (isKnownRoute(path)) return path
  return 'hub'
}

function isKnownRoute(path: string): path is Route {
  if (
    ['layout', 'starting', 'brb', 'spotify', 'challenge', 'camera-frame', 'chat-widget', 'chat-widget-clean', 'alert-widget', 'config', 'hud', 'gameplay'].includes(
      path,
    )
  ) {
    return true
  }
  return false
}

function query(name: string, fallback: string) {
  return new URLSearchParams(window.location.search).get(name) ?? fallback
}

function LogoMark({ small = false }: { small?: boolean }) {
  return <img className={small ? 'logo-mark small' : 'logo-mark'} src={luigiMark} alt="LUIGI" />
}

function Corners() {
  return (
    <>
      <span className="corner tl" />
      <span className="corner tr" />
      <span className="corner bl" />
      <span className="corner br" />
    </>
  )
}

function Canvas({
  children,
  transparent = true,
}: {
  children: React.ReactNode
  transparent?: boolean
}) {
  return <main className={transparent ? 'obs-canvas' : 'scene-canvas'}>{children}</main>
}

function Placed({ box, children }: { box: WidgetBox; children: React.ReactNode }) {
  return (
    <div
      className="placed"
      style={{
        left: `${(box.x / canvas.w) * 100}%`,
        top: `${(box.y / canvas.h) * 100}%`,
        width: `${(box.w / canvas.w) * 100}%`,
        height: `${(box.h / canvas.h) * 100}%`,
      }}
    >
      {children}
    </div>
  )
}

function AlbumArt({ src }: { src: string }) {
  return (
    <div className="album-art" aria-hidden="true">
      {src ? <img src={src} alt="" /> : <span />}
    </div>
  )
}

function SpotifyWidget() {
  const spotify = useSpotifyNowPlaying()

  return (
    <section className="spotify-widget glass-widget">
      <Corners />
      <div className="widget-label">SPOTIFY</div>
      <AlbumArt src={spotify.albumArtUrl} />
      <div className="track-copy">
        <div className="track-title">{spotify.song}</div>
        <div className="track-artist">{spotify.artist}</div>
      </div>
      <div className="song-line">
        <span style={{ width: `${spotify.progress}%` }} />
      </div>
    </section>
  )
}

function ChallengeWidget() {
  const mode = query('mode', 'timer')
  const timer = useEventTimer()
  const lifesteal = useLifestealOverlay()

  return (
    <section className={`challenge-widget glass-widget ${mode}`}>
      <Corners />
      <div className="widget-label">
        {mode === 'lifesteal' ? 'LIFESTEAL' : mode === 'valorant' ? 'VALORANT' : 'CHALLENGE'}
      </div>
      {mode === 'lifesteal' ? (
        <div className="lifesteal-readout">
          <img className="lifesteal-heart" src={lifestealHeart} alt="" />
          <strong>{lifesteal.hearts}</strong>
          <span>/</span>
          <strong>{lifesteal.max}</strong>
        </div>
      ) : mode === 'valorant' ? (
        <div className="valorant-readout">
          <strong>{data.valorant.rank}</strong>
          <span>{data.valorant.rr}</span>
          <em>Peak: {data.valorant.peak}</em>
        </div>
      ) : (
        <div className="timer-readout">{timer.label}</div>
      )}
    </section>
  )
}

function InfoBar() {
  const { mode } = useOverlayInfoMode()
  const spotify = useSpotifyNowPlaying()
  const timer = useEventTimer()
  const eventTimer = useEventTimerCard()
  const lifesteal = useLifestealOverlay()

  return (
    <section className="info-bar glass-widget">
      <Corners />
      {mode === 'valorant' ? (
        <div className="info-valorant">
          <img className="valorant-rank-icon" src={`/ranks/${data.valorant.rankIcon}`} alt="" />
          <div className="valorant-main">
            <span>VALORANT</span>
            <strong>{data.valorant.rank}</strong>
          </div>
          <div className="valorant-side">
            <span>RR</span>
            <em>{data.valorant.rr}</em>
          </div>
          <div className="valorant-peak">
            <span>PEAK</span>
            <em>{data.valorant.peak}</em>
          </div>
        </div>
      ) : mode === 'premier' ? (
        <div className="info-premier">
          <div className="premier-emblem">SHD</div>
          <div className="premier-main">
            <span>PREMIER</span>
            <strong>
              {data.premier.name} <em>{data.premier.tag}</em>
            </strong>
          </div>
          <div className="premier-stat division">
            <span>DIVISION</span>
            <strong>{data.premier.division}</strong>
          </div>
          <div className="premier-stat points">
            <span>POINTS</span>
            <strong>{data.premier.points}</strong>
          </div>
          <div className="premier-stat place">
            <span>PLACE</span>
            <strong>{data.premier.place}</strong>
          </div>
          <div className="premier-stat record">
            <span>W/L</span>
            <strong>
              {data.premier.gamesWon}-{data.premier.gamesLost}
            </strong>
          </div>
        </div>
      ) : mode === 'lifesteal' ? (
        <div className="info-lifesteal">
          <img className="lifesteal-heart" src={lifestealHeart} alt="" />
          <div className="lifesteal-main">
            <span>LIFESTEAL</span>
            <strong>
              {lifesteal.hearts}/{lifesteal.max}
            </strong>
          </div>
          <div className="lifesteal-stat">
            <span>KILLS</span>
            <strong>{data.lifesteal.kills}</strong>
          </div>
          <div className="lifesteal-stat">
            <span>SIGNUPS</span>
            <strong>
              {data.lifesteal.signups}/{data.lifesteal.signupTarget}
            </strong>
          </div>
          <div className="lifesteal-state">
            <span>STATUS</span>
            <strong>{lifesteal.live ? 'LIVE' : data.lifesteal.status}</strong>
          </div>
        </div>
      ) : mode === 'timer' ? (
        <div className="info-timer">
          <LogoMark small />
          <div className="timer-main">
            <span>{eventTimer.title}</span>
            <strong>{timer.label}</strong>
          </div>
          <div className="timer-side">
            <span>{eventTimer.infoLabel}</span>
            <em>{eventTimer.info}</em>
          </div>
          <div className="timer-detail">
            <span>FOR</span>
            <em>{eventTimer.purpose}</em>
          </div>
        </div>
      ) : (
        <div className="info-spotify">
          <AlbumArt src={spotify.albumArtUrl} />
          <div className="track-copy">
            <div className="track-title">
              {spotify.song}
              {spotify.artist ? <span> - {spotify.artist}</span> : null}
            </div>
            <div className="song-line">
              <span style={{ width: `${spotify.progress}%` }} />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function ChatWidget({ borderless = false }: { borderless?: boolean }) {
  const messages = useTwitchChat()

  return (
    <aside className={borderless ? 'chat-widget chat-widget-clean' : 'chat-widget'}>
      <div className="messages">
        {messages.map((message) => (
          <p key={message.id}>
            {message.badges.map((badge) =>
              typeof badge === 'string' || !badge.url ? null : (
                <img className="badge" src={badge.url} alt={badge.setId} key={`${badge.setId}-${badge.id}`} title={badge.setId} />
              ),
            )}
            <strong>{message.user}</strong>
            <span className="chat-separator">:</span>{' '}
            {(message.fragments?.length ? message.fragments : [{ type: 'text' as const, text: message.message }]).map((fragment, index) =>
              fragment.type === 'emote' ? (
                <img className="chat-emote" src={fragment.url} alt={fragment.text} key={`${message.id}-${index}`} />
              ) : (
                <span key={`${message.id}-${index}`}>{fragment.text}</span>
              ),
            )}
          </p>
        ))}
      </div>
    </aside>
  )
}

function SponsorAd() {
  const { mode } = useOverlayAdMode()
  const items = mode === 'minecraft' ? data.ads.minecraft : data.ads.default
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => setIndex((current) => (current + 1) % items.length), 15000)
    return () => window.clearInterval(interval)
  }, [items.length])

  return (
    <section className="sponsor-strip">
      <LogoMark small />
      <span>{items[index]}</span>
    </section>
  )
}

function GoalsStrip() {
  const goals = useOverlayGoals()
  const followerProgress = progress(goals.followers, goals.followerTarget)
  const lifestealProgress = progress(goals.lifestealSignups, goals.lifestealSignupTarget)

  return (
    <section className="goals-strip">
      <div className="goal-metric with-meter">
        <span>FOLLOWERS</span>
        <strong>
          {goals.followers}/{goals.followerTarget}
        </strong>
        <div className="goal-meter">
          <span style={{ width: `${followerProgress}%` }} />
        </div>
      </div>
      <div className="goal-metric compact">
        <span>SUBS</span>
        <strong>
          {goals.subs}/{goals.subTarget}
        </strong>
      </div>
      <div className="goal-metric with-meter">
        <span>LIFESTEAL</span>
        <strong>
          {goals.lifestealSignups}/{goals.lifestealSignupTarget}
        </strong>
        <div className="goal-meter">
          <span style={{ width: `${lifestealProgress}%` }} />
        </div>
      </div>
    </section>
  )
}

function progress(value: number, target: number) {
  if (target <= 0) return 0
  return Math.min(100, (value / target) * 100)
}

function CameraFrame() {
  return (
    <section className="camera-frame" aria-label="Camera frame">
      <div className="camera-outline">
        <span className="camera-edge top left-half" />
        <span className="camera-edge top right-half" />
        <span className="camera-edge right top-half" />
        <span className="camera-edge right bottom-half" />
        <span className="camera-edge bottom left-half" />
        <span className="camera-edge bottom right-half" />
        <span className="camera-edge left top-half" />
        <span className="camera-edge left bottom-half" />
        <div className="camera-logo">
          <LogoMark small />
        </div>
      </div>
    </section>
  )
}

function AlertWidget() {
  const alert = useTwitchAlert()
  if (!alert) return null

  return (
    <section className="alert-widget glass-widget">
      <Corners />
      <LogoMark />
      <div className="alert-kind">{alert.kind}</div>
      <div className="alert-name">{alert.name}</div>
      <div className="alert-detail">{alert.detail}</div>
    </section>
  )
}

function ConfigPage() {
  const status = useSpotifyStatus()
  const twitchStatus = useTwitchStatus()

  async function disconnectSpotify() {
    await fetch('/api/spotify/logout', { method: 'POST' })
    window.location.reload()
  }

  async function disconnectTwitch() {
    await fetch('/api/twitch/logout', { method: 'POST' })
    window.location.reload()
  }

  return (
    <Canvas transparent={false}>
      <section className="config-page">
        <LogoMark small />
        <div>
          <div className="config-kicker">LOCAL CONFIG</div>
          <h1>Integrations</h1>
        </div>
        <div className="config-panel">
          <h2>Spotify</h2>
          <div className="config-row">
            <span>Credentials</span>
            <strong className={status?.configured ? 'status-good' : 'status-bad'}>
              {status ? (status.configured ? 'Ready' : 'Missing') : 'Checking'}
            </strong>
          </div>
          <div className="config-row">
            <span>Connection</span>
            <strong className={status?.connected ? 'status-good' : 'status-bad'}>
              {status ? (status.connected ? 'Connected' : 'Disconnected') : 'Checking'}
            </strong>
          </div>
          <div className="config-field">
            <span>Redirect URI</span>
            <code>{status?.redirectUri ?? 'https://localhost:5173/api/spotify/callback'}</code>
          </div>
          <div className="config-field">
            <span>Scopes</span>
            <code>{status?.scopes.join(' ') || 'user-read-currently-playing user-read-playback-state'}</code>
          </div>
          <div className="config-actions">
            <a className={status?.configured ? 'config-button' : 'config-button disabled'} href="/api/spotify/login">
              Connect Spotify
            </a>
            <button className="config-button secondary" type="button" onClick={disconnectSpotify}>
              Disconnect
            </button>
          </div>
        </div>
        <div className="config-panel">
          <h2>Twitch</h2>
          <div className="config-row">
            <span>Credentials</span>
            <strong className={twitchStatus?.configured ? 'status-good' : 'status-bad'}>
              {twitchStatus ? (twitchStatus.configured ? 'Ready' : 'Missing') : 'Checking'}
            </strong>
          </div>
          <div className="config-row">
            <span>Connection</span>
            <strong className={twitchStatus?.connected ? 'status-good' : 'status-bad'}>
              {twitchStatus ? (twitchStatus.connected ? 'Connected' : 'Disconnected') : 'Checking'}
            </strong>
          </div>
          <div className="config-row">
            <span>EventSub</span>
            <strong className={twitchStatus?.live ? 'status-good' : 'status-bad'}>
              {twitchStatus ? (twitchStatus.live ? 'Live' : 'Offline') : 'Checking'}
            </strong>
          </div>
          <div className="config-field">
            <span>Channel</span>
            <code>{twitchStatus?.channel || 'TWITCH_CHANNEL'}</code>
          </div>
          <div className="config-field">
            <span>Redirect URI</span>
            <code>{twitchStatus?.redirectUri ?? 'https://localhost:5173/api/twitch/callback'}</code>
          </div>
          <div className="config-field">
            <span>Scopes</span>
            <code>{twitchStatus?.scopes.join(' ') || 'user:read:chat moderator:read:followers channel:read:subscriptions bits:read'}</code>
          </div>
          <div className="config-field">
            <span>Subscriptions</span>
            <code>{twitchStatus?.subscriptions.join(' ') || 'None yet'}</code>
          </div>
          {twitchStatus?.errors.length ? (
            <div className="config-field">
              <span>Latest Error</span>
              <code>{twitchStatus.errors.at(-1)}</code>
            </div>
          ) : null}
          <div className="config-actions">
            <a className={twitchStatus?.configured ? 'config-button' : 'config-button disabled'} href="/api/twitch/login">
              Connect Twitch
            </a>
            <button className="config-button secondary" type="button" onClick={disconnectTwitch}>
              Disconnect
            </button>
          </div>
        </div>
      </section>
    </Canvas>
  )
}

function WidgetRoute({ type }: { type: 'spotify' | 'challenge' | 'camera' | 'chat' | 'chat-clean' | 'alert' }) {
  if (type === 'camera') {
    return (
      <Canvas>
        <Placed box={boxes.camera}>
          <CameraFrame />
        </Placed>
      </Canvas>
    )
  }

  if (type === 'chat') {
    return (
      <Canvas>
        <Placed box={boxes.chat}>
          <ChatWidget />
        </Placed>
      </Canvas>
    )
  }

  if (type === 'chat-clean') {
    return (
      <Canvas>
        <Placed box={boxes.chat}>
          <ChatWidget borderless />
        </Placed>
      </Canvas>
    )
  }

  if (type === 'alert') {
    return (
      <Canvas>
        <div className="alert-position">
          <AlertWidget />
        </div>
      </Canvas>
    )
  }

  return (
    <Canvas>
      <Placed box={type === 'spotify' ? boxes.spotify : boxes.challenge}>
        {type === 'spotify' ? <SpotifyWidget /> : <ChallengeWidget />}
      </Placed>
    </Canvas>
  )
}

function LayoutTemplateContent({
  topSlots = true,
  chatSlot = true,
}: {
  topSlots?: boolean
  chatSlot?: boolean
}) {
  return (
    <div className="template-scale">
      {topSlots ? (
        <>
          <Placed box={boxes.spotify}>
            <div className="template-box">SPOTIFY</div>
          </Placed>
          <Placed box={boxes.challenge}>
            <div className="template-box">CHALLENGE NOTES / TIMER</div>
          </Placed>
        </>
      ) : null}
      <Placed box={boxes.camera}>
        <div className="template-box large">CAMERA 1</div>
      </Placed>
      {chatSlot ? (
        <Placed box={boxes.chat}>
          <div className="template-box large" />
        </Placed>
      ) : null}
    </div>
  )
}

function LayoutTemplate() {
  return (
    <Canvas transparent={false}>
      <LayoutTemplateContent />
    </Canvas>
  )
}

function TimerScene({ brb = false }: { brb?: boolean }) {
  return (
    <Canvas transparent={false}>
      <section className="center-scene">
        <LogoMark />
        <div className="brand-word">LUIGI</div>
        <div className="scene-subtitle">{brb ? 'BE RIGHT BACK' : 'STREAM STARTS SOON'}</div>
        <div className="scene-line" />
        <div className="scene-timer">{brb ? data.brb : data.countdown}</div>
      </section>
    </Canvas>
  )
}

function HudPreview() {
  return (
    <Canvas transparent={false}>
      <LayoutTemplateContent topSlots={false} chatSlot={false} />
      <Placed box={boxes.spotify}>
        <SpotifyWidget />
      </Placed>
      <Placed box={boxes.challenge}>
        <ChallengeWidget />
      </Placed>
      <Placed box={boxes.camera}>
        <CameraFrame />
      </Placed>
      <Placed box={boxes.chat}>
        <ChatWidget />
      </Placed>
    </Canvas>
  )
}

function GameplayOverlay() {
  const camera = useOverlayCamera()
  const chatBox = camera.enabled ? boxes.chat : boxes.camera

  return (
    <Canvas>
      <Placed box={boxes.info}>
        <InfoBar />
      </Placed>
      {camera.enabled ? (
        <Placed box={boxes.camera}>
          <CameraFrame />
        </Placed>
      ) : null}
      <Placed box={chatBox}>
        <ChatWidget borderless />
      </Placed>
      <Placed box={boxes.alerts}>
        <AlertWidget />
      </Placed>
      <Placed box={boxes.ad}>
        <SponsorAd />
      </Placed>
      <Placed box={boxes.goals}>
        <GoalsStrip />
      </Placed>
    </Canvas>
  )
}

function Hub() {
  return (
    <Canvas transparent={false}>
      <section className="hub">
        <LogoMark />
        <div className="brand-word">LUIGI</div>
        <p>Transparent 1920x1080 OBS widget routes. Each page places its widget on the canvas.</p>
        <nav>
          {links.map((link) => (
            <a href={link.path} key={link.path}>
              {link.label}
            </a>
          ))}
        </nav>
      </section>
    </Canvas>
  )
}

function App() {
  const route = routeFromPath()

  if (route === 'layout') return <LayoutTemplate />
  if (route === 'starting') return <TimerScene />
  if (route === 'brb') return <TimerScene brb />
  if (route === 'spotify') return <WidgetRoute type="spotify" />
  if (route === 'challenge') return <WidgetRoute type="challenge" />
  if (route === 'camera-frame') return <WidgetRoute type="camera" />
  if (route === 'chat-widget') return <WidgetRoute type="chat" />
  if (route === 'chat-widget-clean') return <WidgetRoute type="chat-clean" />
  if (route === 'alert-widget') return <WidgetRoute type="alert" />
  if (route === 'config') return <ConfigPage />
  if (route === 'hud') return <HudPreview />
  if (route === 'gameplay') return <GameplayOverlay />

  return <Hub />
}

export default App
