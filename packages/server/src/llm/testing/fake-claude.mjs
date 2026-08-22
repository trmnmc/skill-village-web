/**
 * A stand-in for the `claude` CLI, driven by its first argument. It speaks the
 * same contract the real binary was probed to speak (claude 2.1.239):
 * one JSON object on stdout; failure is `is_error: true`, which can arrive
 * with `subtype: "success"` — only `is_error` means anything.
 *
 * Behaviours:
 *   ok          — replies with text derived from the prompt so tests can
 *   slow        — like ok, after 400ms (for queue-serialization tests)
 *                 assert the prompt actually reached the child
 *   card        — replies with a valid personality-card JSON (as the model
 *                 would: a JSON string inside `result`)
 *   card-broken-once — first call returns unparseable prose, second a valid
 *                 card (state kept in a scratch file beside the script)
 *   unauthenticated — is_error with the real "Not logged in" text
 *   garbage     — prints something that is not JSON
 *   hang        — never replies (for the timeout path)
 *   exit-2      — exits nonzero with nothing on stdout
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const behaviour = process.argv[2] ?? 'ok';
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  const prompt = Buffer.concat(chunks).toString('utf8');

  const reply = (result, extra = {}) => {
    process.stdout.write(JSON.stringify({
      type: 'result', subtype: 'success', is_error: false,
      result,
      usage: { input_tokens: 120, output_tokens: 45, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      session_id: 'fake', total_cost_usd: 0,
      ...extra,
    }));
    process.exit(0);
  };

  const card = JSON.stringify({
    nickname: 'Nit',
    temperament: 'a fastidious detective',
    voice: 'clipped and faintly smug',
    quirks: ['squints at diffs', 'alphabetises everything'],
    likes: ['small commits'],
    dislikes: ['force pushes'],
    lines: Array.from({ length: 20 }, (_, i) => `canned line ${i + 1}`),
  });

  switch (behaviour) {
    case 'ok':
      return reply(`echo:${prompt.slice(0, 40)}`);
    case 'slow':
      // Same reply as 'ok', 400ms later — lets tests measure queueing.
      setTimeout(() => reply(`echo:${prompt.slice(0, 40)}`), 400);
      return;
    case 'card':
      return reply(card);
    case 'card-broken-once': {
      const marker = join(dirname(fileURLToPath(import.meta.url)), '.broken-once');
      if (!existsSync(marker)) {
        writeFileSync(marker, '1');
        return reply('I would love to, but here is prose instead of JSON.');
      }
      return reply(card);
    }
    case 'unauthenticated':
      return reply('Not logged in · Please run /login', {
        is_error: true,
        usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      });
    case 'garbage':
      process.stdout.write('warning: something went sideways\n');
      return process.exit(0);
    case 'hang':
      // An empty exit would read as 'malformed'; a live timer keeps the child
      // running until the caller's timeout kills it, which is the point.
      setInterval(() => {}, 60_000);
      return;
    case 'exit-2':
      return process.exit(2);
    default:
      process.stderr.write(`unknown behaviour ${behaviour}`);
      process.exit(3);
  }
});
