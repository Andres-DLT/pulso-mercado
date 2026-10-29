import { pushConfigured, publicKey } from '@/lib/push';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  return json({ enabled: pushConfigured(), publicKey: pushConfigured() ? publicKey() : null });
}
