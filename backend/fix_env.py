import os

filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(filepath):
    with open(filepath, 'rb') as f:
        content = f.read()

    content = content.replace(b'\r\n', b'\n')

    with open(filepath, 'wb') as f:
        f.write(content)
    print('Fixed line endings in .env')
else:
    print('.env not found in backend directory')
