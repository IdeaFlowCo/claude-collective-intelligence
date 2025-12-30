#!/usr/bin/env node

/**
 * CCI Search Tool
 *
 * Search the knowledge base for relevant entries.
 * Can be used from CLI or imported as a module.
 */

import { searchEntries, getStats, getEntry, loadAllEntries } from './storage.js';

/**
 * Format an entry for display
 * @param {import('./schema.js').KnowledgeEntry} entry
 * @param {boolean} verbose
 * @returns {string}
 */
function formatEntry(entry, verbose = false) {
  const lines = [];
  const date = new Date(entry.timestamp).toLocaleDateString();

  lines.push(`\n[${'='.repeat(60)}]`);
  lines.push(`ID: ${entry.id}`);
  lines.push(`Date: ${date} | Source: ${entry.source} | Tags: ${entry.tags.join(', ') || 'none'}`);
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`PROBLEM:`);
  lines.push(entry.problem.slice(0, verbose ? 2000 : 300) + (entry.problem.length > (verbose ? 2000 : 300) ? '...' : ''));
  lines.push(`${'─'.repeat(60)}`);
  lines.push(`SOLUTION:`);
  lines.push(entry.solution.slice(0, verbose ? 5000 : 500) + (entry.solution.length > (verbose ? 5000 : 500) ? '...' : ''));

  if (verbose && entry.context) {
    lines.push(`${'─'.repeat(60)}`);
    lines.push(`CONTEXT: ${entry.context}`);
  }

  if (verbose && entry.toolsUsed.length > 0) {
    lines.push(`TOOLS USED: ${entry.toolsUsed.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Main search function for CLI
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
CCI Search - Query the Claude Collective Intelligence knowledge base

Usage:
  node search.js <query>           Search for entries matching query
  node search.js --stats           Show knowledge base statistics
  node search.js --list [n]        List recent entries (default 10)
  node search.js --get <id>        Get a specific entry by ID
  node search.js --tags            List all tags
  node search.js -v <query>        Verbose output (full problem/solution)

Examples:
  node search.js "react hooks"
  node search.js "api authentication"
  node search.js --stats
  node search.js -v "typescript error"
`);
    process.exit(0);
  }

  // Stats command
  if (args.includes('--stats')) {
    const stats = getStats();
    console.log('\n=== CCI Knowledge Base Stats ===\n');
    console.log(`Total entries: ${stats.totalEntries}`);
    console.log('\nTop tags:');
    for (const [tag, count] of stats.topTags) {
      console.log(`  ${tag}: ${count}`);
    }
    console.log('\nContributors:');
    for (const [source, count] of stats.sources) {
      console.log(`  ${source}: ${count}`);
    }
    console.log('\nRecent activity:');
    for (const [date, count] of stats.recentDates) {
      console.log(`  ${date}: ${count} entries`);
    }
    process.exit(0);
  }

  // List command
  if (args.includes('--list')) {
    const limitIdx = args.indexOf('--list') + 1;
    const limit = parseInt(args[limitIdx]) || 10;
    const entries = loadAllEntries()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);

    console.log(`\n=== Recent Entries (${entries.length}) ===`);
    for (const entry of entries) {
      console.log(formatEntry(entry, false));
    }
    process.exit(0);
  }

  // Get by ID command
  if (args.includes('--get')) {
    const idIdx = args.indexOf('--get') + 1;
    const id = args[idIdx];
    if (!id) {
      console.error('Please provide an entry ID');
      process.exit(1);
    }
    const entry = getEntry(id);
    if (!entry) {
      console.error(`Entry not found: ${id}`);
      process.exit(1);
    }
    console.log(formatEntry(entry, true));
    process.exit(0);
  }

  // Tags command
  if (args.includes('--tags')) {
    const entries = loadAllEntries();
    const tags = {};
    for (const entry of entries) {
      for (const tag of entry.tags) {
        tags[tag] = (tags[tag] || 0) + 1;
      }
    }
    console.log('\n=== All Tags ===\n');
    const sorted = Object.entries(tags).sort((a, b) => b[1] - a[1]);
    for (const [tag, count] of sorted) {
      console.log(`  ${tag}: ${count}`);
    }
    process.exit(0);
  }

  // Search
  const verbose = args.includes('-v');
  const query = args.filter(a => !a.startsWith('-')).join(' ');

  if (!query) {
    console.error('Please provide a search query');
    process.exit(1);
  }

  console.log(`\nSearching for: "${query}"\n`);

  const results = searchEntries(query, { limit: 10 });

  if (results.length === 0) {
    console.log('No matching entries found.');
    process.exit(0);
  }

  console.log(`Found ${results.length} matching entries:`);

  for (const entry of results) {
    console.log(formatEntry(entry, verbose));
  }
}

// Export for module use
export { searchEntries, formatEntry };

// Run if called directly
main();
