#!/usr/bin/env node

/**
 * CCI Capture Script
 *
 * Reads a Claude Code session transcript and extracts problem-solution pairs.
 * Can be run manually or triggered by a SessionEnd hook.
 */

import { createInterface } from 'readline';
import { createEntry, validateEntry } from './schema.js';
import { saveEntry } from './storage.js';
import { parseTranscript, analyzeTranscript } from './capture-core.js';

/**
 * Sanitize text to remove private/sensitive data before saving to public CCI repo.
 * Replaces IPs, passwords, API keys, emails, connection strings, etc. with placeholders.
 * @param {string} text
 * @returns {string}
 */
function sanitizeForPublic(text) {
  let sanitized = text;

  // Replace IP addresses (IPv4) with placeholder
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<server-ip>');

  // Replace common connection strings: bolt://host:port, mongodb://..., postgres://...
  sanitized = sanitized.replace(/(bolt|mongodb|postgres|postgresql|mysql|redis):\/\/[^\s,)'"]+/gi, '$1://HOST:PORT');

  // Replace API keys/tokens (long hex or base64 strings, 20+ chars)
  sanitized = sanitized.replace(/\b[A-Za-z0-9_-]{32,}\b/g, (match) => {
    // Skip common long words, UUIDs, and hashes that are part of the solution
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(match)) return match; // UUID
    if (/^[a-f0-9]{40}$/i.test(match)) return match; // git SHA
    return '<REDACTED_KEY>';
  });

  // Replace email addresses
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'user@example.com');

  // Replace bearer/auth tokens in examples
  sanitized = sanitized.replace(/(Bearer|Authorization:?\s*)\s*[A-Za-z0-9._-]{20,}/gi, '$1 <TOKEN>');

  return sanitized;
}

/**
 * Auto-generate tags from content
 * @param {Object} analysis
 * @returns {string[]}
 */
function generateTags(analysis) {
  const tags = new Set();
  const content = `${analysis.problem} ${analysis.solution}`.toLowerCase();

  // Programming languages
  const languages = ['javascript', 'typescript', 'python', 'rust', 'go', 'java', 'swift', 'ruby', 'php', 'c++', 'c#'];
  for (const lang of languages) {
    if (content.includes(lang)) tags.add(lang);
  }

  // Frameworks
  const frameworks = ['react', 'vue', 'angular', 'next.js', 'nextjs', 'express', 'fastapi', 'django', 'rails', 'flask', 'svelte', 'electron'];
  for (const fw of frameworks) {
    if (content.includes(fw.toLowerCase())) tags.add(fw);
  }

  // Concepts
  const concepts = ['api', 'database', 'auth', 'authentication', 'testing', 'deployment', 'docker', 'git', 'ci/cd', 'performance', 'security', 'debugging'];
  for (const concept of concepts) {
    if (content.includes(concept)) tags.add(concept);
  }

  // Tools used
  for (const tool of analysis.toolsUsed) {
    if (['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob'].includes(tool)) {
      // Don't add generic tools
    } else {
      tags.add(tool.toLowerCase());
    }
  }

  return Array.from(tags);
}

/**
 * Create readline interface for user input
 */
function createPrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask a question and get user response
 * @param {readline.Interface} rl
 * @param {string} question
 * @returns {Promise<string>}
 */
function ask(rl, question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

/**
 * Main capture flow
 */
async function main() {
  // Get transcript path from args or stdin (hook input)
  const rawArgs = process.argv.slice(2);
  const forcePrompt = rawArgs.includes('--force') || rawArgs.includes('-f')
    || process.env.CCI_FORCE_PROMPT === '1'
    || process.env.CCI_FORCE_PROMPT === 'true';
  const args = rawArgs.filter(a => !['--force', '-f'].includes(a));

  let transcriptPath = args[0];
  let sessionId = args[1] || '';
  let cwd = args[2] || process.cwd();

  // If no args, try to read hook input from stdin
  if (!transcriptPath && !process.stdin.isTTY) {
    try {
      const chunks = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      const hookInput = JSON.parse(Buffer.concat(chunks).toString());
      transcriptPath = hookInput.transcript_path;
      sessionId = hookInput.session_id || '';
      cwd = hookInput.cwd || process.cwd();
    } catch (e) {
      // Not hook input, continue
    }
  }

  if (!transcriptPath) {
    console.error('Usage: node capture.js <transcript_path> [session_id] [cwd]');
    console.error('Or pipe hook input JSON to stdin');
    process.exit(1);
  }

  console.log('\n=== Claude Collective Intelligence - Capture ===\n');
  console.log(`Analyzing transcript: ${transcriptPath}\n`);

  // Parse and analyze
  const messages = parseTranscript(transcriptPath);
  const minExchanges = parseInt(process.env.CCI_MIN_EXCHANGES || '3', 10);
  const analysis = analyzeTranscript(messages, { minExchanges });

  console.log('Session summary:');
  console.log(`  Messages: ${analysis.messageCount}`);
  console.log(`  Exchanges: ${analysis.exchangeCount}`);
  console.log(`  Tools used: ${analysis.toolsUsed.join(', ') || 'none'}`);
  console.log(`  Files modified: ${analysis.filesModified.length}`);
  console.log('');

  if (!analysis.shouldPrompt && !forcePrompt) {
    console.log('No save-worthy signals detected. Skipping.');
    console.log('Tip: run with --force to review anyway.');
    process.exit(0);
  }

  if (analysis.reasons.length > 0) {
    console.log(`Detected signals: ${analysis.reasons.join(', ')}`);
    console.log('');
  }

  // Show extracted problem/solution
  console.log('--- Extracted Problem ---');
  console.log(analysis.problem.slice(0, 500) + (analysis.problem.length > 500 ? '...' : ''));
  console.log('');

  console.log('--- Extracted Solution ---');
  console.log(analysis.solution.slice(0, 500) + (analysis.solution.length > 500 ? '...' : ''));
  console.log('');

  // Generate tags
  const tags = generateTags(analysis);
  console.log(`Auto-generated tags: ${tags.join(', ') || 'none'}`);
  console.log('');

  // Prompt user
  const rl = createPrompt();

  const save = await ask(rl, 'Save this to CCI knowledge base? (y/n): ');

  if (save.toLowerCase() !== 'y') {
    console.log('Skipped.');
    rl.close();
    process.exit(0);
  }

  // Allow editing
  const editProblem = await ask(rl, 'Edit problem? (enter new text or press Enter to keep): ');
  const editSolution = await ask(rl, 'Edit solution? (enter new text or press Enter to keep): ');
  const editTags = await ask(rl, `Edit tags? (comma-separated, or press Enter to keep [${tags.join(', ')}]): `);
  const source = await ask(rl, 'Your name/alias (or press Enter for anonymous): ');

  // Sanitize all text fields before saving (CCI is a public repo)
  const finalProblem = sanitizeForPublic(editProblem || analysis.problem);
  const finalSolution = sanitizeForPublic(editSolution || analysis.solution);
  const finalContext = sanitizeForPublic(`Files modified: ${analysis.filesModified.join(', ')}`);

  // Create entry
  const entry = createEntry({
    problem: finalProblem,
    solution: finalSolution,
    tags: editTags ? editTags.split(',').map(t => t.trim()) : tags,
    context: finalContext,
    source: source || 'anonymous',
    sessionId: sessionId,
    projectPath: '',  // Don't leak full project paths
    messageCount: analysis.messageCount,
    toolsUsed: analysis.toolsUsed
  });

  // Validate
  const validation = validateEntry(entry);
  if (!validation.valid) {
    console.error('Validation failed:', validation.errors.join(', '));
    rl.close();
    process.exit(1);
  }

  // Save
  const result = saveEntry(entry);
  console.log(result.message);

  if (result.success) {
    console.log('\nEntry saved! Don\'t forget to commit and push to share with your team.');
    console.log(`  git add knowledge/`);
    console.log(`  git commit -m "cci: add knowledge entry"`);
    console.log(`  git push`);
  }

  rl.close();
}

main().catch(console.error);
