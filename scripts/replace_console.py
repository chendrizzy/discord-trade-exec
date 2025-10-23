#!/usr/bin/env python3
"""
Comprehensive Console to Logger Replacement
Replaces all console.log/error/warn with structured logger calls
"""

import os
import re
import subprocess


def count_console_statements(filepath):
    """Count console statements in a file"""
    try:
        result = subprocess.run(
            ["grep", "-c", r"console\.\(log\|error\|warn\)", filepath],
            capture_output=True,
            text=True,
        )
        return int(result.stdout.strip()) if result.returncode == 0 else 0
    except:
        return 0


def find_files_with_console():
    """Find all JS files with console statements"""
    result = subprocess.run(
        ["find", "src", "-name", "*.js", "-type", "f"],
        capture_output=True,
        text=True,
        check=True,
    )

    files = []
    for filepath in result.stdout.strip().split("\n"):
        if filepath and count_console_statements(filepath) > 0:
            files.append(filepath)

    return files


def add_logger_import(content, filepath):
    """Add logger import if not present"""
    if (
        "require('../../utils/logger')" in content
        or 'require("../../utils/logger")' in content
    ):
        return content, False

    # Calculate relative path to utils/logger
    depth = filepath.count("/") - 1
    logger_path = "../" * depth + "utils/logger"

    # Find last require statement
    require_pattern = r"^const .+ = require\(.+\);$"
    matches = list(re.finditer(require_pattern, content, re.MULTILINE))

    if matches:
        last_match = matches[-1]
        insert_pos = last_match.end()
        content = (
            content[:insert_pos]
            + f"\nconst logger = require('{logger_path}');"
            + content[insert_pos:]
        )
        return content, True

    return content, False


def replace_console_statements(content):
    """Replace all console statements with logger calls"""
    replacements = 0

    # Replace console.error with error object
    new_content, count = re.subn(
        r"console\.error\('([^']+)',\s*error\);",
        r"logger.error('\1', { error: error.message, stack: error.stack });",
        content,
    )
    replacements += count
    content = new_content

    new_content, count = re.subn(
        r'console\.error\("([^"]+)",\s*error\);',
        r'logger.error("\1", { error: error.message, stack: error.stack });',
        content,
    )
    replacements += count
    content = new_content

    # Replace console.error with just message
    new_content, count = re.subn(
        r"console\.error\('([^']+)'\);", r"logger.error('\1');", content
    )
    replacements += count
    content = new_content

    new_content, count = re.subn(
        r'console\.error\("([^"]+)"\);', r'logger.error("\1");', content
    )
    replacements += count
    content = new_content

    # Replace console.log
    new_content, count = re.subn(
        r"console\.log\('([^']+)'\);", r"logger.info('\1');", content
    )
    replacements += count
    content = new_content

    new_content, count = re.subn(
        r'console\.log\("([^"]+)"\);', r'logger.info("\1");', content
    )
    replacements += count
    content = new_content

    # Replace console.warn
    new_content, count = re.subn(
        r"console\.warn\('([^']+)'\);", r"logger.warn('\1');", content
    )
    replacements += count
    content = new_content

    new_content, count = re.subn(
        r'console\.warn\("([^"]+)"\);', r'logger.warn("\1");', content
    )
    replacements += count
    content = new_content

    return content, replacements


def main():
    print("🔍 Finding all files with console statements...")
    files = find_files_with_console()

    if not files:
        print("✅ No console statements found!")
        return

    print(f"📝 Found {len(files)} files with console statements\n")

    total_replacements = 0
    files_with_logger_added = 0

    for i, filepath in enumerate(files, 1):
        print(f"[{i}/{len(files)}] Processing: {filepath}")

        # Read file
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read()

        before_count = count_console_statements(filepath)

        # Add logger import if needed
        content, logger_added = add_logger_import(content, filepath)
        if logger_added:
            files_with_logger_added += 1
            print(f"  ✅ Added logger import")

        # Replace console statements
        content, replacements = replace_console_statements(content)

        # Write file
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)

        after_count = count_console_statements(filepath)
        total_replacements += before_count - after_count

        if replacements > 0:
            print(
                f"  ✅ Replaced {replacements} console statements ({after_count} remaining)"
            )

        if after_count > 0:
            print(f"  ⚠️  Manual review needed for {after_count} remaining statements")

    print(f"\n🎉 Complete!")
    print(f"   Files processed: {len(files)}")
    print(f"   Logger imports added: {files_with_logger_added}")
    print(f"   Total replacements: {total_replacements}")

    # Final count
    remaining_files = find_files_with_console()
    if remaining_files:
        total_remaining = sum(count_console_statements(f) for f in remaining_files)
        print(f"\n📊 Remaining console statements:")
        print(f"   Files: {len(remaining_files)}")
        print(f"   Total: {total_remaining}")
    else:
        print(f"\n✅ All console statements replaced!")


if __name__ == "__main__":
    main()
