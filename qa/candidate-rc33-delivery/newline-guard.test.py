"""Exercise the strict byte comparator without executing candidate operations."""
import ast
from pathlib import Path
import unittest

tree = ast.parse((Path(__file__).parent / 'finalize-source-readiness.py').read_text())
definition = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'canonical_working_bytes_match')
namespace = {}
exec(compile(ast.Module(body=[definition], type_ignores=[]), '<comparator>', 'exec'), namespace)
matches = namespace['canonical_working_bytes_match']
adaptation_definition = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'known_current_adaptation')
exec(compile(ast.Module(body=[adaptation_definition], type_ignores=[]), '<adaptation>', 'exec'), namespace)
adaptation = namespace['known_current_adaptation']

class NewlineGuard(unittest.TestCase):
    def test_exact_bytes(self):
        self.assertTrue(matches('binary.wasm', b'\x00\r\n', b'\x00\r\n', False))

    def test_two_explicit_modules(self):
        for name in ('media/video-q3-worker.mjs', 'media/video-q3-codec.mjs'):
            self.assertTrue(matches(name, b'a\r\nb\n', b'a\nb\n', True))

    def test_other_assets_reject(self):
        for name in ('media/video-q3-codec.wasm', 'app.js', 'licenses/video-q3-source.tgz'):
            self.assertFalse(matches(name, b'a\r\n', b'a\n', True))

    def test_content_or_attribute_drift_reject(self):
        name = 'media/video-q3-codec.mjs'
        self.assertFalse(matches(name, b'a\r\nX', b'a\n', True))
        self.assertFalse(matches(name, b'a\r\n', b'a\n', False))
        self.assertFalse(matches(name, b'a\r', b'a\n', True))

    def test_exact_current_adaptation(self):
        old = 'd190c83bb93a3a07853c4466783985e75f6369704fc23e80082b60b56fc1e2db'
        current = '90fc6a366beece135ce077aa79bba5ae386a6d40fbe7ff8ce8b062de055b2ce5'
        self.assertTrue(adaptation('media/audio-general-pipeline.mjs', old, current, current))
        self.assertFalse(adaptation('media/audio-codec.wasm', old, current, current))
        self.assertFalse(adaptation('media/audio-general-pipeline.mjs', '0' * 64, current, current))
        self.assertFalse(adaptation('media/audio-general-pipeline.mjs', old, '0' * 64, current))
        self.assertFalse(adaptation('media/audio-general-pipeline.mjs', old, current, '0' * 64))

if __name__ == '__main__':
    unittest.main()
