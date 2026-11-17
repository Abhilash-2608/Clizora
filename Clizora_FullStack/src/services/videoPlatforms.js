/*
 * Integration boundary for social platform analytics.
 * There is deliberately no random/fake view-count generator in this project.
 * Connect the official API/OAuth workflow for each platform here after checking
 * its current developer terms, permissions and review requirements.
 */
function detectPlatform(videoUrl) {
  const host = new URL(videoUrl).hostname.toLowerCase();
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('tiktok.com')) return 'tiktok';
  throw new Error('Unsupported video platform.');
}

async function fetchViewCount(videoUrl, _credentials) {
  const platform = detectPlatform(videoUrl);
  const configured = {
    youtube: Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET),
    instagram: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    tiktok: Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET)
  }[platform];

  if (!configured) {
    throw new Error(`${platform} analytics integration is not configured. Use the admin demo-view tool during development.`);
  }

  // Implement platform OAuth, token storage/refresh, and official API requests here.
  // Keep the provider's view count as the source of truth; never estimate it randomly.
  throw new Error(`${platform} credentials are present, but the official API adapter still needs implementation.`);
}

module.exports = { detectPlatform, fetchViewCount };
