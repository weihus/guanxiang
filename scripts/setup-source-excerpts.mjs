import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { link, readFile, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const directory = new URL('../references/sources/', import.meta.url);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function prepare(entry) {
  const name = entry.excerpt ?? entry.file;
  if (basename(name) !== name) throw new Error('无效的底本文件名');
  const target = new URL(name, directory);
  const spec = entry.local_excerpt;
  const existing = await readFile(target).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing) {
    if (sha256(existing) !== spec.sha256) throw new Error(`本地底本与记录不符，请检查 ${name}。`);
    return;
  }

  const route = `repos/${entry.repository}/git/blobs/${entry.blob}`;
  const accept = 'Accept: application/vnd.github.raw+json';
  const options = { encoding: 'buffer', timeout: 60000, maxBuffer: 4 * 1024 * 1024 };
  const { stdout: payload } = process.env.GH_TOKEN && process.env.GITHUB_ACTIONS === 'true'
    ? await run('gh', ['api', '-H', accept, route], options)
    : await run('curl', ['-fsSL', '--retry', '2', '--max-time', '45', '-H', accept, `https://api.github.com/${route}`], options);

  // The API can return raw bytes or a JSON envelope, depending on the cache.
  const bytes = payload[0] === 0x7b
    ? Buffer.from(JSON.parse(payload.toString()).content, 'base64')
    : payload;
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (blob !== entry.blob) throw new Error(`上游文件校验失败：${name}`);
  const excerpt = bytes.subarray(spec.offset, spec.offset + spec.length);
  if (sha256(excerpt) !== spec.sha256) throw new Error(`摘录校验失败：${name}`);
  const temporary = new URL(`.${name}.${randomUUID()}.tmp`, directory);
  try {
    await writeFile(temporary, excerpt, { flag: 'wx' });
    await link(temporary, target);
  } catch (error) {
    if (error.code !== 'EEXIST' || sha256(await readFile(target)) !== spec.sha256) throw error;
  } finally {
    await rm(temporary, { force: true });
  }
  console.log(`已取回并校验底本：${name}`);
}

try {
  const manifests = await Promise.all(['provenance.json', 'shuogua-provenance.json'].map(async name =>
    JSON.parse(await readFile(new URL(name, directory), 'utf8'))));
  await Promise.all(manifests.flat().map(prepare));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
