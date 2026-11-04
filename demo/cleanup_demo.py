"""
SelectShans Demo Safety Utility: Cleanup Demo Environment
Safely cleans up only the dedicated 'demo/test_protected_folder' directory.
Never touches or deletes any files outside of this specific demo directory.
"""
import os
import shutil
import sys

DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
PROTECTED_FOLDER = os.path.join(DEMO_DIR, "test_protected_folder")


def cleanup_test_folder(silent: bool = False) -> int:
    """
    Cleans up all files and directories strictly inside test_protected_folder.
    Returns the count of removed items.
    """
    # Strict safety boundary check
    norm_target = os.path.normpath(PROTECTED_FOLDER)
    norm_demo = os.path.normpath(DEMO_DIR)
    if not norm_target.startswith(norm_demo):
        raise RuntimeError(f"Safety Violation: Target '{norm_target}' is outside demo directory '{norm_demo}'!")

    if not os.path.exists(norm_target):
        os.makedirs(norm_target, exist_ok=True)
        if not silent:
            print(f"[CLEANUP] Created empty demo directory: {norm_target}")
        return 0

    removed_count = 0
    for item in os.listdir(norm_target):
        item_path = os.path.join(norm_target, item)
        try:
            if os.path.isfile(item_path) or os.path.islink(item_path):
                os.unlink(item_path)
                removed_count += 1
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
                removed_count += 1
        except Exception as e:
            if not silent:
                print(f"[CLEANUP WARN] Could not remove {item}: {e}")

    if not silent:
        print(f"[CLEANUP] Safely purged {removed_count} test item(s) from {norm_target}")
    return removed_count


if __name__ == "__main__":
    print("=" * 60)
    print("  SelectShans Demo - Safe Environment Cleanup")
    print("=" * 60)
    count = cleanup_test_folder(silent=False)
    print(f"Cleanup complete. Test directory is ready for scenarios.")
    print("=" * 60)
