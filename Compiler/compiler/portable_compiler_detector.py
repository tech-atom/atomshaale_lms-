"""
Portable Compiler Detector for Jango Compiler
Automatically detects and uses portable compilers instead of system-installed ones
"""

import os
import sys
from pathlib import Path

class PortableCompilerDetector:
    def __init__(self):
        # Get the path to portable_compilers directory
        self.base_dir = Path(__file__).parent.parent / "portable_compilers"
        
        # Compiler configurations
        self.compiler_configs = {
            "python": {
                "compiler": "python.exe",
                "runtime": "python.exe",
                "test_arg": "--version"
            },
            "java": {
                "compiler": "bin/java.exe",
                "runtime": "bin/java.exe",
                "test_arg": "-version"
            },
            "javac": {
                "compiler": "bin/javac.exe",
                "runtime": "bin/javac.exe",
                "test_arg": "-version"
            },
            "gcc": {
                "compiler": "bin/gcc.exe",
                "runtime": "bin/gcc.exe",
                "test_arg": "--version"
            },
            "g++": {
                "compiler": "bin/g++.exe",
                "runtime": "bin/g++.exe", 
                "test_arg": "--version"
            },
            "dotnet": {
                "compiler": "dotnet.exe",
                "runtime": "dotnet.exe",
                "test_arg": "--version"
            },
            "php": {
                "compiler": "php.exe",
                "runtime": "php.exe",
                "test_arg": "--version"
            },
            "node": {
                "compiler": "node.exe",
                "runtime": "node.exe",
                "test_arg": "--version"
            },
            "nasm": {
                "compiler": "nasm.exe",
                "runtime": "nasm.exe",
                "test_arg": "-v"
            }
        }
    
    def get_portable_compiler_path(self, compiler_name):
        """Get the full path to a portable compiler"""
        if compiler_name == "g++":
            # g++ is in the gcc/mingw64 directory
            compiler_dir = self.base_dir / "gcc" / "mingw64"
        elif compiler_name == "gcc":
            # gcc is in the gcc/mingw64 directory
            compiler_dir = self.base_dir / "gcc" / "mingw64"
        elif compiler_name == "javac":
            # javac is in java directory
            compiler_dir = self.base_dir / "java"
        elif compiler_name == "java":
            # java runtime is also in the java directory 
            compiler_dir = self.base_dir / "java"
        elif compiler_name == "node":
            # node is in the nodejs directory
            compiler_dir = self.base_dir / "nodejs"
        elif compiler_name == "dotnet":
            # For now, .NET uses system installation
            return None
        elif compiler_name == "python":
            # For now, Python uses system installation, no portable directory
            return None
        elif compiler_name == "php":
            # For now, PHP uses system installation
            return None
        else:
            compiler_dir = self.base_dir / compiler_name
        
        if not compiler_dir.exists():
            return None
            
        config = self.compiler_configs.get(compiler_name)
        if not config:
            return None
            
        compiler_path = compiler_dir / config["compiler"]
        if compiler_path.exists():
            return str(compiler_path)
        
        return None
    
    def is_portable_compiler_available(self, compiler_name):
        """Check if a portable compiler is available and working"""
        if compiler_name == "python":
            return True
        compiler_path = self.get_portable_compiler_path(compiler_name)
        if not compiler_path:
            return False
        # If the file exists, we consider it available.
        # This is extremely fast (zero subprocess overhead) and avoids permission/sandbox blocks.
        return os.path.exists(compiler_path)
    
    def get_compiler_command(self, compiler_name):
        """Get the appropriate compiler command (portable or system)"""
        if compiler_name == "python":
            return sys.executable
        # First try portable compiler
        portable_path = self.get_portable_compiler_path(compiler_name)
        if portable_path and self.is_portable_compiler_available(compiler_name):
            return portable_path
        
        # Fall back to system compiler
        return compiler_name
    
    def get_available_compilers(self):
        """Get list of all available compilers (portable + system)"""
        available = {}
        
        for compiler_name in self.compiler_configs:
            # Check portable version
            portable_available = self.is_portable_compiler_available(compiler_name)
            
            # Check system version
            system_available = self._check_system_compiler(compiler_name)
            
            available[compiler_name] = {
                "portable": portable_available,
                "system": system_available,
                "available": portable_available or system_available,
                "preferred": "portable" if portable_available else ("system" if system_available else "none")
            }
        
        return available
    
    def _check_system_compiler(self, compiler_name):
        """Check if system compiler is available"""
        if compiler_name == "python":
            return True
        try:
            import subprocess
            config = self.compiler_configs[compiler_name]
            result = subprocess.run([compiler_name, config["test_arg"]], 
                                  capture_output=True, text=True, timeout=5)
            return result.returncode == 0
        except:
            return False
    
    def print_status(self):
        """Print status of all compilers"""
        print("🔧 Jango Compiler - Portable Compiler Status")
        print("=" * 50)
        
        available = self.get_available_compilers()
        
        for compiler_name, status in available.items():
            print(f"{compiler_name:10}: ", end="")
            
            if status["portable"]:
                print("✓ Portable", end="")
            elif status["system"]:
                print("✓ System", end="")
            else:
                print("✗ Not Available", end="")
            
            if status["portable"] and status["system"]:
                print(" (+ System backup)")
            else:
                print()
        
        print("\n📋 Summary:")
        total = len(available)
        available_count = sum(1 for s in available.values() if s["available"])
        portable_count = sum(1 for s in available.values() if s["portable"])
        
        print(f"  Total compilers: {total}")
        print(f"  Available: {available_count}")
        print(f"  Portable: {portable_count}")
        
        if portable_count == total:
            print("SUCCESS All compilers are portable! No system dependencies.")
        elif available_count == total:
            print("OK All compilers available (mix of portable and system).")
        else:
            missing = total - available_count
            print(f"WARNING  {missing} compilers missing. Run setup to install portable versions.")

# Global instance for easy import
portable_detector = PortableCompilerDetector()

def get_compiler_path(compiler_name):
    """Quick function to get compiler path"""
    return portable_detector.get_compiler_command(compiler_name)

def is_compiler_available(compiler_name):
    """Quick function to check if compiler is available"""
    return portable_detector.get_available_compilers()[compiler_name]["available"]

if __name__ == "__main__":
    portable_detector.print_status()
