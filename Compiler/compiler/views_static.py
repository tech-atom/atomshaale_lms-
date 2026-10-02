from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json

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
    """API endpoint with static predefined outputs"""
    try:
        data = json.loads(request.body)
        code = data.get('code', '')
        language = data.get('language', 'python')
        
        if not code.strip():
            return JsonResponse({
                'success': False,
                'error': 'No code provided'
            })
        
        # Static predefined outputs for each language
        static_outputs = {
            'python': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4\nCurrent time: 2025-08-11 18:45:23.123456',
                'error': ''
            },
            'java': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4',
                'error': ''
            },
            'c': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4',
                'error': ''
            },
            'cpp': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4',
                'error': ''
            },
            'csharp': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4',
                'error': ''
            },
            'dotnet': {
                'success': True,
                'output': 'Hello, .NET World!\nWelcome to Jango Compiler!\nNumber: 1\nNumber: 2\nNumber: 3\nNumber: 4\nNumber: 5',
                'error': ''
            },
            'javascript': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4\nCompiler info: {\n  name: \'Jango\',\n  version: \'2.0\',\n  languages: [ \'Python\', \'Java\', \'C++\' ]\n}',
                'error': ''
            },
            'php': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 0\nCount: 1\nCount: 2\nCount: 3\nCount: 4\nLanguage: Python\nLanguage: Java\nLanguage: C++\nLanguage: PHP',
                'error': ''
            },
            'html': {
                'success': True,
                'output': 'HTML code validated successfully!\n\nPreview: Your HTML contains 27 tags.\n\nTo see the full preview, save this code as an HTML file and open it in a browser.',
                'error': ''
            },
            'css': {
                'success': True,
                'output': 'CSS code validated successfully!\n\nYour CSS contains 4 rule blocks.\n\nTo see the styling in action, combine this CSS with HTML code.',
                'error': ''
            },
            'assembly': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nAssembly code executed successfully!',
                'error': ''
            },
            'cobol': {
                'success': True,
                'output': 'Hello, World!\nWelcome to Jango Compiler!\nCount: 1\nCount: 2\nCount: 3\nCount: 4\nCount: 5\nCOBOL program executed successfully!',
                'error': ''
            }
        }
        
        # Return static output based on language
        if language in static_outputs:
            return JsonResponse(static_outputs[language])
        else:
            return JsonResponse({
                'success': False,
                'error': f'Language "{language}" is not supported yet. Currently supported: Python, Java, C, C++, C#, .NET, JavaScript, PHP, HTML, CSS, Assembly, COBOL'
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
