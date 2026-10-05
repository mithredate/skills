#!/usr/bin/env node
// Deterministic import of a vendored skill into the skills repo.
// Invoked by the import-skill agent skill; see ../SKILL.md.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../../');

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }
  return args;
}

function cloneUpstream(upstream, sha) {
  const tmp = execSync('mktemp -d', { encoding: 'utf8' }).trim();
  const target = join(tmp, upstream.split('/')[1]);
  execSync(`gh repo clone ${upstream} ${target} -- --depth=50`, { stdio: 'inherit' });
  try {
    execSync(`git -C ${target} cat-file -e ${sha}`, { stdio: 'ignore' });
  } catch {
    execSync(`git -C ${target} fetch --deepen=500 origin`, { stdio: 'inherit' });
  }
  execSync(`git -C ${target} checkout ${sha}`, { stdio: 'inherit' });
  return target;
}

function copyFiles(srcDir, dstDir) {
  if (existsSync(dstDir)) {
    throw new Error(`Target already exists: ${dstDir}`);
  }
  mkdirSync(dirname(dstDir), { recursive: true });
  cpSync(srcDir, dstDir, { recursive: true });
}

function buildFooter({ upstream, upstreamPath, sha, license, copyright }) {
  const url = `https://github.com/${upstream}/tree/${sha}/${upstreamPath}`;
  return `\n---\n_Adapted from [${upstream}/${upstreamPath}](${url}) — ${license} ${copyright}._\n`;
}

function appendFooter(skillMdPath, footer) {
  const content = readFileSync(skillMdPath, 'utf8');
  writeFileSync(skillMdPath, content.replace(/\s*$/, '') + footer);
}

function updateMarketplace({ targetPlugin, targetName }) {
  const path = join(REPO_ROOT, '.claude-plugin/marketplace.json');
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const plugin = json.plugins.find((p) => p.name === targetPlugin);
  if (!plugin) {
    throw new Error(`Plugin not registered in marketplace.json: ${targetPlugin}`);
  }
  if (!plugin.skills) plugin.skills = [];
  const skillRef = `./skills/${targetName}`;
  if (!plugin.skills.includes(skillRef)) plugin.skills.push(skillRef);
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
}

function bumpPluginVersion(targetPlugin) {
  // Installers update a plugin only when its version changes. A new skill
  // without a bump is listed in the marketplace but absent from the cache,
  // and the whole plugin fails to load.
  const path = join(REPO_ROOT, targetPlugin, '.claude-plugin/plugin.json');
  const json = JSON.parse(readFileSync(path, 'utf8'));
  const [major, minor, patch] = json.version.split('.').map(Number);
  const previous = json.version;
  json.version = `${major}.${minor}.${patch + 1}`;
  writeFileSync(path, JSON.stringify(json, null, 2) + '\n');
  return { previous, next: json.version };
}

function updateNotices({ upstream, license, copyright, targetPlugin, targetName }) {
  const path = join(REPO_ROOT, 'NOTICES.md');
  let content = readFileSync(path, 'utf8');
  const upstreamLabel = upstream.split('/')[1] || upstream;
  const heading = `### ${upstreamLabel}`;
  const entry = `${targetPlugin}/${targetName}`;
  const block =
    `${heading}\n` +
    `- **Repository:** https://github.com/${upstream}\n` +
    `- **License:** ${license}\n` +
    `- **Copyright:** ${copyright}\n` +
    `- **Vendored skills:** ${entry}\n`;

  if (content.includes(heading)) {
    const re = new RegExp(`(### ${upstreamLabel}[\\s\\S]*?\\*\\*Vendored skills:\\*\\* )([^\\n]+)`);
    content = content.replace(re, (_, prefix, list) => {
      const items = list.split(',').map((s) => s.trim());
      if (!items.includes(entry)) items.push(entry);
      return prefix + items.join(', ');
    });
  } else if (/_None yet[^\n]*_/.test(content)) {
    content = content.replace(/_None yet[^\n]*_\n*/, block + '\n');
  } else {
    content = content.replace(/(<!--)/, block + '\n$1');
  }
  writeFileSync(path, content);
}

function main() {
  const args = parseArgs();
  const required = [
    'upstream',
    'upstream-path',
    'upstream-sha',
    'license',
    'copyright',
    'target-plugin',
    'target-name',
  ];
  const missing = required.filter((r) => !args[r]);
  if (missing.length) {
    console.error(`Missing required args: ${missing.map((m) => `--${m}`).join(' ')}`);
    process.exit(1);
  }

  const upstreamClone = cloneUpstream(args.upstream, args['upstream-sha']);
  const srcDir = join(upstreamClone, args['upstream-path']);
  const dstDir = join(REPO_ROOT, args['target-plugin'], 'skills', args['target-name']);

  copyFiles(srcDir, dstDir);

  const footer = buildFooter({
    upstream: args.upstream,
    upstreamPath: args['upstream-path'],
    sha: args['upstream-sha'],
    license: args.license,
    copyright: args.copyright,
  });
  appendFooter(join(dstDir, 'SKILL.md'), footer);

  updateMarketplace({
    targetPlugin: args['target-plugin'],
    targetName: args['target-name'],
  });

  const version = bumpPluginVersion(args['target-plugin']);

  updateNotices({
    upstream: args.upstream,
    license: args.license,
    copyright: args.copyright,
    targetPlugin: args['target-plugin'],
    targetName: args['target-name'],
  });

  console.log(`Imported: ${args['target-plugin']}/skills/${args['target-name']}`);
  console.log(`Source: ${args.upstream}/${args['upstream-path']} @ ${args['upstream-sha']}`);
  console.log(`Plugin version: ${args['target-plugin']} ${version.previous} -> ${version.next}`);
}

main();
