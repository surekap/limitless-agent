#!/usr/bin/env node
'use strict'

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env.local') })

const gemini = require('./services/gemini')
const db     = require('@secondbrain/db')

console.log('💎 Gemini Conversation Importer')
console.log('   Imports Google Gemini conversation history into the ai schema\n')

async function main() {
  try {
    const { convsImported, msgsImported } = await gemini.importConversations()
    console.log(`\n✅ Gemini import complete`)
    console.log(`   Conversations: ${convsImported}`)
    console.log(`   Messages:      ${msgsImported}`)
  } catch (err) {
    console.error('\n❌ Gemini import failed:', err.message)
    process.exit(1)
  } finally {
    await db.end().catch(() => {})
  }
}

main()
