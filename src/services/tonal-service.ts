import TonalClient from '@dlwiest/ts-tonal-client';

export class TonalService {
  private client: TonalClient | null = null;

  async getClient(): Promise<TonalClient> {
    if (this.client) {
      return this.client;
    }

    const username = process.env.TONAL_USERNAME;
    const password = process.env.TONAL_PASSWORD;

    if (!username || !password) {
      throw new Error('TONAL_USERNAME and TONAL_PASSWORD environment variables are required');
    }

    console.error('Initializing Tonal client...');
    this.client = await TonalClient.create({
      username,
      password,
    });
    console.error('Tonal client initialized successfully');

    return this.client;
  }
}