require('dotenv').config({ path: '.env.local' });
const FlexibleDatabaseHandlers = require('../handlers/flexibleDatabaseHandlers');

async function createWineDatabase() {
  console.log('🍷 Creating Wine Database Demo');
  console.log('='.repeat(50));

  try {
    const databaseHandlers = new FlexibleDatabaseHandlers();
    
    // Use the page ID from your setup
    const PARENT_PAGE_ID = '25051a7a4e068074a327d21b3df6a7b4';
    
    console.log('📊 Step 1: Creating Wine Database...');
    const createResult = await databaseHandlers.createFlexibleDatabase({
      database_type: 'wines',
      parent_page_id: PARENT_PAGE_ID,
      database_name: 'Wine Collection Database'
    });

    if (createResult.databaseId) {
      console.log('✅ Wine database created successfully!');
      console.log(`   Database ID: ${createResult.databaseId}`);
      console.log(`   Database URL: ${createResult.databaseUrl}`);
      console.log(`   Schema fields: ${Object.keys(createResult.schema).join(', ')}`);
      
      console.log('\n🔍 Step 2: Researching and Adding Château Margaux 2015...');
      const researchResult = await databaseHandlers.researchAndAddEntry({
        subject: 'Château Margaux 2015',
        database_id: createResult.databaseId,
        database_type: 'wines'
      });

      if (researchResult.pageId) {
        console.log('✅ Wine entry added successfully!');
        console.log(`   Page ID: ${researchResult.pageId}`);
        console.log(`   Page URL: ${researchResult.pageUrl}`);
        console.log(`   Research data keys: ${Object.keys(researchResult.researchData).join(', ')}`);
      } else {
        console.log('❌ Failed to add wine entry:', researchResult.error);
      }

      console.log('\n🔍 Step 3: Adding Another Wine Entry...');
      const researchResult2 = await databaseHandlers.researchAndAddEntry({
        subject: 'Dom Pérignon Champagne 2012',
        database_id: createResult.databaseId,
        database_type: 'wines'
      });

      if (researchResult2.pageId) {
        console.log('✅ Second wine entry added successfully!');
        console.log(`   Page URL: ${researchResult2.pageUrl}`);
      } else {
        console.log('❌ Failed to add second wine entry:', researchResult2.error);
      }

    } else {
      console.log('❌ Failed to create wine database:', createResult.error);
    }

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

if (require.main === module) {
  createWineDatabase().catch(console.error);
}

module.exports = createWineDatabase;