# 🚀 Jango Compiler - Portable Edition

**The Ultimate Self-Contained Multi-Language Compiler Platform**

## 🎯 What is This?

Jango Compiler Portable Edition is a completely self-contained coding environment that includes **ALL** the compilers and interpreters you need, without requiring any external downloads or system modifications!

## ✨ Key Features

### 🔧 **Built-in Compilers**
- ✅ **Java** - OpenJDK 17 (fully portable)
- ✅ **C/C++** - MinGW-w64 GCC compiler
- ✅ **C#/.NET** - .NET 6 SDK
- ✅ **JavaScript** - Node.js 18 runtime
- ✅ **PHP** - PHP 8.2 interpreter
- ✅ **Assembly** - NASM assembler
- ✅ **Python** - Uses system Python
- ✅ **HTML/CSS** - Built-in validation

### 🌟 **Benefits**
- 🚫 **No External Dependencies** - Everything included!
- ⚡ **Instant Execution** - Run any language immediately
- 🔒 **Isolated Environment** - No system PATH pollution
- 📦 **Portable** - Copy folder anywhere and it works
- 🌐 **Offline Ready** - No internet required after setup

## 🚀 Quick Start (3 Options)

### Option 1: One-Click Setup (Recommended)
1. Double-click `SETUP_PORTABLE.bat`
2. Wait 5-10 minutes for automatic installation
3. Start coding immediately!

### Option 2: Web Interface Setup
1. Run: `python manage.py runserver`
2. Open: http://127.0.0.1:8000/setup/
3. Click "Setup All Compilers"
4. Wait for installation to complete

### Option 3: Manual Setup
1. Run: `python quick_setup.py`
2. Wait for installation
3. Start the server: `python manage.py runserver`

## 📁 Directory Structure

```
Jango-Compiler/
├── portable_compilers/     # All portable compilers
│   ├── java/              # OpenJDK 17
│   ├── gcc/               # MinGW GCC/G++
│   ├── dotnet/            # .NET SDK
│   ├── nodejs/            # Node.js runtime
│   ├── php/               # PHP interpreter
│   ├── nasm/              # Assembly compiler
│   └── setup_portable_compilers.py
├── compiler/              # Django app
├── SETUP_PORTABLE.bat     # Windows one-click setup
├── quick_setup.py         # Python setup script
└── manage.py              # Django management
```

## 💾 System Requirements

- **OS**: Windows 10/11 (64-bit)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 1GB free space (500MB for compilers)
- **Python**: 3.8+ (for Django)
- **Internet**: Required only during initial setup

## 🛠️ Advanced Usage

### Manual Compiler Installation
```bash
# Install specific compiler
cd portable_compilers
python setup_portable_compilers.py install-java
python setup_portable_compilers.py install-gcc

# Check status
python setup_portable_compilers.py list
```

### Custom Compiler Paths
The system automatically detects portable compilers, but you can also:
1. Add compilers to `portable_compilers/` directory
2. Update `portable_compiler_detector.py` configurations
3. Restart Django server

## 🎓 Supported Languages & Examples

### Java
```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello from portable Java!");
    }
}
```

### C++
```cpp
#include <iostream>
using namespace std;

int main() {
    cout << "Hello from portable C++!" << endl;
    return 0;
}
```

### C#
```csharp
using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello from portable C#!");
    }
}
```

### JavaScript
```javascript
console.log("Hello from portable Node.js!");
const compiler = { name: "Jango", portable: true };
console.log(compiler);
```

### PHP
```php
<?php
echo "Hello from portable PHP!\n";
$languages = ["Java", "C++", "C#", "JavaScript"];
foreach ($languages as $lang) {
    echo "Language: $lang\n";
}
?>
```

## 🔧 Troubleshooting

### Setup Issues
- **Download fails**: Check internet connection
- **Extraction fails**: Ensure sufficient disk space
- **Permission denied**: Run as administrator

### Runtime Issues
- **Compiler not found**: Run setup again
- **Compilation fails**: Check code syntax
- **Server won't start**: Check port 8000 availability

### Performance Tips
- Use SSD storage for better performance
- Close unnecessary programs during compilation
- Increase timeout for large programs

## 🌍 Platform Support

**Current Support:**
- ✅ Windows 10/11 (x64) - Full support
- 🚧 Linux - Planned (Q2 2025)
- 🚧 macOS - Planned (Q3 2025)

## 📊 Installation Sizes

| Compiler | Size | Description |
|----------|------|-------------|
| Java | ~180MB | OpenJDK 17 Runtime + Compiler |
| GCC/G++ | ~120MB | MinGW-w64 Toolchain |
| .NET | ~150MB | .NET 6 SDK |
| Node.js | ~35MB | JavaScript Runtime |
| PHP | ~25MB | PHP 8.2 Interpreter |
| NASM | ~5MB | Assembly Compiler |
| **Total** | **~515MB** | **Complete Environment** |

## 🔐 Security Features

- ✅ **Sandboxed Execution** - Code runs in isolated environment
- ✅ **Timeout Protection** - 10-second execution limit
- ✅ **Path Isolation** - No system PATH modifications
- ✅ **Temporary Files** - Auto-cleanup after execution
- ✅ **Input Validation** - Code sanitization and checks

## 🤝 Contributing

Want to add more languages or improve the platform?

1. Fork the repository
2. Add compiler configurations to `setup_portable_compilers.py`
3. Update detection patterns in `portable_compiler_detector.py`
4. Add execution logic in `views.py`
5. Submit a pull request!

## 📜 License

This project is licensed under the MIT License. See LICENSE file for details.

## 🙋‍♂️ Support

- 📧 Email: support@jangocompiler.com
- 💬 Discord: [Jango Compiler Community]
- 🐛 Issues: [GitHub Issues]
- 📖 Documentation: [Full Docs]

---

## 🎉 Ready to Start?

1. **Run**: `SETUP_PORTABLE.bat`
2. **Wait**: 5-10 minutes for setup
3. **Code**: Open http://127.0.0.1:8000/editor/
4. **Enjoy**: Coding in any language instantly!

**Your journey to portable, powerful coding starts now!** 🚀
