/**
 * Storage layer for CCI knowledge base
 * Uses JSONL format for easy git diffs and append-only operations
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { hashEntry } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const KNOWLEDGE_DIR = join(REPO_ROOT, 'knowledge');
const KNOWLEDGE_FILE = join(KNOWLEDGE_DIR, 'entries.jsonl');
const INDEX_FILE = join(KNOWLEDGE_DIR, 'index.json');

/**
 * Ensures the knowledge directory exists
 */
export function ensureKnowledgeDir() {
  if (!existsSync(KNOWLEDGE_DIR)) {
    mkdirSync(KNOWLEDGE_DIR, { recursive: true });
  }
  if (!existsSync(KNOWLEDGE_FILE)) {
    writeFileSync(KNOWLEDGE_FILE, '');
  }
}

/**
 * Appends a new entry to the knowledge base
 * @param {import('./schema.js').KnowledgeEntry} entry
 * @returns {{success: boolean, message: string}}
 */
export function saveEntry(entry) {
  ensureKnowledgeDir();

  // Add content hash for deduplication
  entry.hash = hashEntry(entry);

  // Check for duplicates
  const existing = loadAllEntries();
  const duplicate = existing.find(e => e.hash === entry.hash);
  if (duplicate) {
    return {
      success: false,
      message: `Duplicate entry found (id: ${duplicate.id})`
    };
  }

  // Append to JSONL
  const line = JSON.stringify(entry) + '\n';
  appendFileSync(KNOWLEDGE_FILE, line);

  // Update index
  updateIndex(entry);

  return {
    success: true,
    message: `Entry saved with id: ${entry.id}`
  };
}

/**
 * Loads all entries from the knowledge base
 * @returns {import('./schema.js').KnowledgeEntry[]}
 */
export function loadAllEntries() {
  ensureKnowledgeDir();

  if (!existsSync(KNOWLEDGE_FILE)) {
    return [];
  }

  const content = readFileSync(KNOWLEDGE_FILE, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  return lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.error('Failed to parse line:', line);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Updates the search index
 * @param {import('./schema.js').KnowledgeEntry} entry
 */
function updateIndex(entry) {
  let index = { tags: {}, dates: {}, sources: {} };

  if (existsSync(INDEX_FILE)) {
    try {
      index = JSON.parse(readFileSync(INDEX_FILE, 'utf-8'));
    } catch (e) {
      // Start fresh if index is corrupted
    }
  }

  // Index by tags
  for (const tag of entry.tags) {
    if (!index.tags[tag]) index.tags[tag] = [];
    index.tags[tag].push(entry.id);
  }

  // Index by date (YYYY-MM-DD)
  const date = entry.timestamp.split('T')[0];
  if (!index.dates[date]) index.dates[date] = [];
  index.dates[date].push(entry.id);

  // Index by source
  if (!index.sources[entry.source]) index.sources[entry.source] = [];
  index.sources[entry.source].push(entry.id);

  writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2));
}

/**
 * Search entries by text
 * @param {string} query
 * @param {Object} options
 * @returns {import('./schema.js').KnowledgeEntry[]}
 */
export function searchEntries(query, options = {}) {
  const entries = loadAllEntries();
  const queryLower = query.toLowerCase();
  const words = queryLower.split(/\s+/).filter(w => w.length > 2);

  // Score each entry
  const scored = entries.map(entry => {
    let score = 0;

    // Check problem field
    const problemLower = entry.problem.toLowerCase();
    if (problemLower.includes(queryLower)) score += 10;
    for (const word of words) {
      if (problemLower.includes(word)) score += 2;
    }

    // Check solution field
    const solutionLower = entry.solution.toLowerCase();
    if (solutionLower.includes(queryLower)) score += 5;
    for (const word of words) {
      if (solutionLower.includes(word)) score += 1;
    }

    // Check tags
    for (const tag of entry.tags) {
      if (queryLower.includes(tag.toLowerCase())) score += 3;
      for (const word of words) {
        if (tag.toLowerCase().includes(word)) score += 2;
      }
    }

    // Check context
    if (entry.context && entry.context.toLowerCase().includes(queryLower)) {
      score += 2;
    }

    return { entry, score };
  });

  // Filter and sort by score
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 10)
    .map(s => s.entry);
}

/**
 * Get entry by ID
 * @param {string} id
 * @returns {import('./schema.js').KnowledgeEntry|null}
 */
export function getEntry(id) {
  const entries = loadAllEntries();
  return entries.find(e => e.id === id) || null;
}

/**
 * Get statistics about the knowledge base
 * @returns {Object}
 */
export function getStats() {
  const entries = loadAllEntries();
  const tags = {};
  const sources = {};
  const dates = {};

  for (const entry of entries) {
    for (const tag of entry.tags) {
      tags[tag] = (tags[tag] || 0) + 1;
    }
    sources[entry.source] = (sources[entry.source] || 0) + 1;
    const date = entry.timestamp.split('T')[0];
    dates[date] = (dates[date] || 0) + 1;
  }

  return {
    totalEntries: entries.length,
    topTags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 10),
    sources: Object.entries(sources).sort((a, b) => b[1] - a[1]),
    recentDates: Object.entries(dates).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7)
  };
}

export { KNOWLEDGE_DIR, KNOWLEDGE_FILE, REPO_ROOT };
