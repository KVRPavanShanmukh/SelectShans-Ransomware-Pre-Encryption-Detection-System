import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # index.css
    content = content.replace('color-scheme: dark;', 'color-scheme: light;')
    content = content.replace('color: #ffffff;', 'color: #1a202c;')
    content = content.replace('background-color: #000000;', 'background-color: #f0f4f8;')

    # App.css variables
    content = content.replace('--bg-dark: #050a0e;', '--bg-dark: #f0f4f8;')
    content = content.replace('--bg-section: #070d12;', '--bg-section: #e2e8f0;')
    content = content.replace('--bg-sidebar: #040810;', '--bg-sidebar: #ffffff;')
    content = content.replace('--bg-card: #0d1117;', '--bg-card: #ffffff;')
    content = content.replace('--card-border: rgba(0, 255, 65, 0.12);', '--card-border: rgba(0, 0, 0, 0.1);')
    content = content.replace('--text-primary: #e0ffe8;', '--text-primary: #1a202c;')
    content = content.replace('--text-secondary: #7aada0;', '--text-secondary: #4a5568;')
    content = content.replace('--text-muted: rgba(0, 255, 65, 0.3);', '--text-muted: rgba(0, 0, 0, 0.4);')
    
    # Text colors in App.css for neon components to be visible on light bg
    # Wait, we need to be careful with blindly replacing color: #fff; and color: #000;
    # Let's replace the specific button hover colors
    content = content.replace('color: #000;\n  box-shadow:', 'color: #fff;\n  box-shadow:')
    content = content.replace('color: #fff;\n  box-shadow:', 'color: #fff;\n  box-shadow:')
    
    # rgba backgrounds
    content = content.replace('rgba(5, 10, 14, 0.92)', 'rgba(255, 255, 255, 0.92)')
    content = content.replace('rgba(5, 10, 14, 0.95)', 'rgba(255, 255, 255, 0.95)')
    content = content.replace('rgba(13, 17, 23, 0.7)', 'rgba(255, 255, 255, 0.7)')
    content = content.replace('background: #020608;', 'background: #f8fafc;')

    # App.jsx specific styles
    content = content.replace("color: '#fff'", "color: '#1a202c'")
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

for root, _, files in os.walk(r'd:\HACK-LEARNATHONS\LEARNATHON SLOT 3\FINAL\PRO\PRO\frontend\src'):
    for file in files:
        if file.endswith('.css') or file.endswith('.jsx'):
            process_file(os.path.join(root, file))
