#!/usr/bin/env node

/**
 * CCI Capture Script
 *
 * Reads a Claude Code session transcript and extracts problem-solution pairs.
 * Can be run manually or triggered by a SessionEnd hook.
 */

import { readFileSync, existsSync } from 'fs';
import { createInterface } from 'readline';
import { createEntry, validateEntry } from './schema.js';
import { saveEntry } from './storage.js';

/**
 * Parse a Claude Code transcript JSONL file
 * @param {string} transcriptPath
 * @returns {Object[]}
 */
function parseTranscript(transcriptPath) {
  if (!existsSync(transcriptPath)) {
    console.error(`Transcript not found: ${transcriptPath}`);
    process.exit(1);
  }

  const content = readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());

  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      console.error(`Failed to parse line ${i + 1}`);
      return null;
    }
  }).filter(Boolean);
}

/**
 * Extract key information from transcript
 * @param {Object[]} messages
 * @returns {Object}
 */
function analyzeTranscript(messages) {
  const userMessages = [];
  const assistantMessages = [];
  const toolsUsed = new Set();
  const filesModified = new Set();

  for (const msg of messages) {
    if (msg.type === 'user' || msg.role === 'user') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content?.map(c => c.text || '').join('\n') || '';
      if (content.trim()) userMessages.push(content);
    }

    if (msg.type === 'assistant' || msg.role === 'assistant') {
      const content = typeof msg.content === 'string'
        ? msg.content
        : msg.content?.map(c => c.text || '').join('\n') || '';
      if (content.trim()) assistantMessages.push(content);

      // Extract tool uses
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            toolsUsed.add(block.name);
            // Track file modifications
            if (['Write', 'Edit'].includes(block.name) && block.input?.file_path) {
              filesModified.add(block.input.file_path);
            }
          }
        }
      }
    }
  }

  // Get the initial problem (first substantive user message)
  const initialProblem = userMessages.find(m =>
    m.length > 20 && !m.match(/^(yes|no|y|n|ok|thanks|thank you)$/i)
  ) || userMessages[0] || '';

  // Get the final response/solution (last assistant message with substance)
  const solutions = assistantMessages.filter(m => m.length > 50);
  const finalSolution = solutions[solutions.length - 1] || assistantMessages[assistantMessages.length - 1] || '';

  return {
    problem: initialProblem,
    solution: finalSolution,
    messageCount: messages.length,
    toolsUsed: Array.from(toolsUsed),
    filesModified: Array.from(filesModified),
    userMessageCount: userMessages.length,
    assistantMessageCount: assistantMessages.length
  };
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
  let transcriptPath = process.argv[2];
  let sessionId = process.argv[3] || '';
  let cwd = process.argv[4] || process.cwd();

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
  const analysis = analyzeTranscript(messages);

  console.log('Session summary:');
  console.log(`  Messages: ${analysis.messageCount}`);
  console.log(`  Tools used: ${analysis.toolsUsed.join(', ') || 'none'}`);
  console.log(`  Files modified: ${analysis.filesModified.length}`);
  console.log('');

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

  // Create entry
  const entry = createEntry({
    problem: editProblem || analysis.problem,
    solution: editSolution || analysis.solution,
    tags: editTags ? editTags.split(',').map(t => t.trim()) : tags,
    context: `Project: ${cwd}\nFiles modified: ${analysis.filesModified.join(', ')}`,
    source: source || 'anonymous',
    sessionId: sessionId,
    projectPath: cwd,
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
