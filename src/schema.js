/**
 * CCI Knowledge Entry Schema
 *
 * Each entry represents a problem-solution pair captured from a Claude Code session.
 */

import crypto from 'crypto';

/**
 * @typedef {Object} KnowledgeEntry
 * @property {string} id - Unique identifier (uuid)
 * @property {string} timestamp - ISO 8601 date when captured
 * @property {string} problem - The problem/question that was solved
 * @property {string} solution - The solution/answer that worked
 * @property {string[]} tags - Searchable tags (languages, frameworks, concepts)
 * @property {string} context - Additional context (file paths, project type, etc.)
 * @property {string} source - Who contributed this (anonymous, username, team)
 * @property {string} sessionId - Original Claude Code session ID
 * @property {string} projectPath - Project where this was captured (optional, can be anonymized)
 * @property {number} messageCount - How many messages in the original conversation
 * @property {string[]} toolsUsed - What tools Claude used to solve this
 * @property {string} [hash] - Content hash for deduplication
 */

/**
 * Creates a new knowledge entry with defaults
 * @param {Partial<KnowledgeEntry>} data
 * @returns {KnowledgeEntry}
 */
export function createEntry(data) {
  return {
    id: data.id || crypto.randomUUID(),
    timestamp: data.timestamp || new Date().toISOString(),
    problem: data.problem || '',
    solution: data.solution || '',
    tags: data.tags || [],
    context: data.context || '',
    source: data.source || 'anonymous',
    sessionId: data.sessionId || '',
    projectPath: data.projectPath || '',
    messageCount: data.messageCount || 0,
    toolsUsed: data.toolsUsed || [],
    hash: data.hash || null
  };
}

/**
 * Validates a knowledge entry
 * @param {KnowledgeEntry} entry
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateEntry(entry) {
  const errors = [];

  if (!entry.id) errors.push('id is required');
  if (!entry.problem || entry.problem.trim().length < 10) {
    errors.push('problem must be at least 10 characters');
  }
  if (!entry.solution || entry.solution.trim().length < 10) {
    errors.push('solution must be at least 10 characters');
  }
  if (!entry.timestamp) errors.push('timestamp is required');

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Generates a content hash for deduplication
 * @param {KnowledgeEntry} entry
 * @returns {string}
 */
export function hashEntry(entry) {
  const content = `${entry.problem.toLowerCase().trim()}|${entry.solution.toLowerCase().trim()}`;
  // Simple hash - in production use crypto.createHash
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}
