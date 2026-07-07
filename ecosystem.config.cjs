module.exports = {
  apps: [
    {
      name: 'shd-twitch-bot',
      script: 'src/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
        OVERLAY_CONTROL_URL: 'http://127.0.0.1:5173',
      },
    },
    {
      name: 'shd-overlay',
      script: 'server.mjs',
      cwd: `${__dirname}/overlay-suite`,
      args: '--production',
      env: {
        NODE_ENV: 'production',
        HOST: '127.0.0.1',
        PORT: '5173',
        OVERLAY_LOCAL_HTTPS: 'false',
      },
    },
  ],
}
