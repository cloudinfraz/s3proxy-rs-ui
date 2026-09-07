import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const expectedVersion = process.argv[2]?.replace(/^v/, '')
if (!expectedVersion || !/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error('usage: node scripts/release/prepare-release.mjs <version>')
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const packageLock = JSON.parse(readFileSync('package-lock.json', 'utf8'))

if (packageJson.version !== expectedVersion) {
  throw new Error(`package.json version ${packageJson.version} does not match ${expectedVersion}`)
}
if (packageLock.version !== expectedVersion || packageLock.packages?.['']?.version !== expectedVersion) {
  throw new Error('package-lock.json versions do not match package.json')
}

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const heading = new RegExp(`^## \\[${expectedVersion.replaceAll('.', '\\.')}\\] - (\\d{4}-\\d{2}-\\d{2})$`, 'm')
const match = changelog.match(heading)
if (!match) {
  throw new Error(`CHANGELOG.md has no dated ${expectedVersion} release heading`)
}

const releaseDate = new Date(`${match[1]}T00:00:00Z`)
if (Number.isNaN(releaseDate.valueOf()) || releaseDate.toISOString().slice(0, 10) !== match[1]) {
  throw new Error(`CHANGELOG.md contains an invalid release date: ${match[1]}`)
}

const notesStart = match.index + match[0].length
const nextRelease = changelog.slice(notesStart).search(/^## \[/m)
const notesEnd = nextRelease === -1 ? changelog.length : notesStart + nextRelease
const notes = changelog.slice(notesStart, notesEnd).trim()
if (!notes) {
  throw new Error(`CHANGELOG.md release ${expectedVersion} has no notes`)
}

const outputDirectory = resolve('target/release')
mkdirSync(outputDirectory, { recursive: true })
writeFileSync(resolve(outputDirectory, 'release-notes.md'), `${notes}\n`)

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${expectedVersion}\ntag=v${expectedVersion}\n`)
}

console.log(`Prepared release notes for v${expectedVersion} (${match[1]})`)