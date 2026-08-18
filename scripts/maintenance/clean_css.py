import re

with open('frontend/src/styles/index.css', 'r') as f:
    content = f.read()

# 1. Remove theme-3, theme-4, theme-dark-candidate blocks
# A block starts with a selector and ends with }
# We can use regex to match the blocks. 
# Matches: :root[...theme-3...] { ... }
pattern_themes = re.compile(
    r'^[ \t]*:root(?:\[data-theme="dark"\])?\[data-visual-theme="(?:theme-3|theme-4|theme-dark-candidate)"\].*?\{.*?\n[ \t]*\}',
    re.MULTILINE | re.DOTALL
)
content = pattern_themes.sub('', content)

# Also remove body modifiers for these themes
pattern_body = re.compile(
    r'^[ \t]*:root(?:\[data-theme="dark"\])?\[data-visual-theme="(?:theme-3|theme-4|theme-dark-candidate)"\][ \t]+body.*?\{.*?\n[ \t]*\}',
    re.MULTILINE | re.DOTALL
)
content = pattern_body.sub('', content)

# 2. Remove .navbar explicit class block (starts with `.navbar {` or `.navbar,`)
# But keep the navbar variables inside :root which start with --nav-
# Let's find the section that starts with `  .navbar {` or `  .navbar,` and remove those rules.
# Specifically, we can just remove all rules that start with `.navbar` or `  .navbar`
pattern_navbar = re.compile(
    r'^[ \t]*\.navbar(?:[\s,\.:\[].*?)?\{.*?\n[ \t]*\}',
    re.MULTILINE | re.DOTALL
)
content = pattern_navbar.sub('', content)

# 3. Remove .login-* and [data-page="login"] and .hero-* 
# Be careful to keep --hero-start and --hero-end inside :root blocks.
# Those are properties like `--hero-start: ...;`, not selectors.
# Selectors to remove:
# [data-page="login"] { ... }
# .login-... { ... }
# .hero-... { ... }
# :root[data-theme="dark"] [data-page="login"] ... { ... }
# And also the header comments for these if possible, but fine if they remain.
pattern_login_hero = re.compile(
    r'^[ \t]*(?::root\[data-theme="dark"\][ \t]+)?(?:\[data-page="login"\].*?|\.login-[a-zA-Z0-9_-]+.*?|\.hero-[a-zA-Z0-9_-]+.*?|\.auth-[a-zA-Z0-9_-]+.*?)\{.*?\n[ \t]*\}',
    re.MULTILINE | re.DOTALL
)
content = pattern_login_hero.sub('', content)

# Also there's a big section "LOGIN PAGE — MARAJÓ BRAND FIX".
# We can just remove everything from `/* ==========================================================================\n   LOGIN PAGE`
# up to `/* ==========================================================================\n   UTILITIES`
pattern_login_section = re.compile(
    r'/\*[ \t]*=+[ \t]*\n[ \t]*LOGIN PAGE.*?/\*[ \t]*=+[ \t]*\n[ \t]*UTILITIES',
    re.MULTILINE | re.DOTALL
)
# Let's check if we can just remove that whole section and put UTILITIES header back
match = pattern_login_section.search(content)
if match:
    # replace with just the UTILITIES header
    utilities_header = "/* " + "="*74 + "\n   UTILITIES"
    content = content[:match.start()] + utilities_header + content[match.end():]

# Clean up multiple blank lines
content = re.sub(r'\n{3,}', '\n\n', content)

with open('frontend/src/styles/index.css', 'w') as f:
    f.write(content)
