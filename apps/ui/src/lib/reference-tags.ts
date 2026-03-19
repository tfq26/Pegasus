const CODE_BLOCK_REGEX = /(```[\s\S]*?```|`[^`]*`)/g
const TAG_REGEX = /(^|[\s(>])([!#$@/*](?:\[[^\]]+\]|[^\s.,!?;:()[\]{}<>]+))/g

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const normalizeBracketedTag = (token: string) => {
  const prefix = token[0]
  const body = token.slice(1)
  if (body.startsWith('[') && body.endsWith(']')) {
    return `${prefix}${body.slice(1, -1)}`
  }
  return token
}

export const renderReferenceTags = (content: string) => {
  if (!content) return ''

  const segments = content.split(CODE_BLOCK_REGEX)
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) return segment

      return segment.replace(TAG_REGEX, (_match, leading, token) => {
        const normalized = normalizeBracketedTag(token)
        const label = escapeHtml(normalized)
        return `${leading}<span class="reference-tag" data-token="${label}">${label}</span>`
      })
    })
    .join('')
}

const getPrimaryName = (resource: any) =>
  resource?.token
  || resource?.filename
  || resource?.table
  || resource?.tableName
  || resource?.title
  || resource?.name
  || resource?.label
  || ''

const stripWrappingBrackets = (value: string) =>
  value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value

export const formatReferenceTag = (resource: any) => {
  const explicitToken = typeof resource?.token === 'string' ? normalizeBracketedTag(resource.token) : null
  if (explicitToken) {
    return explicitToken
  }

  const rawName = String(getPrimaryName(resource) || '').trim()
  if (!rawName) return null

  const cleanName = stripWrappingBrackets(rawName)
  const prefixMap: Record<string, string> = {
    file: '!',
    table: '#',
    database: '$',
    note: '@',
    command: '/',
    wildcard: '*',
    collection: '*',
  }

  const prefix = prefixMap[String(resource?.type || '').toLowerCase()]
  if (!prefix) return cleanName

  if (cleanName === '*') return `${prefix}${cleanName}`
  return `${prefix}${cleanName}`
}
