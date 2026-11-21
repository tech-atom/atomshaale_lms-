import json
import os
import tempfile
from unittest.mock import patch

from django.contrib.auth.models import AnonymousUser
from django.http import HttpRequest
from django.test import RequestFactory, SimpleTestCase

from .sandbox import SandboxUnavailable, run_sandboxed
from .views import (
    _has_java_runtime,
    compile_code_exam_sync,
    compile_code_exam,
    evaluate_code_with_test_cases,
    find_compiler,
)


class SandboxRunnerTests(SimpleTestCase):
    @patch('exam.sandbox.subprocess.run')
    def test_runner_uses_isolation_flags(self, run):
        run.return_value = type('Result', (), {
            'returncode': 0,
            'stdout': json.dumps({'success': True, 'output': '5'}),
            'stderr': '',
        })()

        result = run_sandboxed({'code': 'print(2 + 3)', 'language': 'python'})
        command = run.call_args.args[0]

        self.assertTrue(result['success'])
        self.assertIn('--interactive', command)
        self.assertIn('--network=none', command)
        self.assertIn('--read-only', command)
        self.assertIn('--cap-drop=ALL', command)
        self.assertIn('--pids-limit', command)
        self.assertIn('--memory', command)
        self.assertIn('--cpus', command)
        self.assertIn('--user', command)

    @patch('exam.sandbox.subprocess.run', side_effect=FileNotFoundError)
    def test_missing_docker_fails_closed(self, run):
        with self.assertRaises(SandboxUnavailable):
            run_sandboxed({'code': 'print(1)', 'language': 'python'})

    def test_legacy_synchronous_entrypoint_is_disabled(self):
        with self.assertRaises(RuntimeError):
            compile_code_exam_sync(HttpRequest())


class CompilerDiscoveryTests(SimpleTestCase):
    @patch('exam.views.os.name', 'posix')
    @patch('exam.views.shutil.which')
    @patch('exam.views.get_compiler_path')
    @patch('exam.views.is_compiler_available')
    def test_linux_uses_system_jdk_without_checking_windows_bundle(
        self,
        is_compiler_available,
        get_compiler_path,
        which,
    ):
        which.return_value = '/usr/bin/javac'

        self.assertEqual(find_compiler('javac'), '/usr/bin/javac')
        is_compiler_available.assert_not_called()
        get_compiler_path.assert_not_called()

    def test_java_portable_compiler_requires_jdk_modules(self):
        with tempfile.TemporaryDirectory() as java_home:
            compiler = os.path.join(java_home, 'bin', 'javac.exe')
            os.makedirs(os.path.dirname(compiler))
            with open(compiler, 'wb'):
                pass

            self.assertFalse(_has_java_runtime(compiler))
            os.makedirs(os.path.join(java_home, 'lib'))
            with open(os.path.join(java_home, 'lib', 'modules'), 'wb'):
                pass
            self.assertTrue(_has_java_runtime(compiler))

    def test_incomplete_windows_java_bundle_is_not_selected(self):
        with tempfile.TemporaryDirectory() as java_home:
            compiler = os.path.join(java_home, 'bin', 'javac.exe')
            os.makedirs(os.path.dirname(compiler))
            with open(compiler, 'wb'):
                pass

            with (
                patch('exam.views.os.name', 'nt'),
                patch('exam.views.shutil.which', return_value=None),
                patch('exam.views.is_compiler_available', return_value=True),
                patch('exam.views.get_compiler_path', return_value=compiler),
            ):
                self.assertIsNone(find_compiler('javac'))


class ProductionJavaJudgeTests(SimpleTestCase):
    @patch('exam.compiler_tasks.execute_compiler_job.apply_async')
    def test_java_judge_uses_compiler_worker_in_production(self, apply_async):
        apply_async.return_value.get.return_value = {
            'verdict': 'Accepted',
            'passed': 1,
            'total': 1,
            'details': [{'test_case': 1, 'status': 'Pass', 'got': '3'}],
        }

        with self.settings(COMPILER_USE_SANDBOX=True):
            result = evaluate_code_with_test_cases(
                'public class Main { public static void main(String[] args) { System.out.println(3); } }',
                'java',
                [{'input': '', 'output': '3'}],
            )

        self.assertEqual(result['verdict'], 'Accepted')
        self.assertEqual(result['passed'], 1)
        payload = apply_async.call_args.kwargs['args'][0]
        self.assertEqual(payload['language'], 'java')
        self.assertEqual(payload['test_cases']['sample_test_cases'][0]['output'], '3')

    @patch('exam.views._run_compiler_job_in_sandbox')
    def test_java_run_code_uses_compiler_worker_without_question_id(self, run_sandboxed):
        run_sandboxed.return_value = {
            'success': True,
            'verdict': 'Accepted',
            'details': [{'status': 'Pass', 'got': 'Hello, World!'}],
        }
        request = RequestFactory().post(
            '/exam/api/compile-code/',
            data=json.dumps({
                'code': 'public class Main { public static void main(String[] args) {} }',
                'language': 'java',
            }),
            content_type='application/json',
        )
        request.user = AnonymousUser()
        request.session = {'pre_assessment_candidate': True}

        with self.settings(COMPILER_USE_SANDBOX=True):
            response = compile_code_exam(request)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(json.loads(response.content)['success'])
        self.assertEqual(run_sandboxed.call_args.args[0]['language'], 'java')
