#!/usr/bin/env node
/**
 * Runs the command passed as arguments, but exits 0 silently if
 * node_modules is not installed. This prevents e2e / smoke test
 * commands from hard-failing in cloud / CI environments that have
 * not run `npm install` (e.g. jobs that only need a build artifact).
 */
import { existsSync } from 'fs'
import { execSync } from 'child_process'

if (!existsSync('./node_modules')) {
  console.log('Skipping: node_modules not found. Run `npm install` first.')
  process.exit(0)
}

const cmd = process.argv.slice(2)
  .map(arg => /\s/.test(arg) ? `'${arg.replace(/'/g, "'\\''")}'` : arg)
  .join(' ')
execSync(cmd, { stdio: 'inherit' })
