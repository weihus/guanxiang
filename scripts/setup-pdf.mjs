import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, copyFileSync, chmodSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tools = join(root, '.tools');
const fonts = join(tools, 'fonts');
const pandocVersion = '3.6.4';
const typstVersion = '0.13.1';
const serifRef = '7889f11bf31170b5d092a083b357c8c8130f89e0';
const sansRef = 'a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2';
const symbolsRef = 'ffebf8c1ee449e544955a7e813c54f9b73848eac';
mkdirSync(fonts, { recursive: true });

async function download(url, target) {
  if (existsSync(target)) return;
  console.log(`下载 ${url}`);
  const partial = `${target}.partial`;
  execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--connect-timeout', '20', '--max-time', '180', '--output', partial, url], { stdio: 'inherit' });
  const data = readFileSync(partial);
  if (!data.length) throw new Error(`下载为空：${url}`);
  renameSync(partial, target);
  console.log(`SHA256 ${createHash('sha256').update(data).digest('hex')} ${target}`);
}

function githubJSON(route) {
  const useGH = process.env.PDF_GITHUB_API === 'gh';
  const command = useGH ? 'gh' : 'curl';
  const args = useGH ? ['api', route] : ['--fail', '--location', '--silent', '--show-error', '--max-time', '180', `https://api.github.com/${route}`];
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

function fontFile(repo, ref, path, name) {
  const target = join(fonts, name);
  if (existsSync(target) && readFileSync(target).length > 100) return;
  console.log(`下载字体资源 ${repo}/${path}@${ref}`);
  const entry = githubJSON(`repos/${repo}/contents/${path}?ref=${ref}`);
  const blob = entry.encoding === 'base64' ? entry : githubJSON(`repos/${repo}/git/blobs/${entry.sha}`);
  if (blob.encoding !== 'base64') throw new Error(`字体资源未返回 base64：${name}`);
  const data = Buffer.from(blob.content, 'base64');
  const gitHash = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
  if (gitHash !== entry.sha || data.length !== entry.size) throw new Error(`字体资源校验失败：${name}`);
  writeFileSync(`${target}.partial`, data);
  renameSync(`${target}.partial`, target);
}

function findFile(folder, name) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isFile() && item.name === name) return path;
    if (item.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    }
  }
}

async function installEngines() {
  const mac = process.platform === 'darwin';
  if (!mac && process.platform !== 'linux') throw new Error('PDF 自动安装目前支持 macOS 和 Linux');
  if (!['x64', 'arm64'].includes(process.arch)) throw new Error(`不支持的架构：${process.arch}`);
  const arm = process.arch === 'arm64';
  const pandocArchive = mac
    ? `pandoc-${pandocVersion}-${arm ? 'arm64' : 'x86_64'}-macOS.zip`
    : `pandoc-${pandocVersion}-linux-${arm ? 'arm64' : 'amd64'}.tar.gz`;
  const typstArchive = `typst-${arm ? 'aarch64' : 'x86_64'}-${mac ? 'apple-darwin' : 'unknown-linux-musl'}.tar.xz`;
  for (const engine of [
    { name: 'pandoc', repo: 'jgm/pandoc', tag: pandocVersion, archive: pandocArchive, binary: 'bin/pandoc' },
    { name: 'typst', repo: 'typst/typst', tag: `v${typstVersion}`, archive: typstArchive, binary: 'typst' },
  ]) {
    const dest = join(tools, engine.name, engine.binary);
    if (existsSync(dest)) continue;
    const archive = join(tools, engine.archive);
    await download(`https://github.com/${engine.repo}/releases/download/${engine.tag}/${engine.archive}`, archive);
    const unpacked = join(tools, `unpack-${engine.name}`);
    mkdirSync(unpacked, { recursive: true });
    if (engine.archive.endsWith('.zip')) execFileSync('unzip', ['-q', '-o', archive, '-d', unpacked]);
    else execFileSync('tar', ['-xf', archive, '-C', unpacked]);
    const binary = findFile(unpacked, engine.name);
    if (!binary) throw new Error(`归档缺少 ${engine.name}`);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(binary, dest);
    chmodSync(dest, 0o755);
    console.log(execFileSync(dest, ['--version'], { encoding: 'utf8' }).split('\n')[0]);
  }
}

try {
  await installEngines();
  for (const [family, ref, prefix] of [
    ['source-han-serif', serifRef, 'SourceHanSerifSC'],
    ['source-han-sans', sansRef, 'SourceHanSansSC'],
  ]) {
    for (const weight of ['Regular', 'Bold']) {
      const name = `${prefix}-${weight}.otf`;
      fontFile(`adobe-fonts/${family}`, ref, `OTF/SimplifiedChinese/${name}`, name);
    }
    fontFile(`adobe-fonts/${family}`, ref, 'LICENSE.txt', `${family}-LICENSE.txt`);
  }
  fontFile('notofonts/noto-fonts', symbolsRef, 'hinted/ttf/NotoSansSymbols2/NotoSansSymbols2-Regular.ttf', 'NotoSansSymbols2-Regular.ttf');
  fontFile('notofonts/noto-fonts', symbolsRef, 'LICENSE', 'noto-LICENSE.txt');
  console.log('项目本地 PDF 工具与开放字体已就绪。');
} catch (error) {
  console.error(`PDF 依赖安装失败：${error.message}`);
  process.exitCode = 1;
}
