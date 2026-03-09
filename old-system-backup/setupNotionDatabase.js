require("dotenv").config({ path: ".env.local" });
const StockAnalysisHandlers = require("../handlers/stockAnalysisHandlers");

async function setupNotionDatabase() {
  console.log("🔧 Setting up Notion Stock Analysis Database");
  console.log("=".repeat(50));

  try {
    const stockHandlers = new StockAnalysisHandlers();

    // You'll need to provide a parent page ID where the database will be created
    // This should be a page ID from your Notion workspace
    console.log("⚠️  You need to provide a Notion parent page ID");
    console.log("   1. Go to your Notion workspace");
    console.log(
      "   2. Create or find a page where you want the Stock Analysis database"
    );
    console.log("   3. Copy the page ID from the URL");
    console.log(
      "   4. Example: notion.so/Your-Page-Name-1234567890abcdef1234567890abcdef"
    );
    console.log("   5. The page ID is: 1234567890abcdef1234567890abcdef");

    // Example parent page ID - replace with your actual page ID
    const PARENT_PAGE_ID = "25051a7a4e068074a327d21b3df6a7b4";

    if (PARENT_PAGE_ID === "YOUR_NOTION_PAGE_ID_HERE") {
      console.log(
        "\n❌ Please update PARENT_PAGE_ID in this script with your actual Notion page ID"
      );
      console.log("   Edit: test/setupNotionDatabase.js");
      return;
    }

    console.log(`\n📝 Creating database in page: ${PARENT_PAGE_ID}`);

    const result = await stockHandlers.createStockDatabase({
      parent_page_id: PARENT_PAGE_ID,
      database_name: "Stock Analysis",
    });

    if (result.databaseId) {
      console.log("\n✅ Database created successfully!");
      console.log(`   Database ID: ${result.databaseId}`);
      console.log(`   Database URL: ${result.databaseUrl}`);
      console.log(
        "\n🎉 You can now run stock analysis with Notion integration!"
      );
      console.log("   Run: node test/runLiveStockAnalysis.js");
    } else {
      console.log("\n❌ Failed to create database");
      console.log("   Check your NOTION_TOKEN and page permissions");
    }
  } catch (error) {
    console.error("❌ Setup failed:", error.message);
    console.error("\n🔧 Troubleshooting:");
    console.error("   - Ensure NOTION_TOKEN is set in .env.local");
    console.error(
      "   - Make sure your Notion integration has access to the page"
    );
    console.error("   - Verify the parent page ID is correct");
  }
}

// To run with a specific page ID, you can also call it directly:
async function createDatabaseWithPageId(pageId) {
  const stockHandlers = new StockAnalysisHandlers();
  return await stockHandlers.createStockDatabase({
    parent_page_id: pageId,
    database_name: "Stock Analysis",
  });
}

if (require.main === module) {
  setupNotionDatabase().catch(console.error);
}

module.exports = { setupNotionDatabase, createDatabaseWithPageId };
