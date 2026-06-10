const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'frontend', 'src', 'pages', 'PipelinePage.tsx');

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found at ${filePath}`);
  process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let foundStatement = false;
let violation = false;
let violationLine = -1;
let inImport = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();

  // Skip empty lines and comments
  if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
    continue;
  }

  const startsWithImport = line.startsWith('import ') || line.startsWith('import{') || line.startsWith('import type');
  
  if (startsWithImport) {
    if (foundStatement) {
      violation = true;
      violationLine = i + 1;
      break;
    }
    inImport = true;
  }

  // Check if import ends on this line
  if (inImport && line.includes(';')) {
    inImport = false;
    continue;
  }

  if (!inImport && !startsWithImport) {
    // It's a statement (const, function, export, etc.)
    foundStatement = true;
  }
}

if (violation) {
  console.error(`REGRESSION DETECTED: import found after statement in PipelinePage.tsx at line ${violationLine}`);
  console.error(`Vite will fail to serve this module if imports are not at the top.`);
  process.exit(1);
} else {
  console.log('PipelinePage.tsx imports validation passed.');
  process.exit(0);
}
