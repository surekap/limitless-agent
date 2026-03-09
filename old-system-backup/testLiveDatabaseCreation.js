require('dotenv').config({ path: '.env.local' });
const FlexibleDatabaseHandlers = require('../handlers/flexibleDatabaseHandlers');

async function testLiveDatabaseCreation() {
  console.log('🧪 Testing Live Database Creation');
  console.log('='.repeat(50));

  try {
    const databaseHandlers = new FlexibleDatabaseHandlers();
    
    // Test 1: Schema generation
    console.log('\n🔬 Testing AI Schema Generation...');
    
    console.log('   Generating wine database schema...');
    const wineResult = await testSchemaGeneration('wines');
    if (wineResult.success) {
      console.log('   ✅ Wine schema generated successfully');
      console.log('   📋 Fields:', Object.keys(wineResult.schema).join(', '));
    } else {
      console.log('   ❌ Wine schema failed:', wineResult.error);
    }
    
    console.log('\n   Generating gin database schema...');
    const ginResult = await testSchemaGeneration('gins');
    if (ginResult.success) {
      console.log('   ✅ Gin schema generated successfully');
      console.log('   📋 Fields:', Object.keys(ginResult.schema).join(', '));
    } else {
      console.log('   ❌ Gin schema failed:', ginResult.error);
    }

    console.log('\n   Generating hydroponic plants schema...');
    const plantsResult = await testSchemaGeneration('hydroponic plants');
    if (plantsResult.success) {
      console.log('   ✅ Plants schema generated successfully');
      console.log('   📋 Fields:', Object.keys(plantsResult.schema).join(', '));
      console.log('   🌱 Sample schema:', JSON.stringify(plantsResult.schema, null, 4));
    } else {
      console.log('   ❌ Plants schema failed:', plantsResult.error);
    }

    // Test 2: Research functionality
    console.log('\n🔍 Testing Research Functionality...');
    const researchResult = await testResearch('Château Margaux 2015', 'wines');
    if (researchResult.success) {
      console.log('   ✅ Wine research successful');
      console.log('   📊 Data fields:', Object.keys(researchResult.data).join(', '));
      console.log('   🍷 Sample data:', JSON.stringify(researchResult.data, null, 4));
    } else {
      console.log('   ❌ Wine research failed:', researchResult.error);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testSchemaGeneration(databaseType) {
  try {
    const OpenAI = require("openai");
    const openai = new OpenAI();
    
    const schemaPrompt = `Create a Notion database schema for "${databaseType}". 

Return a JSON object with properties for the Notion database. Each property should have a proper Notion field type.

Available Notion field types:
- title: {} (for main title field)
- rich_text: {} (for text fields)  
- number: { format: "number" } (for numeric values)
- select: { options: [{ name: "Option1", color: "blue" }] } (for dropdowns)
- multi_select: { options: [{ name: "Tag1", color: "green" }] } (for tags)
- date: {} (for dates)
- checkbox: {} (for yes/no)
- url: {} (for links)
- email: {} (for email addresses)

For ${databaseType}, create appropriate fields. Examples:
- If wines: name (title), vintage (number), region (rich_text), rating (select), price (number), notes (rich_text)
- If gins: name (title), distillery (rich_text), abv (number), botanicals (multi_select), rating (select)
- If hydroponic plants: name (title), lux_level (number), electrical_conductivity (number), ph_level (number), growth_stage (select)

Return ONLY the JSON object, no explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a database schema expert. Return only valid JSON for Notion database properties."
        },
        {
          role: "user", 
          content: schemaPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const schema = JSON.parse(response.choices[0].message.content);
    return { success: true, schema };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testResearch(subject, databaseType) {
  try {
    const OpenAI = require("openai");
    const openai = new OpenAI();
    
    const researchPrompt = `Research "${subject}" and provide comprehensive information for a ${databaseType} database.

Research the following about "${subject}":
- Basic information and characteristics
- Technical specifications or details
- Ratings, reviews, or quality assessments
- Pricing information if applicable
- Any other relevant data for a ${databaseType} database

Return a JSON object with appropriate field data:
- For wines: name, vintage, region, producer, grape_variety, rating, price, tasting_notes, etc.
- For gins: name, distillery, abv, botanicals, origin, rating, price, flavor_profile, etc.
- For plants: name, lux_level, electrical_conductivity, ph_level, growth_stage, etc.

Be thorough and accurate. Use appropriate data types (numbers for numeric values, arrays for lists, etc.).

Return ONLY the JSON object with field data, no explanations.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a research expert. Provide accurate, comprehensive data in JSON format."
        },
        {
          role: "user",
          content: researchPrompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    });

    const data = JSON.parse(response.choices[0].message.content);
    return { success: true, data };

  } catch (error) {
    return { success: false, error: error.message };
  }
}

if (require.main === module) {
  testLiveDatabaseCreation().catch(console.error);
}

module.exports = testLiveDatabaseCreation;