import json
from unittest.mock import patch

from django.test import SimpleTestCase
from django.http import HttpRequest

from .sandbox import SandboxUnavailable, run_sandboxed
from .views import compile_code_exam_sync


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
