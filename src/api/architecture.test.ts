import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { operationMetadata } from './generated/operations'

const sourceRoot = join(process.cwd(), 'src')
function productionFiles(directory = sourceRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'generated' ? [] : productionFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|type-test)\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

const files = productionFiles()
const contents = files.map(path => ({ path: relative(process.cwd(), path), source: readFileSync(path, 'utf8') }))

describe('API architecture boundary', () => {
  it('prevents API imports from features and feature access to private transport', () => {
    const apiFeatureImports = contents.filter(file => file.path.startsWith('src/api/') && /from ['"][^'"]*features\//.test(file.source))
    const featureTransportImports = contents.filter(file => file.path.startsWith('src/features/') && /import\s*\{[^}]*\b(?:api|requestTransport)\b[^}]*\}\s*from ['"][^'"]*api\/client['"]/.test(file.source))
    expect(apiFeatureImports.map(file => file.path)).toEqual([])
    expect(featureTransportImports.map(file => file.path)).toEqual([])
  })

  it('maps every literal operation invocation to generated OpenAPI metadata', () => {
    const operationIds = contents.flatMap(file => [...file.source.matchAll(/invokeOperation\(['"]([^'"]+)['"]/g)].map(match => match[1]))
    const unknown = operationIds.filter(operationId => !(operationId in operationMetadata))
    expect(operationIds).toHaveLength(80)
    expect(new Set(operationIds).size).toBe(67)
    expect(unknown).toEqual([])
  })

  it('requires every production query function to accept a signal', () => {
    const violations = contents.flatMap(file => [...file.source.matchAll(/queryFn\s*:\s*(?:async\s*)?\(([^)]*)\)/g)]
      .filter(match => !match[1].includes('signal'))
      .map(() => file.path))
    expect(violations).toEqual([])
  })
})
