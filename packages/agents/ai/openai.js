#!/usr/bin/env node
'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.local') })

const openai = require('./services/openai')
const db     = require('@secondbrain/db')

console.log('🤖 OpenAI Conversation Importer')
console.log('   Imports ChatGPT conversation history into the ai schema\n')

async function main() {
  try {
    const { convsImported, msgsImported } = await openai.importConversations()
    console.log(`\n✅ OpenAI import complete`)
    console.log(`   Conversations: ${convsImported}`)
    console.log(`   Messages:      ${msgsImported}`)
  } catch (err) {
    console.error('\n❌ OpenAI import failed:', err.message)
    process.exit(1)
  } finally {
    await db.end().catch(() => {})
  }
}

main()
