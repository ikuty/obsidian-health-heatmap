import { createServer, IncomingMessage, ServerResponse } from 'http';
import { randomBytes, createHash } from 'crypto';
import { requestUrl, Plugin, Notice } from 'obsidian';
import { AuthSettings, TokenSet } from '../types';

const FITBIT_AUTH_URL = 'https://www.fitbit.com/oauth2/authorize';
const FITBIT_TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const SCOPES = 'activity sleep heartrate profile';
const REDIRECT_PORT = 8085;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

export type AuthErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'TOKEN_EXCHANGE_FAILED'
  | 'REFRESH_FAILED'
  | 'CALLBACK_TIMEOUT';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'AuthError';
  }
}

export class OAuthManager {
  constructor(
    private _plugin: Plugin,
    private settings: AuthSettings,
    private onSettingsChange: (updated: AuthSettings) => Promise<void>
  ) {}

  isAuthenticated(): boolean {
    return !!this.settings.tokenSet?.refreshToken;
  }

  async getAccessToken(): Promise<string> {
    const { tokenSet } = this.settings;
    if (!tokenSet) throw new AuthError('NOT_AUTHENTICATED');

    if (Date.now() > tokenSet.expiresAt - 5 * 60 * 1000) {
      const newSet = await this.refreshAccessToken(tokenSet.refreshToken);
      this.settings.tokenSet = newSet;
      await this.onSettingsChange(this.settings);
      return newSet.accessToken;
    }
    return tokenSet.accessToken;
  }

  async startOAuthFlow(): Promise<void> {
    const verifier = this.generateCodeVerifier();
    const challenge = this.generateCodeChallenge(verifier);

    const authUrl = new URL(FITBIT_AUTH_URL);
    authUrl.searchParams.set('client_id', this.settings.clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    try {
      const { shell } = (window as any).require('electron');
      await shell.openExternal(authUrl.toString());
    } catch {
      window.open(authUrl.toString());
    }

    const code = await this.waitForCallback(REDIRECT_PORT);
    const tokenSet = await this.exchangeCodeForToken(code, verifier);

    this.settings.tokenSet = tokenSet;
    await this.onSettingsChange(this.settings);

    new Notice('Fitbit の認証が完了しました');
  }

  async revokeTokens(): Promise<void> {
    this.settings.tokenSet = undefined;
    await this.onSettingsChange(this.settings);
  }

  private generateCodeVerifier(): string {
    return randomBytes(64).toString('base64url');
  }

  private generateCodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  private waitForCallback(port: number, timeoutMs = 120_000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        server.close();
        reject(new AuthError('CALLBACK_TIMEOUT', 'OAuth callback timed out'));
      }, timeoutMs);

      const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '', `http://127.0.0.1:${port}`);
        if (url.pathname !== '/callback') return;

        const code = url.searchParams.get('code');
        const html =
          '<html><body><h1>認証完了</h1>' +
          '<p>Obsidian に戻ってこのウィンドウを閉じてください。</p></body></html>';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);

        clearTimeout(timer);
        server.close(() => {
          if (code) resolve(code);
          else reject(new AuthError('CALLBACK_TIMEOUT', 'No code in callback'));
        });
      });

      server.on('error', reject);
      server.listen(port, '127.0.0.1');
    });
  }

  private async exchangeCodeForToken(code: string, verifier: string): Promise<TokenSet> {
    const response = await requestUrl({
      url: FITBIT_TOKEN_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${this.settings.clientId}:${this.settings.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: verifier,
        client_id: this.settings.clientId,
      }).toString(),
    });

    if (response.status !== 200) {
      throw new AuthError('TOKEN_EXCHANGE_FAILED', `HTTP ${response.status}`);
    }

    return this.parseTokenResponse(response.json);
  }

  private async refreshAccessToken(refreshToken: string): Promise<TokenSet> {
    const response = await requestUrl({
      url: FITBIT_TOKEN_URL,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${this.settings.clientId}:${this.settings.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (response.status !== 200) {
      throw new AuthError('REFRESH_FAILED', `HTTP ${response.status}`);
    }

    const json = response.json;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  }

  private parseTokenResponse(json: any): TokenSet {
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  }
}
