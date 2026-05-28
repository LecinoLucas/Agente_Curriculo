const fs = require('fs');
const path = require('path');

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes('@/components/ui/input')) {
    const importReplacement = `import { Modal } from "../../components/common/Modal";\nimport { Input } from "@/components/ui/input";\nimport { Select } from "@/components/ui/select";\nimport { Textarea } from "@/components/ui/textarea";`;
    content = content.replace('import { Modal } from "../../components/common/Modal";', importReplacement);
  }

  content = content.replace(/<select\b([^>]*)className="ui-input([^"]*)"/g, '<Select$1className="$2"');
  content = content.replace(/<\/select>/g, '</Select>');

  content = content.replace(/<input\b([^>]*)className="ui-input([^"]*)"/g, '<Input$1className="$2"');

  content = content.replace(/<textarea\b([^>]*)className="ui-input([^"]*)"/g, '<Textarea$1className="$2"');
  content = content.replace(/<\/textarea>/g, '</Textarea>');

  content = content.replace(/className=" "/g, '');
  content = content.replace(/className=" (.*?)"/g, 'className="$1"');

  fs.writeFileSync(filePath, content, 'utf-8');
}

migrateFile(path.join(__dirname, 'src/features/agenda/AgendaInterviewModal.tsx'));
migrateFile(path.join(__dirname, 'src/features/agenda/CancelInterviewModal.tsx'));
