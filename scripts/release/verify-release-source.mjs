import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function verifyReleaseSource({ environment, revision, ref, repository, runCommand = execFileSync }) {
  if (!['staging', 'production'].includes(environment)) throw new Error('Unsupported protected environment')
  if (repository !== 'cloudinfraz/s3proxy-rs-ui' || ref !== 'refs/heads/main') {
    throw new Error('Release and deployment workflows must run from the canonical repository main branch')
  }
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('Source revision must be a full Git SHA')
  runCommand('git', ['fetch', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main'], { stdio: 'pipe' })
  runCommand('git', ['merge-base', '--is-ancestor', revision, 'refs/remotes/origin/main'], { stdio: 'pipe' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    verifyReleaseSource({
      environment: process.argv[2],
      revision: process.argv[3],
      ref: process.env.GITHUB_REF,
      repository: process.env.GITHUB_REPOSITORY,
    })
  } catch (error) {
    console.error(error instanceof Error && !('stderr' in error) ? error.message : 'Source revision must be contained in origin/main; source verification failed')
    process.exitCode = 1
  }
}