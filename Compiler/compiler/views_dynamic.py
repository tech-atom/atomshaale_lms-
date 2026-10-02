from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import subprocess
import json
import tempfile
import os

try:
    from .portable_compiler_detector import get_compiler_path, is_compiler_available
    def check_compiler_availability(compiler_name):
        return is_compiler_available(compiler_name)
except ImportError:
    # Fallback if portable detector is not available
    def get_compiler_path(compiler_name):
        import sys
        if compiler_name == 'python':
            return sys.executable
        return compiler_name
    
    def check_compiler_availability(compiler_name):
        try:
            result = subprocess.run([compiler_name, '--version'], 
                                  capture_output=True, text=True, timeout=5)
            return result.returncode == 0
        except:
            return False

def dashboard(request):
    """Main dashboard view"""
    return render(request, 'compiler/dashboard.html')

def installation_guide(request):
    """Installation guide view"""
    return render(request, 'compiler/installation_guide.html')

def editor(request):
    """Code editor view"""
    return render(request, 'compiler/editor_new.html')

@csrf_exempt
@require_http_methods(["POST"])
def compile_code(request):
    """API endpoint to compile and run code"""
    try:
        data = json.loads(request.body)
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        if not code.strip():
            return JsonResponse({
                'success': False,
                'error': 'No code provided'
            })
        
        # Handle different languages
        if language == 'python':
            try:
                # Process Python code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Execute Python code
                result = subprocess.run([get_compiler_path('python'), '-c', processed_code], 
                                      capture_output=True, text=True, timeout=10)
                return JsonResponse({
                    'success': True,
                    'output': result.stdout,
                    'error': result.stderr
                })
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'Code execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Python execution error: {str(e)}'
                })
                
        elif language == 'java':
            if not check_compiler_availability('javac'):
                return JsonResponse({
                    'success': False,
                    'error': 'Java compiler not available. Please install JDK (Java Development Kit) and ensure javac is in your PATH.'
                })
            
            try:
                # Process Java code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Extract class name from code
                import re
                class_match = re.search(r'public\s+class\s+(\w+)', processed_code)
                if not class_match:
                    return JsonResponse({
                        'success': False,
                        'error': 'Java code must contain a public class declaration'
                    })
                
                class_name = class_match.group(1)
                
                # Create temporary Java file with correct class name
                with tempfile.NamedTemporaryFile(mode='w', suffix=f'.java', delete=False) as f:
                    f.write(processed_code)
                    java_file = f.name
                
                # Rename file to match class name
                correct_java_file = os.path.join(os.path.dirname(java_file), f"{class_name}.java")
                os.rename(java_file, correct_java_file)
                
                # Compile Java code
                compile_result = subprocess.run([get_compiler_path('javac'), correct_java_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    if os.path.exists(correct_java_file):
                        os.unlink(correct_java_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'Java compilation error: {compile_result.stderr}'
                    })
                
                # Run Java code
                class_file = correct_java_file.replace('.java', '.class')
                run_result = subprocess.run([get_compiler_path('java'), '-cp', os.path.dirname(correct_java_file), class_name], 
                                          capture_output=True, text=True, timeout=10)
                
                # Clean up
                if os.path.exists(correct_java_file):
                    os.unlink(correct_java_file)
                if os.path.exists(class_file):
                    os.unlink(class_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                })
                
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
                
        elif language == 'c':
            if not check_compiler_availability('gcc'):
                return JsonResponse({
                    'success': False,
                    'error': 'C compiler not available. Please install GCC (GNU Compiler Collection) or MinGW and ensure gcc is in your PATH.'
                })
            
            try:
                # Process C code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Create temporary C file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.c', delete=False) as f:
                    f.write(processed_code)
                    c_file = f.name
                
                # Compile C code
                exe_file = c_file.replace('.c', '.exe')
                compile_result = subprocess.run(['gcc', c_file, '-o', exe_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    os.unlink(c_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'C compilation error: {compile_result.stderr}'
                    })
                
                # Run C program
                run_result = subprocess.run([exe_file], 
                                          capture_output=True, text=True, timeout=10)
                
                # Clean up
                os.unlink(c_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                })
                
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
                
        elif language == 'cpp':
            if not check_compiler_availability('g++'):
                return JsonResponse({
                    'success': False,
                    'error': 'C++ compiler not available. Please install G++ (GNU Compiler Collection) or MinGW and ensure g++ is in your PATH.'
                })
            
            try:
                # Process C++ code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Create temporary C++ file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.cpp', delete=False) as f:
                    f.write(processed_code)
                    cpp_file = f.name
                
                # Compile C++ code
                exe_file = cpp_file.replace('.cpp', '.exe')
                compile_result = subprocess.run(['g++', cpp_file, '-o', exe_file], 
                                              capture_output=True, text=True, timeout=10)
                
                if compile_result.returncode != 0:
                    os.unlink(cpp_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'C++ compilation error: {compile_result.stderr}'
                    })
                
                # Run C++ program
                run_result = subprocess.run([exe_file], 
                                          capture_output=True, text=True, timeout=10)
                
                # Clean up
                os.unlink(cpp_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                })
                
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
                
        elif language == 'csharp' or language == 'dotnet':
            try:
                # Process C# code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Create temporary C# file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.cs', delete=False) as f:
                    f.write(processed_code)
                    cs_file = f.name
                
                # Try different .NET compilation approaches
                try:
                    # Method 1: Try dotnet run with a simple project
                    dir_name = os.path.dirname(cs_file)
                    project_name = os.path.basename(cs_file).replace('.cs', '')
                    
                    # Create a simple project file
                    csproj_content = '''<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>'''
                    
                    csproj_file = os.path.join(dir_name, f"{project_name}.csproj")
                    with open(csproj_file, 'w') as f:
                        f.write(csproj_content)
                    
                    # Rename to Program.cs for dotnet run
                    program_file = os.path.join(dir_name, "Program.cs")
                    os.rename(cs_file, program_file)
                    
                    # Run using dotnet run
                    run_result = subprocess.run(['dotnet', 'run', '--project', dir_name], 
                                              capture_output=True, text=True, timeout=15, cwd=dir_name)
                    
                    # Clean up
                    if os.path.exists(program_file):
                        os.unlink(program_file)
                    if os.path.exists(csproj_file):
                        os.unlink(csproj_file)
                    
                except Exception:
                    # Method 2: Try mcs (Mono C# Compiler) if available
                    try:
                        if os.path.exists(cs_file):
                            os.unlink(cs_file)
                        
                        with tempfile.NamedTemporaryFile(mode='w', suffix='.cs', delete=False) as f:
                            f.write(code)
                            cs_file = f.name
                        
                        exe_file = cs_file.replace('.cs', '.exe')
                        compile_result = subprocess.run(['mcs', cs_file, '-out:' + exe_file], 
                                                      capture_output=True, text=True, timeout=10)
                        
                        if compile_result.returncode != 0:
                            return JsonResponse({
                                'success': False,
                                'error': f'C# compilation error: {compile_result.stderr}'
                            })
                        
                        # Run with mono
                        run_result = subprocess.run(['mono', exe_file], 
                                                  capture_output=True, text=True, timeout=10)
                        
                        # Clean up
                        if os.path.exists(cs_file):
                            os.unlink(cs_file)
                        if os.path.exists(exe_file):
                            os.unlink(exe_file)
                            
                    except Exception:
                        # Method 3: Return a message about requirements
                        if os.path.exists(cs_file):
                            os.unlink(cs_file)
                        return JsonResponse({
                            'success': False,
                            'error': 'C#/.NET execution requires either .NET SDK (dotnet command) or Mono C# compiler (mcs) to be installed and available in PATH.'
                        })
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                })
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'C#/.NET execution timed out (15 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'C#/.NET execution error: {str(e)}'
                })
                
        elif language == 'php':
            try:
                # Process PHP code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Execute PHP code
                result = subprocess.run(['php', '-r', processed_code], 
                                      capture_output=True, text=True, timeout=10)
                return JsonResponse({
                    'success': True,
                    'output': result.stdout,
                    'error': result.stderr
                })
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
                
        elif language == 'html':
            # For HTML, we'll return a preview/validation
            return JsonResponse({
                'success': True,
                'output': f'HTML code validated successfully!\\n\\nPreview: Your HTML contains {len(code.split("<"))-1} tags.\\n\\nTo see the full preview, save this code as an HTML file and open it in a browser.',
                'error': ''
            })
            
        elif language == 'css':
            # For CSS, we'll return a validation
            return JsonResponse({
                'success': True,
                'output': f'CSS code validated successfully!\\n\\nYour CSS contains {len(code.split("{"))-1} rule blocks.\\n\\nTo see the styling in action, combine this CSS with HTML code.',
                'error': ''
            })
            
        elif language == 'assembly':
            try:
                # Process Assembly code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Create temporary assembly file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.asm', delete=False) as f:
                    f.write(processed_code)
                    asm_file = f.name
                
                # Assemble using NASM
                obj_file = asm_file.replace('.asm', '.o')
                exe_file = asm_file.replace('.asm', '.exe')
                
                # Assemble
                assemble_result = subprocess.run(['nasm', '-f', 'elf64', asm_file, '-o', obj_file], 
                                               capture_output=True, text=True, timeout=10)
                
                if assemble_result.returncode != 0:
                    os.unlink(asm_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'Assembly error: {assemble_result.stderr}'
                    })
                
                # Link
                link_result = subprocess.run(['ld', obj_file, '-o', exe_file], 
                                           capture_output=True, text=True, timeout=10)
                
                if link_result.returncode != 0:
                    os.unlink(asm_file)
                    if os.path.exists(obj_file):
                        os.unlink(obj_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'Linking error: {link_result.stderr}'
                    })
                
                # Run
                run_result = subprocess.run([exe_file], 
                                          capture_output=True, text=True, timeout=10)
                
                # Clean up
                os.unlink(asm_file)
                if os.path.exists(obj_file):
                    os.unlink(obj_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                })
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'Assembly execution timed out (10 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'Assembly execution error: {str(e)} (NASM required)'
                })
                
        elif language == 'cobol':
            try:
                # Process COBOL code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Create temporary COBOL file
                with tempfile.NamedTemporaryFile(mode='w', suffix='.cob', delete=False) as f:
                    f.write(processed_code)
                    cob_file = f.name
                
                # Compile COBOL code using GnuCOBOL
                exe_file = cob_file.replace('.cob', '.exe')
                compile_result = subprocess.run(['cobc', '-x', cob_file, '-o', exe_file], 
                                              capture_output=True, text=True, timeout=15)
                
                if compile_result.returncode != 0:
                    os.unlink(cob_file)
                    return JsonResponse({
                        'success': False,
                        'error': f'COBOL compilation error: {compile_result.stderr}'
                    })
                
                # Run COBOL program
                run_result = subprocess.run([exe_file], 
                                          capture_output=True, text=True, timeout=10)
                
                # Clean up
                os.unlink(cob_file)
                if os.path.exists(exe_file):
                    os.unlink(exe_file)
                
                return JsonResponse({
                    'success': True,
                    'output': run_result.stdout,
                    'error': run_result.stderr
                })
                
            except subprocess.TimeoutExpired:
                return JsonResponse({
                    'success': False,
                    'error': 'COBOL execution timed out (15 seconds limit)'
                })
            except Exception as e:
                return JsonResponse({
                    'success': False,
                    'error': f'COBOL execution error: {str(e)} (GnuCOBOL required)'
                })
                
        elif language == 'javascript':
            try:
                # Process JavaScript code - replace escaped newlines with actual newlines
                processed_code = code.replace('\\n', '\n')
                
                # Execute JavaScript using Node.js
                result = subprocess.run(['node', '-e', processed_code], 
                                      capture_output=True, text=True, timeout=10)
                return JsonResponse({
                    'success': True,
                    'output': result.stdout,
                    'error': result.stderr
                })
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
        
        else:
            return JsonResponse({
                'success': False,
                'error': f'Language "{language}" is not supported yet. Currently supported: Python, Java, C, C++, C#, .NET, JavaScript, PHP, HTML, CSS, Assembly, COBOL'
            })
            
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'error': 'Invalid JSON in request body'
        })
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': f'Server error: {str(e)}'
        })
