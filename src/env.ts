export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  DISCORD_GUILD_ID: string;
  DISCORD_WEBHOOK_URL: string;
  ORS_API_KEY: string;
  SITE_URL: string;
  ORS_PROFILE: string;
  PER_LOG_CAP_KM: string;
  ADMIN_USER_IDS: string;
}
