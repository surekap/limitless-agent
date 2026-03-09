require('dotenv').config({ path: '.env.local' });
const FlexibleDatabaseHandlers = require('../handlers/flexibleDatabaseHandlers');

async function testEnhancedWineDatabase() {
  console.log('🍷 Testing Enhanced Wine Database with Additional Columns');
  console.log('='.repeat(60));

  try {
    const databaseHandlers = new FlexibleDatabaseHandlers();
    const PARENT_PAGE_ID = '25051a7a4e068074a327d21b3df6a7b4';
    
    // Use the existing wine database ID from previous test
    const EXISTING_DB_ID = '25051a7a-4e06-8171-8c2f-d8fd3aa8e2ee';

    console.log('📊 Step 1: Creating Enhanced Wine Database with Drinking Windows...');
    const enhancedResult = await databaseHandlers.updateDatabaseSchema({
      database_id: EXISTING_DB_ID,
      new_columns: ['Drinking Window', 'Wine Spectator Rating', 'Cellar Tracker Rating'],
      parent_page_id: PARENT_PAGE_ID,
      database_type: 'wines'
    });

    if (enhancedResult.newDatabaseId) {
      console.log('✅ Enhanced wine database created successfully!');
      console.log(`   New Database ID: ${enhancedResult.newDatabaseId}`);
      console.log(`   Database URL: ${enhancedResult.newDatabaseUrl}`);
      console.log(`   Added columns: ${enhancedResult.addedColumns.join(', ')}`);
      console.log(`   Schema fields: ${Object.keys(enhancedResult.schema).join(', ')}`);
      
      console.log('\n🔍 Step 2: Adding Wine with Enhanced Data...');
      const wineResult = await databaseHandlers.researchAndAddEntry({
        subject: 'Screaming Eagle Cabernet Sauvignon 2018',
        database_id: enhancedResult.newDatabaseId,
        database_type: 'wines'
      });

      if (wineResult.pageId) {
        console.log('✅ Enhanced wine entry added successfully!');
        console.log(`   Page URL: ${wineResult.pageUrl}`);
        console.log(`   Research data keys: ${Object.keys(wineResult.researchData).join(', ')}`);
        console.log('\n📊 Sample enhanced data:');
        console.log(JSON.stringify(wineResult.researchData, null, 4));
      } else {
        console.log('❌ Failed to add enhanced wine entry:', wineResult.error);
      }

      console.log('\n🔍 Step 3: Adding Burgundy Wine...');
      const burgundyResult = await databaseHandlers.researchAndAddEntry({
        subject: 'Domaine de la Romanée-Conti Montrachet 2019',
        database_id: enhancedResult.newDatabaseId,
        database_type: 'wines'
      });

      if (burgundyResult.pageId) {
        console.log('✅ Burgundy wine entry added successfully!');
        console.log(`   Page URL: ${burgundyResult.pageUrl}`);
      } else {
        console.log('❌ Failed to add Burgundy wine:', burgundyResult.error);
      }

    } else {
      console.log('❌ Failed to create enhanced database:', enhancedResult.error);
    }

    console.log('\n🧪 Step 4: Testing Column Addition Feature...');
    const columnResult = await databaseHandlers.addColumnToDatabase({
      database_id: EXISTING_DB_ID,
      column_name: 'Drinking Window',
      column_description: 'The optimal time period for drinking this wine',
      database_type: 'wines'
    });

    console.log('✅ Column configuration generated:');
    console.log(`   Column Name: ${columnResult.columnName}`);
    console.log(`   Field Type: ${columnResult.fieldType}`);
    console.log(`   Recommendation: ${columnResult.recommendation}`);

  } catch (error) {
    console.error('❌ Enhanced test failed:', error.message);
  }
}

if (require.main === module) {
  testEnhancedWineDatabase().catch(console.error);
}

module.exports = testEnhancedWineDatabase;