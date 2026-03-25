#!/usr/bin/env node
/**
 * Pulls approved discoveries from Gene Collector and shows
 * what to add to seed-genes.ts for the next npm publish.
 *
 * Run: npx tsx scripts/update-seed-genes.ts
 */

const API = process.env.HELIX_API_URL ?? 'http://localhost:7842';

async function main() {
  console.log('Fetching approved discoveries...\n');
  try {
    const res = await fetch(`${API}/api/discoveries?approved=true`);
    if (!res.ok) { console.log(`API returned ${res.status}. Discoveries endpoint not available.`); return; }
    const discoveries = await res.json() as any[];
    if (!Array.isArray(discoveries) || discoveries.length === 0) { console.log('No new approved discoveries.'); return; }

    console.log(`Found ${discoveries.length} approved discoveries:\n`);
    const seeds: string[] = [];
    for (const d of discoveries) {
      console.log(`  ${d.code}/${d.category} → ${d.strategy} (q=${(d.q_value ?? 0.6).toFixed(2)})`);
      console.log(`    Pattern: "${d.error_pattern}"`);
      if (d.reasoning) console.log(`    Reasoning: ${d.reasoning}`);
      console.log(`    Platform: ${d.platform ?? 'generic'}`);
      console.log('');
      const qVal = Math.min(0.75, d.q_value ?? 0.6).toFixed(2);
      seeds.push(`  { failureCode: '${d.code}', category: '${d.category}', strategy: '${d.strategy}', params: {}, successCount: 5, avgRepairMs: 100, platforms: ['${d.platform ?? 'generic'}'], qValue: ${qVal}, consecutiveFailures: 0 },`);
    }
    console.log('\n── Add these to seed-genes.ts ──\n');
    console.log(seeds.join('\n'));
  } catch (e: any) {
    console.log(`Could not reach API: ${e.message}`);
  }
}

main();
