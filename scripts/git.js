const git = require('isomorphic-git');
const fs = require('fs');
const path = require('path');

const dir = path.resolve('.');

async function getFiles(dirPath, baseDir = '') {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.join(baseDir, entry.name).replace(/\\/g, '/');

    // Skip git, node_modules, temp files
    if (
      entry.name === '.git' ||
      entry.name === 'node_modules' ||
      entry.name === 'data' ||
      entry.name.endsWith('.db') ||
      entry.name.endsWith('.db-journal') ||
      entry.name.endsWith('.log')
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files = files.concat(await getFiles(fullPath, relPath));
    } else {
      files.push(relPath);
    }
  }
  return files;
}

async function addAll() {
  const files = await getFiles(dir);
  for (const file of files) {
    await git.add({ fs, dir, filepath: file });
  }
  return files;
}

async function commit(message, authorName = 'Developer', authorEmail = 'developer@example.com') {
  await addAll();
  const sha = await git.commit({
    fs,
    dir,
    message,
    author: {
      name: authorName,
      email: authorEmail,
      timestamp: Math.floor(Date.now() / 1000),
      timezoneOffset: 0
    }
  });
  console.log(`[GIT COMMIT] ${sha.substring(0, 7)} - ${message}`);
  return sha;
}

async function log() {
  const commits = await git.log({ fs, dir, depth: 20 });
  console.log('\n--- Commit History ---');
  commits.forEach(c => {
    console.log(`${c.oid.substring(0, 7)} (${new Date(c.commit.author.timestamp * 1000).toLocaleString()}): ${c.commit.message}`);
  });
  console.log('----------------------\n');
}

const cmd = process.argv[2];
const arg = process.argv[3];

(async () => {
  try {
    if (cmd === 'commit') {
      const msg = arg || 'Update codebase';
      await commit(msg);
    } else if (cmd === 'log') {
      await log();
    } else if (cmd === 'init') {
      await git.init({ fs, dir, defaultBranch: 'main' });
      console.log('Initialized repository on branch main');
    } else {
      console.log('Usage: node scripts/git.js [init|commit <msg>|log]');
    }
  } catch (err) {
    console.error('Git script error:', err.message);
  }
})();
