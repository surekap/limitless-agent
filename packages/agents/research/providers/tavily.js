'use strict'

const { tavily } = require('@tavily/core')

let client = null
function getClient() {
  if (!client) client = tavily({ apiKey: process.env.TAVILY_API_KEY })
  return client
}

async function researchContact(contact) {
  const name    = contact.display_name
  const company = contact.company || ''
  const title   = contact.job_title || ''

  const generalQuery = company
    ? `${name} ${title} ${company}`.trim()
    : `${name} ${title}`.trim()
  const newsQuery = `${name} news 2025`

  const c = getClient()

  const [generalResult, newsResult] = await Promise.allSettled([
    c.search(generalQuery, { maxResults: 5, searchDepth: 'basic' }),
    c.search(newsQuery, { maxResults: 5, searchDepth: 'basic' }),
  ])

  const general = generalResult.status === 'fulfilled' ? generalResult.value.results || [] : []
  const news    = newsResult.status   === 'fulfilled' ? newsResult.value.results    || [] : []

  const result_json = {
    general_query: generalQuery,
    news_query:    newsQuery,
    general:       general.map(r => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 400) })),
    news:          news.map(r    => ({ title: r.title, url: r.url, content: (r.content || '').slice(0, 400) })),
  }

  const snippets = [
    ...general.slice(0, 3).map(r => `[Web] ${r.title}: ${(r.content || '').slice(0, 200)}`),
    ...news.slice(0, 2).map(r    => `[News] ${r.title}: ${(r.content || '').slice(0, 200)}`),
  ]
  const summary = snippets.length > 0
    ? snippets.join('\n')
    : `No web results found for ${name}.`

  return { query: generalQuery, result_json, summary }
}

module.exports = { researchContact }
