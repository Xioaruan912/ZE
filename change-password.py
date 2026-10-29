import getpass
from pathlib import Path
from reader import hash_password, revoke_sessions
first=getpass.getpass('新口令: ')
if not first or first != getpass.getpass('再次输入: '): raise SystemExit('口令为空或两次输入不一致')
(Path(__file__).parent/'password.hash').write_text(hash_password(first),encoding='utf-8')
revoke_sessions()
print('口令已更新，所有已信任设备需要重新登录。')
