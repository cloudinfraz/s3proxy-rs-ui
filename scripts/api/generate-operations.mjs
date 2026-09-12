import Ajv2020 from 'ajv/dist/2020.js'
import standaloneCode from 'ajv/dist/standalone/index.js'
import addFormats from 'ajv-formats'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const methods = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'])
const contractId = 'urn:s3proxy:admin-openapi'

function validatorName(operationId, status) {
  return `validate_${operationId.replaceAll(/[^A-Za-z0-9_$]/g, '_')}_${status}`
}

export function collectOperations(document) {
  if (!document || typeof document !== 'object' || !document.paths || typeof document.paths !== 'object') {
    throw new Error('OpenAPI document must define paths')
  }
  const identifiers = new Set()
  const operations = []
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!methods.has(method) || !operation || typeof operation !== 'object') continue
      const operationId = operation.operationId
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw new Error(`${method.toUpperCase()} ${path} must define operationId`)
      }
      if (identifiers.has(operationId)) throw new Error(`Duplicate operationId: ${operationId}`)
      identifiers.add(operationId)
      const successes = Object.entries(operation.responses ?? {})
        .filter(([status]) => /^2\d\d$/.test(status))
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([status, response]) => {
          const schema = response?.content?.['application/json']?.schema
          return schema
            ? { status: Number(status), kind: 'json', schema }
            : { status: Number(status), kind: 'empty' }
        })
      if (successes.length === 0) throw new Error(`${operationId} must define a successful response`)
      operations.push({ operationId, method: method.toUpperCase(), path, successes })
    }
  }
  return operations
}

export function generateArtifacts(document) {
  const operations = collectOperations(document)
  const ajv = new Ajv2020({ allErrors: true, code: { esm: true, source: true }, strict: false, logger: false })
  addFormats(ajv)
  ajv.addSchema({
    $id: contractId,
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    components: document.components,
  })
  const compiled = {}
  const entries = []
  for (const operation of operations) {
    const statuses = []
    for (const success of operation.successes) {
      if (success.kind !== 'json') continue
      const name = validatorName(operation.operationId, success.status)
      const schemaId = `${contractId}:response:${operation.operationId}:${success.status}`
      ajv.addSchema({
        $id: schemaId,
        ...(success.schema.$ref ? { $ref: `${contractId}${success.schema.$ref}` } : success.schema),
      })
      compiled[name] = schemaId
      statuses.push(`${success.status}: ${name}`)
    }
    if (statuses.length > 0) entries.push(`${JSON.stringify(operation.operationId)}: { ${statuses.join(', ')} }`)
  }
  const standalone = standaloneCode(ajv, compiled)
  const source = standalone.includes('require("ajv-formats/dist/formats")')
    ? `import formatsPackage from "ajv-formats/dist/formats.js";\nconst { fullFormats } = formatsPackage;\n${standalone.replaceAll('require("ajv-formats/dist/formats").fullFormats', 'fullFormats')}`
    : standalone
  const validators = `${source}\nexport const responseValidators = {\n  ${entries.join(',\n  ')}\n}\n`
  const metadata = Object.fromEntries(operations.map(operation => [operation.operationId, {
    method: operation.method,
    path: operation.path,
    successes: operation.successes.map(({ status, kind }) => ({ status, kind })),
  }]))
  const operationSource = `// Generated from contracts/admin-openapi.json. Do not edit.\nimport type { operations as OpenApiOperations } from '../schema'\n\nexport type OperationId = keyof OpenApiOperations\nexport const operationMetadata = ${JSON.stringify(metadata, null, 2)} as const satisfies Record<OperationId, { readonly method: string; readonly path: string; readonly successes: readonly { readonly status: number; readonly kind: 'json' | 'empty' }[] }>\n`
  const validatorDeclaration = `// Generated from contracts/admin-openapi.json. Do not edit.\nexport type ResponseValidator = ((value: unknown) => boolean) & { errors?: readonly unknown[] | null }\nexport const responseValidators: Partial<Record<string, Readonly<Record<number, ResponseValidator>>>>\n`
  return { operations, operationSource, validators, validatorDeclaration }
}

export async function writeArtifacts(document, operationPath, validatorPath) {
  const artifacts = generateArtifacts(document)
  await mkdir(dirname(operationPath), { recursive: true })
  await mkdir(dirname(validatorPath), { recursive: true })
  await writeFile(operationPath, artifacts.operationSource)
  await writeFile(validatorPath, artifacts.validators)
  await writeFile(validatorPath.replace(/\.js$/, '.d.ts'), artifacts.validatorDeclaration)
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const [contractPath, operationPath, validatorPath] = process.argv.slice(2)
  if (!contractPath || !operationPath || !validatorPath) {
    throw new Error('Usage: generate-operations.mjs <openapi.json> <operations.ts> <validators.js>')
  }
  const document = JSON.parse(await readFile(contractPath, 'utf8'))
  await writeArtifacts(document, operationPath, validatorPath)
}
