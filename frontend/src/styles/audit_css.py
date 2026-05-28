import re

with open('index.css', 'r') as f:
    lines = f.readlines()

sections = []
current_section = "Header"
start_line = 1

for i, line in enumerate(lines):
    if line.strip().startswith('/* ==='):
        if i + 1 < len(lines):
            title = lines[i+1].strip().strip('/*- ')
            sections.append((current_section, start_line, i))
            current_section = title
            start_line = i + 1

sections.append((current_section, start_line, len(lines)))

for sec in sections:
    print(f"Section: {sec[0]:<40} Lines: {sec[1]} - {sec[2]} ({sec[2]-sec[1]+1} lines)")

