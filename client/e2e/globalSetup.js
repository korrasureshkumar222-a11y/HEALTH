import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const clientDirectory = path.dirname(fileURLToPath(import.meta.url))
const serverDirectory = path.resolve(clientDirectory, '../../server')

export default function globalSetup() {
  if (!process.env.MONGO_URI || !process.env.SEED_PASSWORD) {
    throw new Error('E2E tests require MONGO_URI and SEED_PASSWORD for an isolated test database.')
  }
  execFileSync(process.execPath, ['src/seed/seed.js'], {
    cwd: serverDirectory,
    env: process.env,
    stdio: 'inherit',
  })
}
