require('dotenv').config({ path: '.env.local' });
const { getLifelogs } = require('../services/limitless');
const { saveLifelogsToDB, getLatestStartTime } = require('../cron/fetchLifelogs');
const database = require('../services/database');
const pool = require('../db');

class LifelogDownloadTest {
  constructor() {
    this.testResults = {
      apiConnection: null,
      databaseConnection: null,
      lifelogsFetched: null,
      savedToDatabase: null,
      dataIntegrity: null
    };
  }

  async runAllTests() {
    console.log('🧪 Starting Lifelog Download Tests');
    console.log('='.repeat(50));

    try {
      await this.testDatabaseConnection();
      await this.testAPIConnection();
      await this.testLifelogFetching();
      await this.testDatabaseSaving();
      await this.testDataIntegrity();
      
      this.printSummary();
    } catch (error) {
      console.error('❌ Test suite failed with error:', error);
    } finally {
      await this.cleanup();
    }
  }

  async testDatabaseConnection() {
    console.log('\n1️⃣ Testing Database Connection...');
    
    try {
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      
      this.testResults.databaseConnection = { success: true };
      console.log('✅ Database connection successful');
    } catch (error) {
      this.testResults.databaseConnection = { success: false, error: error.message };
      console.error('❌ Database connection failed:', error.message);
      throw error;
    }
  }

  async testAPIConnection() {
    console.log('\n2️⃣ Testing Limitless API Connection...');
    
    try {
      // Test with minimal fetch to verify API connectivity
      const testLogs = await getLifelogs({
        apiKey: process.env.LIMITLESS_API_KEY,
        limit: 1
      });

      this.testResults.apiConnection = { 
        success: true, 
        sampleFetched: testLogs.length > 0 
      };
      console.log('✅ API connection successful');
      console.log(`ℹ️  Sample fetch returned ${testLogs.length} lifelog(s)`);
    } catch (error) {
      this.testResults.apiConnection = { success: false, error: error.message };
      console.error('❌ API connection failed:', error.message);
      throw error;
    }
  }

  async testLifelogFetching() {
    console.log('\n3️⃣ Testing Lifelog Fetching (Last 2 Days)...');
    
    try {
      const days = parseInt(process.env.FETCH_DAYS || "2", 10);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      console.log(`📅 Fetching lifelogs from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      const lifelogs = await getLifelogs({
        apiKey: process.env.LIMITLESS_API_KEY,
        start: startDate.toISOString().slice(0, 19).replace('T', ' '),
        end: endDate.toISOString().split('T')[0],
        limit: 100
      });

      this.testResults.lifelogsFetched = {
        success: true,
        count: lifelogs.length,
        sampleData: lifelogs.slice(0, 3).map(log => ({
          id: log.id,
          title: log.title,
          startTime: log.startTime,
          hasContent: !!(log.contents || log.markdown)
        }))
      };

      console.log(`✅ Successfully fetched ${lifelogs.length} lifelogs`);
      
      if (lifelogs.length > 0) {
        console.log('\n📄 Sample lifelog data:');
        lifelogs.slice(0, 2).forEach((log, index) => {
          console.log(`   ${index + 1}. ID: ${log.id}`);
          console.log(`      Title: ${log.title || 'No title'}`);
          console.log(`      Start: ${log.startTime || 'No start time'}`);
          console.log(`      Content: ${log.markdown ? 'Yes' : 'No'}`);
        });
      } else {
        console.log('⚠️  No lifelogs found in the last 2 days');
      }

      return lifelogs;
    } catch (error) {
      this.testResults.lifelogsFetched = { success: false, error: error.message };
      console.error('❌ Lifelog fetching failed:', error.message);
      throw error;
    }
  }

  async testDatabaseSaving() {
    console.log('\n4️⃣ Testing Database Saving...');
    
    try {
      // Fetch fresh lifelogs for testing
      const days = parseInt(process.env.FETCH_DAYS || "2", 10);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - days);

      const lifelogs = await getLifelogs({
        apiKey: process.env.LIMITLESS_API_KEY,
        start: startDate.toISOString().slice(0, 19).replace('T', ' '),
        end: endDate.toISOString().split('T')[0],
        limit: 10  // Limit for testing
      });

      if (lifelogs.length === 0) {
        this.testResults.savedToDatabase = { success: true, message: 'No lifelogs to save' };
        console.log('ℹ️  No lifelogs available to test database saving');
        return;
      }

      // Get count before saving
      const conn = await pool.getConnection();
      const [beforeRows] = await conn.query('SELECT COUNT(*) as count FROM lifelogs');
      const beforeCount = beforeRows[0].count;

      // Save lifelogs
      await saveLifelogsToDB(lifelogs);

      // Get count after saving
      const [afterRows] = await conn.query('SELECT COUNT(*) as count FROM lifelogs');
      const afterCount = afterRows[0].count;
      conn.release();

      this.testResults.savedToDatabase = {
        success: true,
        lifelogsProcessed: lifelogs.length,
        beforeCount,
        afterCount,
        newRecords: afterCount - beforeCount
      };

      console.log(`✅ Successfully saved lifelogs to database`);
      console.log(`   Processed: ${lifelogs.length} lifelogs`);
      console.log(`   Database records before: ${beforeCount}`);
      console.log(`   Database records after: ${afterCount}`);
      console.log(`   New records added: ${afterCount - beforeCount}`);

    } catch (error) {
      this.testResults.savedToDatabase = { success: false, error: error.message };
      console.error('❌ Database saving failed:', error.message);
      throw error;
    }
  }

  async testDataIntegrity() {
    console.log('\n5️⃣ Testing Data Integrity...');
    
    try {
      const conn = await pool.getConnection();
      
      // Check recent lifelogs
      const [recentLogs] = await conn.query(
        'SELECT id, title, start_time, end_time, contents, markdown FROM lifelogs ORDER BY created_at DESC LIMIT 5'
      );

      // Check for required fields
      const integrityChecks = recentLogs.map(log => ({
        id: log.id,
        hasTitle: !!log.title,
        hasStartTime: !!log.start_time,
        hasContent: !!(log.contents || log.markdown),
        dataTypes: {
          id: typeof log.id,
          title: typeof log.title,
          start_time: log.start_time instanceof Date || typeof log.start_time === 'string'
        }
      }));

      // Check database schema
      const [columns] = await conn.query('DESCRIBE lifelogs');
      const requiredColumns = ['id', 'title', 'start_time', 'end_time', 'contents', 'markdown', 'processed'];
      const missingColumns = requiredColumns.filter(col => 
        !columns.some(dbCol => dbCol.Field === col)
      );

      conn.release();

      this.testResults.dataIntegrity = {
        success: missingColumns.length === 0,
        recentLogsCount: recentLogs.length,
        integrityChecks,
        missingColumns,
        schemaValid: missingColumns.length === 0
      };

      if (missingColumns.length === 0) {
        console.log('✅ Data integrity checks passed');
        console.log(`   Recent logs analyzed: ${recentLogs.length}`);
        console.log('   All required columns present in database');
      } else {
        console.error(`❌ Missing database columns: ${missingColumns.join(', ')}`);
      }

    } catch (error) {
      this.testResults.dataIntegrity = { success: false, error: error.message };
      console.error('❌ Data integrity check failed:', error.message);
      throw error;
    }
  }

  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('='.repeat(50));

    const tests = [
      { name: 'Database Connection', result: this.testResults.databaseConnection },
      { name: 'API Connection', result: this.testResults.apiConnection },
      { name: 'Lifelog Fetching', result: this.testResults.lifelogsFetched },
      { name: 'Database Saving', result: this.testResults.savedToDatabase },
      { name: 'Data Integrity', result: this.testResults.dataIntegrity }
    ];

    tests.forEach(test => {
      const status = test.result?.success ? '✅' : '❌';
      console.log(`${status} ${test.name}`);
    });

    const allPassed = tests.every(test => test.result?.success);
    
    console.log('\n' + '='.repeat(50));
    if (allPassed) {
      console.log('🎉 All tests passed! Lifelog downloading is working properly.');
    } else {
      console.log('⚠️  Some tests failed. Check the details above.');
    }

    // Print key metrics
    if (this.testResults.lifelogsFetched?.success) {
      console.log(`\n📈 Key Metrics:`);
      console.log(`   Lifelogs fetched: ${this.testResults.lifelogsFetched.count}`);
      if (this.testResults.savedToDatabase?.success) {
        console.log(`   New records saved: ${this.testResults.savedToDatabase.newRecords || 0}`);
      }
    }
  }

  async cleanup() {
    try {
      await pool.end();
      console.log('\n🧹 Cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const test = new LifelogDownloadTest();
  test.runAllTests().catch(console.error);
}

module.exports = LifelogDownloadTest;