// Versão que está rodando, lida do git uma vez ao iniciar.
import { execFileSync } from 'node:child_process'

export function readVersion(dir, now = new Date()) {
  const startedAt = now.toISOString()
  try {
    // safe.directory: o serviço roda como www-data e a pasta é do root.
    const out = execFileSync(
      'git',
      ['-c', `safe.directory=${dir}`, '-C', dir, 'log', '-1', '--format=%h%x1f%cI%x1f%s'],
      { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    const [hash, date, message] = out.split('\x1f')
    if (!hash) throw new Error('sem commit')
    return { hash, date, message, startedAt }
  } catch {
    return { hash: null, date: null, message: null, startedAt }
  }
}
