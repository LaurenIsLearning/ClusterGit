import { supabase } from "./src/utils/supabase.js";

async function testInsert() {
    const userId = '59f04fc1-9efc-4faa-b292-92065be508f5'; // User ID from logs
    const testName = 'schema-test-' + Date.now();

    console.log(`Testing insert for project: ${testName} with owner_id: ${userId}`);

    const { data, error } = await supabase
        .from('repositories')
        .insert({
            name: testName,
            owner_id: userId
        })
        .select();

    if (error) {
        console.log('❌ Insert failed:', JSON.stringify(error, null, 2));
    } else {
        console.log('✅ Insert succeeded:', data);

        // Cleanup
        await supabase.from('repositories').delete().eq('name', testName);
    }
}

testInsert();
