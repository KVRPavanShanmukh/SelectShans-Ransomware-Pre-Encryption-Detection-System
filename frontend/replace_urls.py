import os
import re

config_path = os.path.join('src', 'config.js')
with open(config_path, 'w') as f:
    f.write('export const API_URL = import.meta.env.VITE_API_URL;\n')

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if '127.0.0.1:5000' in content or 'localhost:5000' in content:
        # Avoid changing proxy config in vite.config.js which uses localhost:5000 as string
        if 'vite.config.js' in filepath:
            # wait, vite config doesn't need to be changed if it's for local proxy. 
            # But the prompt says "Check: axios configuration, fetch wrappers, utility modules".
            # vite.config.js is a local dev tool, I will leave it alone or replace it.
            pass
            
        new_content = re.sub(r"'http://(?:127\.0\.0\.1|localhost):5000(/.*?)'", r"`${API_URL}\1`", content)
        new_content = re.sub(r'"http://(?:127\.0\.0\.1|localhost):5000(/.*?)"', r"`${API_URL}\1`", new_content)
        new_content = re.sub(r"`http://(?:127\.0\.0\.1|localhost):5000(/.*?)`", r"`${API_URL}\1`", new_content)
        
        # for cases where it's passed as a prop like apiBase="http://127.0.0.1:5000"
        new_content = re.sub(r'apiBase="http://(?:127\.0\.0\.1|localhost):5000"', r'apiBase={API_URL}', new_content)
        
        if new_content != content:
            # Add import at the top
            depth = filepath.count(os.sep) - 1 # from src
            import_path = '../config' if depth > 0 else './config'
            if filepath.endswith('App.jsx'):
                import_path = './config'
            
            if 'API_URL' not in content:
                new_content = f"import {{ API_URL }} from '{import_path}';\n" + new_content
                
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f'Updated {filepath}')

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith(('.jsx', '.js', '.tsx', '.ts')):
            process_file(os.path.join(root, file))
