try:
    from db import Base
    print("✓ db import successful")
except ImportError as e:
    print(f"✗ db import failed: {e}")

try:
    from models import User
    print("✓ models import successful")
except ImportError as e:
    print(f"✗ models import failed: {e}")

try:
    from auth import hash_password
    print("✓ auth import successful")
except ImportError as e:
    print(f"✗ auth import failed: {e}")