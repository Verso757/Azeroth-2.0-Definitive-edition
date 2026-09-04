const fs = require('fs');
const path = require('path');

function replaceInFolder(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInFolder(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/blue-50(?!0)/g, 'primary-50');
      content = content.replace(/blue-100/g, 'primary-100');
      content = content.replace(/blue-200/g, 'primary-200');
      content = content.replace(/blue-500/g, 'primary-500');
      content = content.replace(/blue-600/g, 'primary-600');
      content = content.replace(/blue-700/g, 'primary-700');
      fs.writeFileSync(fullPath, content);
    }
  }
}

replaceInFolder(path.join(__dirname, 'src'));
