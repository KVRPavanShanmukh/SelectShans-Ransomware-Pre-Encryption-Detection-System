import os

filepath = 'd:/HACK-LEARNATHONS/LEARNATHON SLOT 3/FINAL/PRO/PRO/backend/.env'
with open(filepath, 'rb') as f:
    content = f.read()

content = content.replace(b'\r\n', b'\n')

with open(filepath, 'wb') as f:
    f.write(content)
print('Fixed line endings in .env')
