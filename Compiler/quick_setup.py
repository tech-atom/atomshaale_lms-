#!/usr/bin/env python3
"""
Quick setup script for Jango Compiler portable compilers
Run this to install all compilers at once
"""

import os
import sys
import subprocess
from pathlib import Path

def main():
    print("🔧 Jango Compiler - Portable Compiler Quick Setup")
    print("=" * 50)
    
    # Get the path to the setup script
    project_root = Path(__file__).parent
    setup_script = project_root / "portable_compilers" / "setup_portable_compilers.py"
    
    if not setup_script.exists():
        print("ERROR Setup script not found!")
        print(f"Expected at: {setup_script}")
        return False
    
    print("LAUNCH Starting automatic installation of all compilers...")
    print("This may take several minutes depending on your internet connection.")
    print()
    
    try:
        # Run the setup script
        result = subprocess.run([sys.executable, str(setup_script), "setup"], 
                              cwd=str(setup_script.parent))
        
        if result.returncode == 0:
            print()
            print("SUCCESS SUCCESS! All portable compilers have been installed.")
            print("Your Jango Compiler is now fully self-contained!")
            print()
            print("OK Available languages:")
            print("   • Python (built-in)")
            print("   • Java (OpenJDK 17)")
            print("   • C/C++ (MinGW GCC)")
            print("   • C#/.NET (SDK 6)")
            print("   • JavaScript (Node.js 18)")
            print("   • PHP (8.2)")
            print("   • Assembly (NASM)")
            print("   • HTML/CSS (validation)")
            print()
            print("LAUNCH You can now run any supported language without external dependencies!")
            return True
        else:
            print("ERROR Installation failed. Check the output above for errors.")
            return False
            
    except Exception as e:
        print(f"ERROR Error running setup: {e}")
        return False

if __name__ == "__main__":
    success = main()
    
    print()
    if success:
        print("Next steps:")
        print("1. Start the Django server: python manage.py runserver")
        print("2. Open http://127.0.0.1:8000/editor/")
        print("3. Try coding in any language!")
    else:
        print("Setup failed. Please check the errors above.")
        print("You can also try the manual installation from the web interface.")
    
    input("\nPress Enter to exit...")
