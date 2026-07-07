export type WidgetBox = {
  x: number
  y: number
  w: number
  h: number
}

export const canvas = { w: 1920, h: 1080 }

export const boxes: Record<'spotify' | 'challenge' | 'camera' | 'chat' | 'info' | 'alerts' | 'ad' | 'goals', WidgetBox> = {
  spotify: { x: 32, y: 38, w: 190, h: 60 },
  challenge: { x: 232, y: 38, w: 190, h: 60 },
  camera: { x: 32, y: 196, w: 390, h: 219 },
  chat: { x: 32, y: 436, w: 390, h: 219 },
  info: { x: 32, y: 118, w: 390, h: 60 },
  alerts: { x: 1240, y: 118, w: 560, h: 360 },
  ad: { x: 32, y: 1018, w: 260, h: 38 },
  goals: { x: 1418, y: 1012, w: 470, h: 48 },
}

export const overlayData = {
  countdown: '08:24',
  brb: '03:47',
  timer: '00:00:00',
  eventTimer: {
    title: 'LIFESTEAL COUNTDOWN',
    infoLabel: 'INFO',
    info: 'COUNTDOWN',
    purpose: 'START OF LIFESTEAL',
  },
  spotify: {
    song: 'No song playing',
    artist: 'Spotify',
    durationMs: 0,
    progressMs: 0,
    isPlaying: false,
    albumArtUrl: '',
  },
  lifesteal: {
    hearts: 10,
    max: 20,
    kills: 0,
    status: 'SIGNUPS OPEN',
    signups: 8,
    signupTarget: 50,
  },
  valorant: {
    rank: 'Ascendant 1',
    rankIcon: 'ascendat 1.png',
    rr: '33 RR',
    peak: 'Ascendant 1',
    peakIcon: 'ascendat 1.png',
  },
  premier: {
    name: 'SHD GER',
    tag: '#SHD',
    division: 'Advanced 4',
    points: '200 pts',
    place: '#10',
    gamesWon: 2,
    gamesLost: 0,
  },
  goals: {
    subs: 14,
    subTarget: 10,
    followers: 842,
    followerTarget: 100,
    lifestealSignups: 8,
    lifestealSignupTarget: 50,
  },
  ads: {
    default: ['POWERED BY SHD', 'SHD COMMUNITY', 'SHD-ESPORTS.COM'],
    minecraft: ['LIFESTEAL.SHD-ESPORTS.COM', 'MINECRAFT HARDCORE DAY X'],
  },
  chat: [
    ['shadowvfx', 'Lets go Luigi!'],
    ['ImNotKova', 'clean as always'],
    ['neon__uwu', 'glhf'],
    ['itz_pablo', "what's the plan today?"],
    ['Nightbot', 'Follow my socials!'],
    ['d3xtr', 'that was insane'],
  ],
}
