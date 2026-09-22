import re

with open('d:/HACK-LEARNATHONS/LEARNATHON SLOT 3/FINAL/PRO/PRO/frontend/src/App.css', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all z-index: 0; with z-index: -1; for the ::before pseudo elements of buttons
content = content.replace('z-index: 0;', 'z-index: -1;')

# Add z-index: 1 to the buttons so the negative z-index background doesn't go behind the container
buttons = [r'\.btn-ghost', r'\.btn-danger', r'\.btn-danger-large', r'\.btn-warning', r'\.login-btn']

for btn_class in buttons:
    pattern = btn_class + r'\s*\{[^}]*position:\s*relative;[^}]*\}'
    def add_z(m):
        match_str = m.group(0)
        if 'z-index: 1;' not in match_str:
            return match_str.replace('position: relative;', 'position: relative;\n  z-index: 1;')
        return match_str
    
    content = re.sub(pattern, add_z, content)

# Change text color on hover to dark since button background becomes green
content = content.replace('.login-btn:hover {\n  color: #fff;', '.login-btn:hover {\n  color: #1a202c;')

with open('d:/HACK-LEARNATHONS/LEARNATHON SLOT 3/FINAL/PRO/PRO/frontend/src/App.css', 'w', encoding='utf-8') as f:
    f.write(content)
