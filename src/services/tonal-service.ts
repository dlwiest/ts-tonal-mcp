import TonalClient from '@dlwiest/ts-tonal-client';

export class TonalService {
  private clients: Map<string, TonalClient> = new Map();

  async getClient(user: string = 'carlos'): Promise<TonalClient> {
    const cached = this.clients.get(user);
    if (cached) {
      return cached;
    }

    const userKey = user.toUpperCase();
    const username = process.env[`TONAL_USERNAME_${userKey}`];
    const password = process.env[`TONAL_PASSWORD_${userKey}`];

    if (!username || !password) {
      throw new Error(
        `TONAL_USERNAME_${userKey} and TONAL_PASSWORD_${userKey} environment variables are required for user "${user}"`
      );
    }

    console.error(`Initializing Tonal client for user "${user}"...`);
    const client = await TonalClient.create({
      username,
      password,
    });
    console.error(`Tonal client initialized successfully for user "${user}"`);

    this.clients.set(user, client);
    return client;
  }
}