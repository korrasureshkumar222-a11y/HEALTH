import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = path.join(clientRoot, 'src')
const locales = ['en', 'te']

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return /\.(jsx|js)$/.test(entry.name) ? [entryPath] : []
  }))
  return nested.flat()
}

const translations = Object.fromEntries(await Promise.all(locales.map(async (locale) => {
  const filePath = path.join(clientRoot, 'public', 'locales', `${locale}.json`)
  return [locale, JSON.parse(await readFile(filePath, 'utf8'))]
})))

function flattenKeys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, child]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenKeys(child, fullKey)
      : [fullKey]
  })
}

const englishKeys = new Set(flattenKeys(translations.en))
const errors = []
for (const locale of locales.slice(1)) {
  const localeKeys = new Set(flattenKeys(translations[locale]))
  for (const key of englishKeys) {
    if (!localeKeys.has(key)) errors.push(`${locale}: missing translation "${key}"`)
  }
  for (const key of localeKeys) {
    if (!englishKeys.has(key)) errors.push(`${locale}: unexpected translation "${key}"`)
  }
  for (const key of englishKeys) {
    const english = key.split('.').reduce((node, part) => node?.[part], translations.en)
    const translated = key.split('.').reduce((node, part) => node?.[part], translations[locale])
    if (typeof english === 'string' && typeof translated === 'string') {
      const parameters = (text) => [...text.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort().join(',')
      if (parameters(english) !== parameters(translated)) {
        errors.push(`${locale}: interpolation mismatch for "${key}"`)
      }
      if (!translated.trim()) errors.push(`${locale}: empty translation "${key}"`)
    }
  }
}

const files = await sourceFiles(sourceRoot)
const referencedKeys = new Set()
const dynamicPrefixes = new Set()
for (const filePath of files) {
  const source = await readFile(filePath, 'utf8')
  for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) {
    if (!match[1].includes('${')) referencedKeys.add(match[1])
  }
  for (const match of source.matchAll(/\bt\(\s*`([^`]*?)\$\{/g)) {
    dynamicPrefixes.add(match[1])
  }
}
for (const key of referencedKeys) {
  if (!englishKeys.has(key)) errors.push(`en: UI references missing translation "${key}"`)
  for (const locale of locales) {
    const keys = new Set(flattenKeys(translations[locale]))
    if (!keys.has(key)) errors.push(`${locale}: UI references missing translation "${key}"`)
  }
}
for (const prefix of dynamicPrefixes) {
  if (!flattenKeys(translations.en).some((key) => key.startsWith(prefix))) {
    errors.push(`en: no translation keys match dynamic prefix "${prefix}"`)
  }
  for (const locale of locales) {
    if (!flattenKeys(translations[locale]).some((key) => key.startsWith(prefix))) {
      errors.push(`${locale}: no translation keys match dynamic prefix "${prefix}"`)
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else {
  console.log(`Translation check passed (${englishKeys.size} keys across ${locales.join(', ')}).`)
}
