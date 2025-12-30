#!/usr/bin/env node

/**
 * CCI - Claude Collective Intelligence CLI
 *
 * Main entry point for the CCI command line interface.
 */

import { program } from 'commander';
import { searchEntries, loadAllEntries, getStats, saveEntry, REPO_ROOT } from '../src/storage.js';
import { createEntry, validateEntry } from '../src/schema.js';
import { createInterface } from 'readline';
import { execSync, spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

program
  .name('cci')
  .description('Claude Collective Intelligence - Shared knowledge for Claude Code')
  .version('0.1.0');

program
  .command('search <query>')
  .description('Search the knowledge base')
  .option('-v, --verbose', 'Show full entries')
  .option('-l, --limit <n>', 'Limit results', '10')
  .action((query, options) => {
    const results = searchEntries(query, { limit: parseInt(options.limit) });
    if (results.length === 0) {
      console.log('No matching entries found.');
      return;
    }
    console.log(`Found ${results.length} entries:\n`);
    for (const entry of results) {
      const date = new Date(entry.timestamp).toLocaleDateString();
      console.log(`[${entry.id.slice(0, 8)}] ${date} - ${entry.tags.join(', ')}`);
      console.log(`  Problem: ${entry.problem.slice(0, 100)}...`);
      if (options.verbose) {
        console.log(`  Solution: ${entry.solution.slice(0, 200)}...`);
      }
      console.log('');
    }
  });

program
  .command('stats')
  .description('Show knowledge base statistics')
  .action(() => {
    const stats = getStats();
    console.log('\n=== CCI Knowledge Base ===\n');
    console.log(`Total entries: ${stats.totalEntries}`);
    console.log(`\nTop tags: ${stats.topTags.map(([t, c]) => `${t}(${c})`).join(', ')}`);
    console.log(`Contributors: ${stats.sources.map(([s, c]) => `${s}(${c})`).join(', ')}`);
  });

program
  .command('capture <transcript>')
  .description('Capture a Claude Code session')
  .option('-f, --force', 'Force prompt even if no signals detected')
  .option('--session <id>', 'Session ID')
  .option('--cwd <path>', 'Project path')
  .action((transcript, options) => {
    const scriptPath = join(REPO_ROOT, 'src', 'capture.js');
    const args = [scriptPath, transcript];
    if (options.session) args.push(options.session);
    if (options.cwd) args.push(options.cwd);
    if (options.force) args.push('--force');

    const result = spawnSync('node', args, { stdio: 'inherit' });
    if (result.status && result.status !== 0) {
      process.exit(result.status);
    }
  });

program
  .command('setup')
  .description('Set up CCI hooks and skills in your Claude Code installation')
  .action(async () => {
    console.log('\n=== CCI Setup ===\n');

    const homeDir = process.env.HOME;
    const claudeDir = join(homeDir, '.claude');
    const settingsPath = join(claudeDir, 'settings.json');

    // Ensure .claude directory exists
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
      console.log('Created ~/.claude directory');
    }

    // Create hooks directory
    const hooksDir = join(claudeDir, 'hooks');
    if (!existsSync(hooksDir)) {
      mkdirSync(hooksDir, { recursive: true });
      console.log('Created ~/.claude/hooks directory');
    }

    // Copy hook script
    const hookSource = join(REPO_ROOT, 'hooks', 'session-end.sh');
    const hookDest = join(hooksDir, 'cci-capture.sh');
    if (existsSync(hookSource)) {
      copyFileSync(hookSource, hookDest);
      execSync(`chmod +x "${hookDest}"`);
      console.log(`Installed hook: ${hookDest}`);
    }

    // Create/update settings.json
    let settings = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch (e) {
        console.log('Could not parse existing settings.json, creating new one');
      }
    }

    // Add SessionEnd hook
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks.SessionEnd) settings.hooks.SessionEnd = [];

    const hookConfig = {
      matcher: '',
      hooks: [{
        type: 'command',
        command: hookDest
      }]
    };

    // Check if already installed
    const alreadyInstalled = settings.hooks.SessionEnd.some(
      h => h.hooks?.some(hook => hook.command?.includes('cci-capture'))
    );

    if (!alreadyInstalled) {
      settings.hooks.SessionEnd.push(hookConfig);
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Added SessionEnd hook to settings.json');
    } else {
      console.log('Hook already installed in settings.json');
    }

    // Create skill directory
    const skillsDir = join(claudeDir, 'skills', 'cci');
    if (!existsSync(skillsDir)) {
      mkdirSync(skillsDir, { recursive: true });
    }

    // Copy skill
    const skillSource = join(REPO_ROOT, 'skills', 'cci', 'SKILL.md');
    const skillDest = join(skillsDir, 'SKILL.md');
    if (existsSync(skillSource)) {
      copyFileSync(skillSource, skillDest);
      console.log(`Installed skill: ${skillDest}`);
    }

    console.log('\n=== Setup Complete ===\n');
    console.log('CCI is now configured! Here\'s what was installed:');
    console.log('');
    console.log('1. SessionEnd hook - prompts to save solutions when you exit Claude Code');
    console.log('2. CCI skill - lets Claude search the knowledge base during conversations');
    console.log('');
    console.log('To start using CCI:');
    console.log('  - Complete a Claude Code session and you\'ll be prompted to save');
    console.log('  - Ask Claude to "search CCI for <topic>" to find existing solutions');
    console.log('');
    console.log(`Knowledge base location: ${join(REPO_ROOT, 'knowledge')}`);
  });

program
  .command('add')
  .description('Manually add a knowledge entry')
  .action(async () => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const ask = (q) => new Promise(r => rl.question(q, r));

    console.log('\n=== Add Knowledge Entry ===\n');

    const problem = await ask('Problem/Question:\n');
    const solution = await ask('\nSolution/Answer:\n');
    const tags = await ask('\nTags (comma-separated): ');
    const source = await ask('Your name/alias: ');

    const entry = createEntry({
      problem,
      solution,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      source: source || 'anonymous',
      context: 'manually added'
    });

    const validation = validateEntry(entry);
    if (!validation.valid) {
      console.error('\nValidation failed:', validation.errors.join(', '));
      rl.close();
      return;
    }

    const result = saveEntry(entry);
    console.log('\n' + result.message);
    rl.close();
  });

program
  .command('sync')
  .description('Sync knowledge base with git remote')
  .action(() => {
    console.log('Syncing with remote...\n');
    try {
      execSync('git pull --rebase', { cwd: REPO_ROOT, stdio: 'inherit' });
      execSync('git add knowledge/', { cwd: REPO_ROOT, stdio: 'inherit' });
      const status = execSync('git status --porcelain knowledge/', { cwd: REPO_ROOT }).toString();
      if (status.trim()) {
        execSync('git commit -m "cci: sync knowledge base"', { cwd: REPO_ROOT, stdio: 'inherit' });
        execSync('git push', { cwd: REPO_ROOT, stdio: 'inherit' });
        console.log('\nKnowledge base synced!');
      } else {
        console.log('Nothing to sync.');
      }
    } catch (e) {
      console.error('Sync failed:', e.message);
    }
  });

program.parse();
