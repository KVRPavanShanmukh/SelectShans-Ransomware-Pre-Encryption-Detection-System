import unittest
import os
import tempfile
import time
from unittest.mock import patch, MagicMock

# Mock config before importing components
import sys
mock_config = MagicMock()
mock_config.get.side_effect = lambda k, d=None: 15 if "time_window" in k else (10 if "threshold" in k else d)
sys.modules['config'] = MagicMock(config_manager=mock_config)
sys.modules['telemetry'] = MagicMock()
sys.modules['process'] = MagicMock(get_process_for_file=lambda x: {"pid": 0, "name": "mock", "exe": "mock"})

from risk import risk_engine
from detection import detection_engine
from canary import canary_manager

class TestEndpointGuard(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        canary_manager.canary_locations = [self.temp_dir]
        detection_engine.rename_events.clear()
        detection_engine.write_events.clear()

    def tearDown(self):
        canary_manager.cleanup()
        import shutil
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_canary_deployment(self):
        canary_manager.deploy_canaries()
        files = os.listdir(self.temp_dir)
        self.assertTrue(len(files) > 0)
        self.assertTrue(canary_manager.is_canary(os.path.join(self.temp_dir, files[0])))

    @patch('risk.risk_engine.evaluate')
    def test_mass_rename_detection(self, mock_evaluate):
        # simulate renames
        for i in range(15):
            detection_engine.process_event("moved", "test.txt", "test.locked")
            
        mock_evaluate.assert_called()
        call_args = mock_evaluate.call_args[0][0]
        self.assertEqual(call_args["type"], "mass_rename")

    def test_entropy_calculation(self):
        # Create a low entropy file
        low_file = os.path.join(self.temp_dir, 'low.txt')
        with open(low_file, 'wb') as f:
            f.write(b'A' * 1024)
            
        # Create a high entropy file
        high_file = os.path.join(self.temp_dir, 'high.txt')
        with open(high_file, 'wb') as f:
            f.write(os.urandom(1024))
            
        ent_low = detection_engine._calculate_entropy(low_file)
        ent_high = detection_engine._calculate_entropy(high_file)
        
        self.assertLess(ent_low, 1.0)
        self.assertGreater(ent_high, 7.0)

if __name__ == '__main__':
    unittest.main()
