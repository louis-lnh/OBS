export class SpotifyApi {
  constructor(config) {
    this.config = config.spotify ?? {};
    this.accessToken = null;
    this.expiresAt = 0;
  }

  get enabled() {
    return Boolean(this.config.clientId && this.config.clientSecret && this.config.refreshToken);
  }

  async getCurrentlyPlaying() {
    if (!this.enabled) return null;
    const response = await this.request("/me/player/currently-playing");
    if (!response || !response.item) return null;
    return formatSpotifyItem(response.item);
  }

  async searchTrack(query) {
    if (!this.enabled) return null;
    if (isSpotifyTrackUri(query)) return { uri: query, label: query, explicit: false, durationMs: null, artists: [] };

    const trackId = spotifyTrackIdFromUrl(query);
    if (trackId) {
      const track = await this.request(`/tracks/${trackId}`);
      return spotifyTrack(track);
    }

    const data = await this.request(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
    const track = data.tracks?.items?.[0];
    return track ? spotifyTrack(track) : null;
  }

  async getDevices() {
    if (!this.enabled) return [];
    const data = await this.request("/me/player/devices");
    return data.devices ?? [];
  }

  async addToQueue(uri, deviceId) {
    if (!this.enabled) return false;
    const params = new URLSearchParams({ uri });
    if (deviceId) params.set("device_id", deviceId);
    await this.request(`/me/player/queue?${params.toString()}`, { method: "POST", expectJson: false });
    return true;
  }

  async skip() {
    if (!this.enabled) return false;
    await this.request("/me/player/next", { method: "POST", expectJson: false });
    return true;
  }

  async request(path, options = {}) {
    const token = await this.getAccessToken();
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();
    if (response.status === 204 || !text) return null;
    if (!response.ok) {
      throw new Error(`Spotify API ${response.status}: ${text}`);
    }
    if (options.expectJson === false) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Spotify API returned invalid JSON for ${path}.`);
    }
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.expiresAt - 30000) return this.accessToken;

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.config.refreshToken
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Spotify token refresh failed: ${response.status} ${text}`);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Spotify token refresh returned invalid JSON.");
    }
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + data.expires_in * 1000;
    return this.accessToken;
  }
}

function isSpotifyTrackUri(value) {
  return /^spotify:track:[A-Za-z0-9]+$/.test(value);
}

function spotifyTrackIdFromUrl(value) {
  return value.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

function formatSpotifyItem(item) {
  const artists = item.artists?.map((artist) => artist.name).join(", ") ?? "Unknown Artist";
  return `${item.name} - ${artists}`;
}

function spotifyTrack(track) {
  return {
    uri: track.uri,
    label: formatSpotifyItem(track),
    explicit: Boolean(track.explicit),
    durationMs: track.duration_ms,
    artists: track.artists?.map((artist) => artist.name) ?? []
  };
}
