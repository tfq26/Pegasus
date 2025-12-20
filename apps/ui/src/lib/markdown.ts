import MarkdownIt from 'markdown-it'

// Create a singleton instance
export const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
})

export const renderMarkdown = (content: string) => {
    if (!content) return ''
    return md.render(content)
}
