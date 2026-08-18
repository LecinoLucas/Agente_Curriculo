import os

replacements = {
    'bg-[hsl(var(--surface))]': 'bg-surface',
    'bg-[hsl(var(--surface-muted))]': 'bg-surface-muted',
    'text-[hsl(var(--text))]': 'text-text',
    'text-[hsl(var(--text-muted))]': 'text-text-muted',
    'border-[hsl(var(--border))]': 'border-border',
    'border-[hsl(var(--border-strong))]': 'border-border-strong',
    'bg-[hsl(var(--success-soft))]': 'bg-success-soft',
    'text-[hsl(var(--success))]': 'text-success',
    'bg-[hsl(var(--danger-soft))]': 'bg-danger-soft',
    'text-[hsl(var(--danger))]': 'text-danger',
    'bg-[hsl(var(--warning-soft))]': 'bg-warning-soft',
    'text-[hsl(var(--warning))]': 'text-warning',
}

files_changed = 0
total_replacements = 0

for root, _, files in os.walk('frontend/src'):
    for file in files:
        if file.endswith('.tsx') or file.endswith('.ts'):
            path = os.path.join(root, file)
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
            except UnicodeDecodeError:
                continue
            
            original_content = content
            for old, new in replacements.items():
                count = content.count(old)
                if count > 0:
                    total_replacements += count
                    content = content.replace(old, new)
            
            if content != original_content:
                files_changed += 1
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)

print(f"Files changed: {files_changed}")
print(f"Total replacements: {total_replacements}")
