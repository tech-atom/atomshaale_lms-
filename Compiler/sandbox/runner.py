import json
import os
import signal
import subprocess
import sys
import tempfile
import threading

OUTPUT_LIMIT = 256 * 1024
TIMEOUT = 15


def limited_run(command, stdin_data, timeout=TIMEOUT, cwd='/workspace'):
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        errors='replace',
        start_new_session=True,
    )
    captured = {'stdout': [], 'stderr': [], 'size': {'stdout': 0, 'stderr': 0}}

    def collect(stream, name):
        for chunk in iter(lambda: stream.read(4096), ''):
            remaining = OUTPUT_LIMIT - captured['size'][name]
            if remaining > 0:
                captured[name].append(chunk[:remaining])
                captured['size'][name] += len(chunk)
            if captured['size'][name] >= OUTPUT_LIMIT:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                break

    threads = [threading.Thread(target=collect, args=(process.stdout, 'stdout')), threading.Thread(target=collect, args=(process.stderr, 'stderr'))]
    for thread in threads:
        thread.start()
    try:
        process.stdin.write(stdin_data or '')
        process.stdin.close()
        process.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        process.wait()
        return -1, ''.join(captured['stdout']), 'Time Limit Exceeded'
    finally:
        for thread in threads:
            thread.join(timeout=1)

    return process.returncode, ''.join(captured['stdout']), ''.join(captured['stderr'])


def execute_case(code, language, stdin_data):
    language = language.lower().strip()
    with tempfile.TemporaryDirectory(dir='/workspace') as workdir:
        if language == 'python':
            source = os.path.join(workdir, 'main.py')
            open(source, 'w', encoding='utf-8').write(code)
            return limited_run(['python3', '-I', source], stdin_data, cwd=workdir)
        if language == 'javascript':
            return limited_run(['node', '--no-addons', '-e', code], stdin_data, cwd=workdir)
        if language in ('c', 'cpp', 'c++'):
            ext = '.c' if language == 'c' else '.cpp'
            source = os.path.join(workdir, 'main' + ext)
            binary = os.path.join(workdir, 'main')
            open(source, 'w', encoding='utf-8').write(code)
            compiler = 'gcc' if language == 'c' else 'g++'
            result = limited_run([compiler, source, '-O2', '-o', binary], '', cwd=workdir)
            if result[0] != 0:
                return result
            return limited_run([binary], stdin_data, cwd=workdir)
        if language == 'java':
            import re
            match = re.search(r'public\s+class\s+(\w+)', code)
            if not match:
                return 1, '', 'Java code must contain a public class declaration'
            name = match.group(1)
            source = os.path.join(workdir, name + '.java')
            open(source, 'w', encoding='utf-8').write(code)
            result = limited_run(['javac', source], '', cwd=workdir)
            if result[0] != 0:
                return result
            return limited_run(['java', '-cp', workdir, name], stdin_data, cwd=workdir)
        return 1, '', 'Language is not enabled in the sandbox image'


def main():
    payload = json.load(sys.stdin)
    code = str(payload.get('code', ''))
    language = str(payload.get('language', 'python'))
    test_cases = payload.get('test_cases')
    if isinstance(test_cases, dict):
        cases = (test_cases.get('sample_test_cases') or []) + (test_cases.get('hidden_test_cases') or [])
    elif isinstance(test_cases, list):
        cases = test_cases
    else:
        cases = [{'input': payload.get('input', ''), 'output': None}]

    details = []
    passed = 0
    terminal_status = None
    for index, case in enumerate(cases):
        expected = case.get('output', case.get('expected_output')) if isinstance(case, dict) else None
        stdin_data = str(case.get('input', case.get('stdin', '')) or '') if isinstance(case, dict) else ''
        returncode, stdout, stderr = execute_case(code, language, stdin_data)
        if returncode == -1:
            status = 'Time Limit Exceeded'
        elif returncode != 0:
            status = 'Compilation Error' if language in ('c', 'cpp', 'c++', 'java') and expected is not None and not stdout else 'Runtime Error'
        elif expected is not None and stdout.strip() != str(expected).strip():
            status = 'Fail'
        else:
            status = 'Pass'
        if status == 'Pass':
            passed += 1
        if status != 'Pass':
            terminal_status = status
        if index < len((test_cases or {}).get('sample_test_cases', [])) if isinstance(test_cases, dict) else index < len(cases):
            details.append({'test_case': index + 1, 'status': status, 'expected': expected, 'got': stdout, 'passed': status == 'Pass'})
        if status in ('Time Limit Exceeded', 'Runtime Error', 'Compilation Error'):
            break

    total = len(cases)
    verdict = 'Accepted' if passed == total else (terminal_status or 'Wrong Answer')
    print(json.dumps({'success': verdict == 'Accepted', 'verdict': verdict, 'passed': passed, 'total': total, 'details': details, 'output': f'{passed}/{total} test cases passed', 'error': '' if verdict == 'Accepted' else f'Verdict: {verdict}', 'language': language}))


if __name__ == '__main__':
    main()
