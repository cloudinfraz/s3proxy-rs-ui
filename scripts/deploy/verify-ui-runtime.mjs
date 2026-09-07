import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function runtimeDigests(image, manifest) {
  if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(image)) throw new Error('UI image must be digest-pinned')
  const digests = new Set([image.split('@')[1]])
  for (const child of manifest.manifests ?? []) {
    if (child.platform?.os !== 'unknown' && /^sha256:[a-f0-9]{64}$/.test(child.digest)) digests.add(child.digest)
  }
  return digests
}

export function verifyPods({ image, manifest, rows, expectedReplicas }) {
  const allowed = runtimeDigests(image, manifest)
  const ready = rows.filter(row => row.ready === 'True')
  if (!Number.isSafeInteger(expectedReplicas) || expectedReplicas < 1 || ready.length !== expectedReplicas) throw new Error('Missing Ready UI pod evidence')
  for (const row of ready) {
    const digest = row.imageID.replace(/^.*@/, '').replace(/^containerd:\/\//, '')
    if (row.image !== image || !allowed.has(digest)) throw new Error(`Ready UI pod ${row.name} has an unexpected runtime digest`)
  }
  return [...new Set(ready.map(row => row.imageID.replace(/^.*@/, '').replace(/^containerd:\/\//, '')))]
}

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

export function verifyRuntime({ image, revision, runCommand = run }) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('UI revision must be a full Git SHA')
  runtimeDigests(image, {})
  const manifest = JSON.parse(runCommand('docker', ['buildx', 'imagetools', 'inspect', '--raw', image]))
  const desired = runCommand('kubectl', ['-n', 's3proxy', 'get', 'deployment', 's3proxy-ui', '-o', 'jsonpath={.spec.replicas}'])
  const output = runCommand('kubectl', ['-n', 's3proxy', 'get', 'pods', '-l', 'app.kubernetes.io/name=s3proxy-rs,app.kubernetes.io/component=ui', '-o', String.raw`go-template={{range .items}}{{if not .metadata.deletionTimestamp}}{{.metadata.name}}{{"\t"}}{{range .status.conditions}}{{if eq .type "Ready"}}{{.status}}{{end}}{{end}}{{"\t"}}{{range .spec.containers}}{{if eq .name "ui"}}{{.image}}{{end}}{{end}}{{"\t"}}{{range .status.containerStatuses}}{{if eq .name "ui"}}{{.imageID}}{{end}}{{end}}{{"\n"}}{{end}}{{end}}`])
  const rows = output.split('\n').filter(Boolean).map(line => {
    const [name, ready, podImage, imageID] = line.split('\t')
    return { name, ready, image: podImage, imageID }
  })
  const digests = verifyPods({ image, manifest, rows, expectedReplicas: Number(desired) })
  for (const digest of digests) {
    const runtimeImage = `${image.split('@')[0]}@${digest}`
    runCommand('docker', ['pull', runtimeImage])
    const actual = runCommand('docker', ['image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', runtimeImage])
    if (actual !== revision) throw new Error('Serving UI image revision does not match the requested revision')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { verifyRuntime({ image: process.argv[2], revision: process.argv[3] }) }
  catch (error) {
    console.error(error instanceof Error && !('stderr' in error) ? error.message : 'UI runtime verification command failed')
    process.exitCode = 1
  }
}