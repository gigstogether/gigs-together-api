import fs from 'node:fs/promises';
import path from 'node:path';

function usage() {
  const scriptName = path.basename(
    process.argv[1] ?? '1740960000002-tg-export-result-to-structured.js',
  );
   
  console.log(
    [
      `Usage: node ${scriptName} <input_result.json> [output.json]`,
      '',
      'Input: Telegram ChatExport result.json',
      'Output: result.cleaned.links.lines.structured.json (by default, next to input)',
    ].join('\n'),
  );
}

function extractText(textField) {
  if (typeof textField === 'string') return textField;
  if (!Array.isArray(textField)) return '';

  return textField
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return typeof part.text === 'string'
          ? part.text
          : String(part.text ?? '');
      }
      return '';
    })
    .join('');
}

function isEmptyText(textField) {
  return extractText(textField).trim().length === 0;
}

function removeEmptyTextEntities(textEntities) {
  if (!Array.isArray(textEntities)) return textEntities;
  return textEntities.filter((ent) => {
    if (!ent || typeof ent !== 'object') return true;
    if (!('text' in ent)) return true;
    if (typeof ent.text !== 'string') return true;
    return ent.text.trim().length > 0;
  });
}

function extractFirstLinkAndStrip(textEntities, textField) {
  let link;

  const entities = Array.isArray(textEntities) ? textEntities : undefined;
  const entitiesWithoutLinks = entities
    ? entities.filter((ent) => {
        if (
          ent &&
          typeof ent === 'object' &&
          ent.type === 'link' &&
          typeof ent.text === 'string' &&
          ent.text.trim().length > 0
        ) {
          if (!link) link = ent.text.trim();
          return false;
        }
        return true;
      })
    : undefined;

  // Some exports also embed links as objects in msg.text array
  const textArr = Array.isArray(textField) ? textField : undefined;
  if (textArr) {
    for (const part of textArr) {
      if (
        !link &&
        part &&
        typeof part === 'object' &&
        part.type === 'link' &&
        typeof part.text === 'string' &&
        part.text.trim().length > 0
      ) {
        link = part.text.trim();
        break;
      }
    }
  }

  return { link, textEntitiesWithoutLinks: entitiesWithoutLinks };
}

function entityToText(ent) {
  if (typeof ent === 'string') return ent;
  if (ent && typeof ent === 'object' && typeof ent.text === 'string')
    return ent.text;
  return '';
}

function splitLinesNonEmpty(s) {
  const normalized = String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return normalized
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function toUnixSecondsUTC(year, month1to12, day1to31) {
  return Math.floor(Date.UTC(year, month1to12 - 1, day1to31, 0, 0, 0) / 1000);
}

function normalizeYear(y) {
  return y < 100 ? 2000 + y : y;
}

function tryParseDateFromLine(line) {
  const s = String(line ?? '').trim();
  if (!s) return null;

  const cleaned = s.replace(/^\s*(🗓|📅)?\s*(когда|when)\s*[:\-–]?\s*/i, '');

  // "22, 23.05.2026" -> take first day
  {
    const m = cleaned.match(/(\d{1,2})\s*,\s*\d{1,2}\.(\d{1,2})\.(\d{2,4})/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = normalizeYear(Number(m[3]));
      if (day && month && year) return toUnixSecondsUTC(year, month, day);
    }
  }

  // "22-23.05.2026" / "22–23.05.2026" -> take first day
  {
    const m = cleaned.match(/(\d{1,2})\s*[-–]\s*\d{1,2}\.(\d{1,2})\.(\d{2,4})/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = normalizeYear(Number(m[3]));
      if (day && month && year) return toUnixSecondsUTC(year, month, day);
    }
  }

  // "dd.mm.yyyy" (or / or -) anywhere in the line
  {
    const m = cleaned.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = normalizeYear(Number(m[3]));
      if (day && month && year) return toUnixSecondsUTC(year, month, day);
    }
  }

  return null;
}

function extractLocationValue(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return '';
  const stripped = trimmed
    .replace(/^\s*📍\s*/i, '')
    .replace(/^\s*где\s*[:\-–]?\s*/i, '')
    .trim();
  return stripped || trimmed;
}

function normalizeChatIdWithMinus100Prefix(id) {
  const raw = String(id ?? '').trim();
  if (!raw) return id;
  if (raw.startsWith('-100')) return Number(raw);
  // Telegram "channel/supergroup" ids are often represented as -100<id>
  // We keep it numeric for downstream migrations.
  const next = `-100${raw.replace(/^-+/, '')}`;
  const n = Number(next);
  return Number.isFinite(n) ? n : id;
}

async function main() {
  const inputPath = process.argv[2];
  const outputPathArg = process.argv[3];

  if (!inputPath || inputPath === '-h' || inputPath === '--help') {
    usage();
    process.exit(inputPath ? 0 : 1);
  }

  if (path.extname(inputPath).toLowerCase() !== '.json') {
    throw new Error('Input must be a .json file (Telegram result.json).');
  }

  const raw = await fs.readFile(inputPath, 'utf8');
  const data = JSON.parse(raw);

  if (!data || typeof data !== 'object' || !Array.isArray(data.messages)) {
    throw new Error(
      'Unexpected JSON shape: expected root object with "messages" array.',
    );
  }

  const defaultOutputPath = path.join(
    path.dirname(inputPath),
    'result.cleaned.links.lines.structured.json',
  );
  const outputPath = outputPathArg ?? defaultOutputPath;

  if (path.resolve(outputPath) === path.resolve(inputPath)) {
    throw new Error(
      'Refusing to overwrite input file. Pick a different output path.',
    );
  }

  const removedKeys = new Set([
    'reactions',
    'date',
    'date_unixtime',
    'edited',
    'edited_unixtime',
    'from',
    'from_id',
  ]);

  const total = data.messages.length;
  let removed = 0;
  let kept = 0;
  let withLink = 0;
  let withTitle = 0;
  let withLocation = 0;
  let withDate = 0;

  const out = { ...data };
  out.id = normalizeChatIdWithMinus100Prefix(out.id);
  out.messages = data.messages
    .filter((msg) => {
      if (!msg || typeof msg !== 'object') return false;
      if ('reply_to_message_id' in msg) {
        removed += 1;
        return false;
      }
      if (isEmptyText(msg.text)) {
        removed += 1;
        return false;
      }
      return true;
    })
    .map((msg) => {
      const cleaned = { ...msg };
      for (const k of removedKeys) delete cleaned[k];

      // links: take first, remove link entities, drop empty text_entities, delete text
      const { link, textEntitiesWithoutLinks } = extractFirstLinkAndStrip(
        cleaned.text_entities,
        cleaned.text,
      );
      if (link) {
        cleaned.link = link;
        withLink += 1;
      }

      delete cleaned.text;

      if (Array.isArray(textEntitiesWithoutLinks)) {
        const noEmpty = removeEmptyTextEntities(textEntitiesWithoutLinks);
        cleaned.text_entities = noEmpty;
      }

      // text_entities -> lines (strings)
      if (Array.isArray(cleaned.text_entities)) {
        const combinedText = cleaned.text_entities.map(entityToText).join('');
        const lines = splitLinesNonEmpty(combinedText);
        cleaned.text_entities = lines;
      }

      // extract title/location/date from lines
      if (
        Array.isArray(cleaned.text_entities) &&
        cleaned.text_entities.length > 0
      ) {
        const lines = cleaned.text_entities.map((x) => String(x));
        const removeIdx = new Set();

        const title = (lines[0] ?? '').trim();
        if (title) {
          cleaned.title = title;
          withTitle += 1;
          removeIdx.add(0);
        }

        for (let i = 0; i < lines.length; i += 1) {
          if (removeIdx.has(i)) continue;
          if (
            lines[i].toLowerCase().includes('где') ||
            lines[i].includes('📍')
          ) {
            const loc = extractLocationValue(lines[i]);
            if (loc) {
              cleaned.location = loc;
              withLocation += 1;
              removeIdx.add(i);
            }
            break;
          }
        }

        for (let i = 0; i < lines.length; i += 1) {
          if (removeIdx.has(i)) continue;
          const ts = tryParseDateFromLine(lines[i]);
          if (ts != null) {
            cleaned.date = ts;
            withDate += 1;
            removeIdx.add(i);
            break;
          }
        }

        const remaining = lines
          .filter((_, idx) => !removeIdx.has(idx))
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        if (
          remaining.length === 1 &&
          (remaining[0] === 'Билеты:' || remaining[0] === '🎫')
        ) {
          delete cleaned.text_entities;
        } else if (remaining.length > 0) {
          cleaned.text_entities = remaining;
        } else {
          delete cleaned.text_entities;
        }
      } else {
        delete cleaned.text_entities;
      }

      kept += 1;
      return cleaned;
    });

  out.res = {
    messages_total: total,
    messages_kept: kept,
    messages_removed: removed,
  };

  await fs.writeFile(outputPath, JSON.stringify(out, null, 2), 'utf8');

   
  console.log(
    JSON.stringify(
      {
        input: inputPath,
        output: outputPath,
        messages_total: total,
        messages_kept: kept,
        messages_removed: removed,
        messages_with_link: withLink,
        messages_with_title: withTitle,
        messages_with_location: withLocation,
        messages_with_date: withDate,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
   
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
