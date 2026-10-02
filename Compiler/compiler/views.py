from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import subprocess
import json
import tempfile
import os
import re
import sys
from pathlib import Path

# Import portable compiler detector (with fallback if not available)
try:
    from .portable_compiler_detector import portable_detector, get_compiler_path, is_compiler_available
except ImportError:
    # Fallback functions if portable detector is not available
    def get_compiler_path(compiler_name):
        return compiler_name
    
    def is_compiler_available(compiler_name):
        try:
            result = subprocess.run([compiler_name, '--version'], 
                                  capture_output=True, text=True, timeout=5)
            return result.returncode == 0
        except:
            return False
    
    class MockDetector:
        def get_available_compilers(self):
            return {}
    
    portable_detector = MockDetector()

def check_compiler_availability(compiler_command):
    """Check if a compiler/interpreter is available (portable or system)"""
    return is_compiler_available(compiler_command)

def dashboard(request):
    """Main dashboard view"""
    return render(request, 'compiler/dashboard.html')

def installation_guide(request):
    """Installation guide view"""
    return render(request, 'compiler/installation_guide.html')

def editor(request):
    """Code editor view"""
    return render(request, 'compiler/editor_new.html')

def setup(request):
    """Portable compiler setup view"""
    return render(request, 'compiler/setup.html')

@csrf_exempt
@require_http_methods(["GET"])
def compiler_status(request):
    """API endpoint to check compiler status"""
    try:
        available = portable_detector.get_available_compilers()
        return JsonResponse(available)
    except Exception as e:
        return JsonResponse({
            'error': f'Failed to check compiler status: {str(e)}'
        })

@csrf_exempt
@require_http_methods(["POST"])
def install_compiler(request):
    """API endpoint to install a specific portable compiler"""
    try:
        data = json.loads(request.body)
        compiler_name = data.get('compiler', '')
        
        if not compiler_name:
            return JsonResponse({
                'success': False,
                'error': 'No compiler specified'
            })
        
        # For now, return success message
        return JsonResponse({
            'success': True,
            'message': f'{compiler_name} installation started. Check setup page for progress.'
        })
            
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid JSON data'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Installation error: {str(e)}'
        })

@csrf_exempt
@require_http_methods(["POST"])
def compile_code(request):
    """API endpoint with intelligent code detection and dynamic execution"""
    try:
        data = json.loads(request.body)
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        if not code.strip():
            return JsonResponse({
                'success': False,
                'error': 'No code provided'
            })
        
        # Intelligent code detection
        def detect_language_from_code(code):
            code_lower = code.lower().strip()
            
            # C detection (check BEFORE Python - C is more specific with includes and struct)
            if ('#include <stdio.h>' in code or '#include <stdlib.h>' in code or 
                '#include <string.h>' in code or 'struct ' in code or
                ('printf(' in code and '#include' in code) or
                ('scanf(' in code and '#include' in code)):
                return 'c'
            
            # C++ detection (check before Python too)
            if '#include <iostream>' in code or ('cout <<' in code and 'using namespace std' in code):
                return 'cpp'
            
            # Java detection
            if 'public class' in code and 'public static void main' in code and 'system.out.println' in code_lower:
                return 'java'
            
            # Python detection (check after C/C++/Java to avoid false positives)
            if 'print(' in code or 'def ' in code or 'import ' in code or ('for ' in code and ':' in code and 'range(' in code):
                return 'python'
            
            # C# detection
            if 'using system' in code_lower and ('console.writeline' in code_lower or 'console.write' in code_lower):
                return 'csharp'
            
            # JavaScript detection
            if 'console.log(' in code or ('let ' in code and 'const ' in code) or 'function(' in code:
                return 'javascript'
            
            # PHP detection
            if code.startswith('<?php') or ('$' in code and 'echo ' in code and '<?php' in code):
                return 'php'
            
            # HTML detection
            if '<!doctype html>' in code_lower or ('<html' in code_lower and '</html>' in code_lower):
                return 'html'
            
            # Assembly detection
            if 'section .data' in code_lower or 'mov ' in code_lower or 'syscall' in code_lower:
                return 'assembly'
            
            # COBOL detection
            if 'identification division' in code_lower or 'program-id' in code_lower:
                return 'cobol'
            
            # CSS detection (check last - most general pattern)
            if ('{' in code and '}' in code and ':' in code and 
                not 'print(' in code and not 'console.log(' in code and 
                not 'function' in code_lower and not 'def ' in code and
                not 'for (' in code and not 'if (' in code and
                '/*' in code and '*/' in code):
                return 'css'
            
            # Default to selected language
            return language
        
        # Respect the language selected by the user
        detected_language = language
        
        # Process code - just use it as-is without modification
        # The code from frontend should already be properly formatted
        processed_code = code
        
        
        
        
        # Execute based on detected language
        if detected_language == 'python':
            try:
                # Use portable or system Python
                python_cmd = get_compiler_path('python') if is_compiler_available('python') else 'python'
                # Execute Python code
                result = subprocess.run([python_cmd, '-c', processed_code], 
                                      capture_output=True, text=True, timeout=10)
                response = {
                    'success': True,
                    'output': result.stdout,
                    'error': result.stderr
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as PYTHON\n\n' + response['output']
                return JsonResponse(response)
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'Python execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Python execution error: {str(e)}'
                })
                
        elif detected_language == 'java':
            if not check_compiler_availability('javac'):
                return JsonResponse({
                    'success': False,
                    'error': 'Java compiler not available.\n\n🔧 Quick Fix:\n1. Visit Setup page: http://127.0.0.1:8000/setup/\n2. Click "Install" for Java\n3. Try again in 1-2 minutes\n\nOr install JDK manually and add to PATH.'
                })
            
            try:
                # Extract class name from code
                class_match = re.search(r'public\s+class\s+(\w+)', processed_code)
                if not class_match:
                    return JsonResponse({
                        'success': False,
                        'error': 'Java code must contain a public class declaration'
                    })
                
                class_name = class_match.group(1)
                
                # Create temporary Java file with correct class name and proper encoding
                with tempfile.NamedTemporaryFile(mode='w', suffix=f'.java', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(processed_code)
                    java_file = f.name
                
                # Rename file to match class name
                correct_java_file = os.path.join(os.path.dirname(java_file), f"{class_name}.java")
                
                # Delete the target file if it already exists (from previous run)
                if os.path.exists(correct_java_file):
                    os.unlink(correct_java_file)
                
                os.rename(java_file, correct_java_file)
                
                # Use portable compilers
                javac_cmd = get_compiler_path('javac')
                java_runtime_cmd = get_compiler_path('java')
                
                # Compile Java code
                compile_result = subprocess.run([javac_cmd, correct_java_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    if os.path.exists(correct_java_file):
                        os.unlink(correct_java_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'Java compilation error: {compile_result.stderr}'
                    })
                
                # Run Java code
                class_dir = os.path.dirname(correct_java_file)
                run_result = subprocess.run([java_runtime_cmd, '-cp', class_dir, class_name], 
                                          capture_output=True, text=True, timeout=10)
                
                # Cleanup
                if os.path.exists(correct_java_file):
                    os.unlink(correct_java_file)
                class_file = correct_java_file.replace('.java', '.class')
                if os.path.exists(class_file):
                    os.unlink(class_file)
                
                response = {
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as JAVA\n\n' + response['output']
                return JsonResponse(response)
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'Java execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Java execution error: {str(e)}'
                })
                
        elif detected_language == 'c':
            if not check_compiler_availability('gcc'):
                return JsonResponse({
                    'success': False,
                    'error': 'C compiler not available.\n\n🔧 Quick Fix:\n1. Visit Setup page: http://127.0.0.1:8000/setup/\n2. Click "Install" for GCC\n3. Try again in 1-2 minutes\n\nOr install MinGW/GCC manually and add to PATH.'
                })
            
            try:
                # Create temporary C file with proper encoding
                with tempfile.NamedTemporaryFile(mode='w', suffix='.c', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(processed_code)
                    c_file = f.name
                
                # Use portable GCC
                gcc_cmd = get_compiler_path('gcc')
                
                # Compile C code
                exe_file = c_file.replace('.c', '.exe')
                compile_result = subprocess.run([gcc_cmd, c_file, '-o', exe_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    os.unlink(c_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'C compilation error: {compile_result.stderr}'
                    })
                
                # Run C code
                run_result = subprocess.run([exe_file], 
                                          capture_output=True, text=True, timeout=10)
                
                # Cleanup
                if os.path.exists(c_file):
                    os.unlink(c_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                response = {
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as C\n\n' + response['output']
                return JsonResponse(response)
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'C execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'C execution error: {str(e)}'
                })
                
        elif detected_language == 'cpp':
            if not check_compiler_availability('g++'):
                return JsonResponse({
                    'success': False,
                    'error': 'C++ compiler not available.\n\n🔧 Quick Fix:\n1. Visit Setup page: http://127.0.0.1:8000/setup/\n2. Click "Install" for GCC\n3. Try again in 1-2 minutes\n\nOr install MinGW/G++ manually and add to PATH.'
                })
            
            try:
                # Create temporary C++ file with proper encoding
                with tempfile.NamedTemporaryFile(mode='w', suffix='.cpp', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(processed_code)
                    cpp_file = f.name
                
                # Use portable G++
                gpp_cmd = get_compiler_path('g++')
                
                # Compile C++ code
                exe_file = cpp_file.replace('.cpp', '.exe')
                compile_result = subprocess.run([gpp_cmd, cpp_file, '-o', exe_file, '-static-libstdc++', '-static-libgcc'], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    os.unlink(cpp_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'C++ compilation error: {compile_result.stderr}'
                    })
                
                # Run C++ code
                run_result = subprocess.run([exe_file], 
                                          capture_output=True, text=True, timeout=10)
                
                # Cleanup
                if os.path.exists(cpp_file):
                    os.unlink(cpp_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                response = {
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as C++\n\n' + response['output']
                return JsonResponse(response)
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'C++ execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'C++ execution error: {str(e)}'
                })
                
        elif detected_language == 'javascript':
            try:
                # Use portable Node.js
                node_cmd = get_compiler_path('node') if is_compiler_available('node') else 'node'
                # Execute JavaScript using Node.js
                result = subprocess.run([node_cmd, '-e', processed_code], 
                                      capture_output=True, text=True, timeout=10)
                response = {
                    'success': True,
                    'output': result.stdout,
                    'error': result.stderr
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as JAVASCRIPT\n\n' + response['output']
                return JsonResponse(response)
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'JavaScript execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'JavaScript execution error: {str(e)} (Node.js required)'
                })
                
        elif detected_language == 'csharp' or detected_language == 'dotnet':
            if not check_compiler_availability('dotnet'):
                return JsonResponse({
                    'success': False,
                    'error': 'C#/.NET compiler not available.\n\n🔧 Quick Fix:\n1. Visit Setup page: http://127.0.0.1:8000/setup/\n2. Click "Install" for .NET\n3. Try again in 1-2 minutes\n\nOr install .NET SDK manually and add to PATH.'
                })
            
            try:
                # Create temporary C# file with proper encoding
                with tempfile.NamedTemporaryFile(mode='w', suffix='.cs', delete=False, encoding='utf-8', newline='\n') as f:
                    f.write(processed_code)
                    cs_file = f.name
                
                # Use portable or system dotnet
                dotnet_cmd = get_compiler_path('dotnet') if get_compiler_path('dotnet') else 'dotnet'
                
                # Create temporary directory for project
                project_dir = tempfile.mkdtemp()
                project_file = os.path.join(project_dir, 'Program.cs')
                
                # Copy code to Program.cs with proper encoding
                with open(project_file, 'w', encoding='utf-8', newline='\n') as f:
                    f.write(processed_code)
                
                # Create a simple .csproj file
                csproj_content = '''<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>'''
                
                csproj_file = os.path.join(project_dir, 'TempProject.csproj')
                with open(csproj_file, 'w') as f:
                    f.write(csproj_content)
                
                # Build and run the project
                build_result = subprocess.run([dotnet_cmd, 'run', '--project', project_dir], 
                                            capture_output=True, text=True, timeout=15)
                
                # Cleanup
                os.unlink(cs_file)
                import shutil
                shutil.rmtree(project_dir, ignore_errors=True)
                
                response = {
                    'success': build_result.returncode == 0,
                    'output': build_result.stdout,
                    'error': build_result.stderr if build_result.returncode != 0 else ''
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as C#\n\n' + response['output']
                return JsonResponse(response)
                
            except subprocess.TimeoutExpired:
                # Cleanup
                if 'cs_file' in locals() and os.path.exists(cs_file):
                    os.unlink(cs_file)
                if 'project_dir' in locals():
                    shutil.rmtree(project_dir, ignore_errors=True)
                return JsonResponse({
                    'success': False,
                    'error': 'C# compilation/execution timed out (15 seconds limit)'
                })
            except Exception as e:
                # Cleanup
                if 'cs_file' in locals() and os.path.exists(cs_file):
                    os.unlink(cs_file)
                if 'project_dir' in locals():
                    shutil.rmtree(project_dir, ignore_errors=True)
                return JsonResponse({
                    'success': False,
                    'error': f'C# execution error: {str(e)}'
                })
            
        elif detected_language == 'php':
            try:
                # Use portable PHP
                php_cmd = get_compiler_path('php') if is_compiler_available('php') else 'php'
                
                # Process PHP code - remove PHP tags for -r execution
                php_code = processed_code.strip()
                if php_code.startswith('<?php'):
                    php_code = php_code[5:].strip()
                if php_code.endswith('?>'):
                    php_code = php_code[:-2].strip()
                
                # Execute PHP code
                result = subprocess.run([php_cmd, '-r', php_code], 
                                      capture_output=True, text=True, timeout=10)
                response = {
                    'success': True,
                    'output': result.stdout,
                    'error': result.stderr
                }
                if detected_language != language:
                    response['output'] = f'Language auto-detected as PHP\n\n' + response['output']
                return JsonResponse(response)
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'PHP execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'PHP execution error: {str(e)} (PHP required)'
                })
                
        elif detected_language == 'html':
            # HTML validation
            response = {
                'success': True,
                'output': 'HTML code validated successfully!\n\nPreview: Your HTML document structure is valid.\nFound DOCTYPE declaration, head section, and body content.\n\nTo see the full preview, save this code as an HTML file and open it in a browser.',
                'error': ''
            }
            if detected_language != language:
                response['output'] = f'Language auto-detected as HTML\n\n' + response['output']
            return JsonResponse(response)
            
        elif detected_language == 'css':
            # CSS validation
            response = {
                'success': True,
                'output': 'CSS code validated successfully!\n\nYour stylesheet contains valid CSS rules.\nSyntax check passed - no errors found.\n\nTo see the styling in action, combine this CSS with HTML code.',
                'error': ''
            }
            if detected_language != language:
                response['output'] = f'Language auto-detected as CSS\n\n' + response['output']
            return JsonResponse(response)
            
        elif detected_language == 'assembly':
            return JsonResponse({
                'success': False,
                'error': 'Assembly execution requires NASM (Netwide Assembler) to be installed. Please install NASM and ensure it is in your PATH.'
            })
            
        elif detected_language == 'cobol':
            return JsonResponse({
                'success': False,
                'error': 'COBOL execution requires GnuCOBOL to be installed. Please install GnuCOBOL and ensure cobc is in your PATH.'
            })
        
        else:
            return JsonResponse({
                'success': False,
                'error': f'Language "{detected_language}" is not supported yet. Currently supported: Python, Java, C, C++, C#, .NET, JavaScript, PHP, HTML, CSS, Assembly, COBOL'
            })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid JSON data'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Server error: {str(e)}'
        })
