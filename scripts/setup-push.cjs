// Genera las claves de los avisos push de Pulso y las guarda en Vercel (producción) y en .env.local.
// Ejecútalo desde la carpeta del proyecto:  node <ruta>\setup-push.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = process.cwd();
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, 'lib', 'push.js'))) {
  console.error('Ejecuta este script desde la carpeta pulso-mercado.');
  process.exit(1);
}
const webpush = require(require.resolve('web-push', { paths: [root] }));

const envFile = path.join(root, '.env.local');
const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
const get = (k) => (existing.match(new RegExp(`^${k}=(.+)$`, 'm')) || [])[1];

let pub = get('VAPID_PUBLIC_KEY'), priv = get('VAPID_PRIVATE_KEY'), secret = get('CRON_SECRET');
if (!pub || !priv) ({ publicKey: pub, privateKey: priv } = webpush.generateVAPIDKeys());
if (!secret) secret = crypto.randomBytes(24).toString('hex');
fs.writeFileSync(envFile, `# Secretos de Pulso (no se suben a git)\nVAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${priv}\nCRON_SECRET=${secret}\n`);
console.log('Claves guardadas en .env.local');

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
for (const [name, value] of [['VAPID_PUBLIC_KEY', pub], ['VAPID_PRIVATE_KEY', priv], ['CRON_SECRET', secret]]) {
  const r = spawnSync(npx, ['-y', 'vercel@latest', 'env', 'add', name, 'production', '--force'], {
    input: value, encoding: 'utf8', shell: process.platform === 'win32',
  });
  const out = `${r.stdout}\n${r.stderr}`;
  console.log(r.status === 0 ? `✔ ${name} guardada en Vercel` : `✖ ${name}: ${out.split('\n').filter((l) => /error/i.test(l)).join(' ') || 'falló'}`);
}
console.log('\nListo. Tu CRON_SECRET está en .env.local (lo necesitarás para cron-job.org).');
