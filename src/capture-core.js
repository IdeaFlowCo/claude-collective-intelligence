/**
 * Core transcript parsing and analysis for CCI capture.
 */

import { readFileSync, existsSync } from 'fs';

const FAILURE_PATTERNS = [
  /did(?:n't| not) work/i,
  /not working/i,
  /still (?:fails?|failing|error)/i,
  /\berror\b/i,
  /\bexception\b/i,
  /\btraceback\b/i,
  /stack trace/i,
  /\bfailed\b/i,
  /can't|cannot|couldn't|could not/i,
  /doesn't|does not/i,
  /won't|will not/i,
  /\bbroken\b/i,
  /\bissue\b/i,
  /\bproblem\b/i,
  /\bstuck\b/i,
  /\bhangs?\b/i
];

const SUCCESS_PATTERNS = [
  /\bworks?\b/i,
  /\bfixed\b/i,
  /\bsolved\b/i,
  /that did it/i,
  /that worked/i,
  /\bperfect\b/i,
  /\bawesome\b/i,
  /\bthanks\b/i,
  /\bthank you\b/i,
  /\bresolved\b/i,
  /\ball set\b/i,
  /\bgot it working\b/i
];

const SAVE_PATTERNS = [
  /save (?:this|that)/i,
  /save to cci/i,
  /add to cci/i,
  /remember this/i,
  /log this/i,
  /store this/i
];

/**
 * Parse a Claude Code transcript JSONL file
 * @param {string} transcriptPath
 * @returns {Object[]}
 */
export function parseTranscript(transcriptPath) {
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

function extractRole(entry) {
  const role = entry?.message?.role || entry?.role || entry?.type;
  if (!role) return null;
  const lower = String(role).toLowerCase();
  if (lower === 'user' || lower === 'assistant') return lower;
  return null;
}

function extractContent(entry) {
  if (entry?.message?.content !== undefined) return entry.message.content;
  if (entry?.content !== undefined) return entry.content;
  return '';
}

function extractText(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const texts = [];
    for (const block of content) {
      if (!block || block.type === 'thinking' || block.type === 'tool_use') continue;
      if (typeof block.text === 'string') {
        texts.push(block.text);
      }
    }
    return texts.join('\n');
  }
  if (typeof content.text === 'string') return content.text;
  return '';
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return [];
  return content.filter(block => block?.type === 'tool_use' && block?.name);
}

function matchesAny(text, patterns) {
  return patterns.some(p => p.test(text));
}

function isSubstantiveUser(text) {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  if (/^(yes|no|y|n|ok|okay|thanks|thank you|cool|great|perfect|awesome)$/i.test(trimmed)) return false;
  return true;
}

function isSubstantiveAssistant(text) {
  return text.trim().length >= 40;
}

function isWebTool(name) {
  const lower = String(name).toLowerCase();
  return lower.includes('web') || lower.includes('browser');
}

/**
 * Analyze transcript content to extract problem/solution and save signals.
 * @param {Object[]} messages
 * @param {{minExchanges?: number}} options
 * @returns {Object}
 */
export function analyzeTranscript(messages, options = {}) {
  const toolsUsed = new Set();
  const filesModified = new Set();
  const turns = [];

  for (const msg of messages) {
    const role = extractRole(msg);
    if (!role) continue;

    const content = extractContent(msg);
    const text = extractText(content);
    const toolBlocks = extractToolUses(content);

    const toolNames = [];
    for (const block of toolBlocks) {
      toolsUsed.add(block.name);
      toolNames.push(block.name);
      if (['Write', 'Edit'].includes(block.name) && block.input?.file_path) {
        filesModified.add(block.input.file_path);
      }
    }

    if (!text && toolNames.length === 0) continue;

    const last = turns[turns.length - 1];
    if (last && last.role === role) {
      if (text) {
        last.text = last.text ? `${last.text}\n${text}` : text;
      }
      if (toolNames.length) {
        last.toolsUsed.push(...toolNames);
      }
    } else {
      turns.push({ role, text: text || '', toolsUsed: toolNames });
    }
  }

  const userTurns = [];
  const assistantTurns = [];
  turns.forEach((turn, idx) => {
    if (turn.role === 'user') {
      userTurns.push({ text: turn.text, turnIndex: idx });
    } else if (turn.role === 'assistant') {
      assistantTurns.push({ text: turn.text, turnIndex: idx });
    }
  });

  const failureSignals = userTurns
    .filter(t => matchesAny(t.text, FAILURE_PATTERNS))
    .map(t => ({ turnIndex: t.turnIndex, text: t.text }));

  const successSignals = userTurns
    .filter(t => matchesAny(t.text, SUCCESS_PATTERNS))
    .map(t => ({ turnIndex: t.turnIndex, text: t.text }));

  const explicitSave = userTurns.some(t => matchesAny(t.text, SAVE_PATTERNS));
  const webUsed = Array.from(toolsUsed).some(isWebTool);

  const failureSignal = failureSignals[0] || null;
  const successAfterFailure = failureSignal
    ? successSignals.find(s => s.turnIndex > failureSignal.turnIndex) || null
    : null;
  const failureToSuccess = Boolean(failureSignal && successAfterFailure);

  const minExchanges = Number.isFinite(options.minExchanges) ? options.minExchanges : 3;
  const exchangeCount = Math.min(userTurns.length, assistantTurns.length);

  const lastUserTurn = userTurns[userTurns.length - 1];
  const lastUserFailure = lastUserTurn ? matchesAny(lastUserTurn.text, FAILURE_PATTERNS) : false;

  let lastAssistantText = '';
  for (let i = assistantTurns.length - 1; i >= 0; i--) {
    if (assistantTurns[i].text.trim()) {
      lastAssistantText = assistantTurns[i].text;
      break;
    }
  }
  const lastAssistantSubstantive = lastAssistantText ? isSubstantiveAssistant(lastAssistantText) : false;
  const resolvedLikely = !lastUserFailure && lastAssistantSubstantive;

  const reasons = [];
  if (explicitSave) reasons.push('explicit_save');
  if (failureToSuccess) reasons.push('failure_to_success');
  if (webUsed) reasons.push('web_search');
  if (exchangeCount >= minExchanges && resolvedLikely) reasons.push('multi_turn_resolved');

  const shouldPrompt = reasons.length > 0;

  const initialProblem = userTurns.find(t => isSubstantiveUser(t.text))?.text || userTurns[0]?.text || '';

  let solution = '';
  if (successAfterFailure) {
    for (let i = successAfterFailure.turnIndex - 1; i >= 0; i--) {
      const turn = turns[i];
      if (turn.role === 'assistant' && turn.text.trim()) {
        solution = turn.text.trim();
        break;
      }
    }
  }

  if (!solution) {
    for (let i = turns.length - 1; i >= 0; i--) {
      const turn = turns[i];
      if (turn.role === 'assistant' && turn.text.trim()) {
        if (isSubstantiveAssistant(turn.text) || !solution) {
          solution = turn.text.trim();
          if (isSubstantiveAssistant(turn.text)) break;
        }
      }
    }
  }

  return {
    problem: initialProblem,
    solution,
    messageCount: messages.length,
    toolsUsed: Array.from(toolsUsed),
    filesModified: Array.from(filesModified),
    userMessageCount: userTurns.length,
    assistantMessageCount: assistantTurns.length,
    exchangeCount,
    failureSignals,
    successSignals,
    explicitSave,
    webUsed,
    failureToSuccess,
    shouldPrompt,
    reasons
  };
}
