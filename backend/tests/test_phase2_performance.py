"""
Phase 2 Performance Test Suite: Throughput, Latency, and Resource Efficiency
SelectShans – Ransomware Pre-Encryption Detection System
Measures real performance metrics under load.
"""
import unittest
import os
import sys
import tempfile
import time
import shutil
import psutil

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'detector_package')))

from engine import BehavioralDetectionEngine
from canary import SafeCanaryManager
from telemetry import TelemetryClient


class TestPhase2Performance(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.canary_mgr = SafeCanaryManager(instance_id="perf_test")
        self.engine = BehavioralDetectionEngine(
            monitored_directory=self.temp_dir,
            time_window_seconds=5.0,
            threshold_rename=50,
            threshold_write=100,
            threshold_delete=50,
            entropy_threshold=7.2,
            alert_cooldown_seconds=1.0,
            max_queue_size=1000,
            canary_manager=self.canary_mgr
        )

    def tearDown(self):
        self.canary_mgr.cleanup()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_01_event_processing_throughput_and_latency(self):
        """
        Processes 1,000 synthetic filesystem events through the behavioral engine
        and measures events/sec and average latency in milliseconds.
        """
        event_count = 1000
        test_files = [os.path.join(self.temp_dir, f"file_{i}.txt") for i in range(event_count)]

        # Pre-create files
        for f in test_files[:50]:
            with open(f, "w") as fp:
                fp.write("performance test content\n")

        process = psutil.Process()
        mem_before = process.memory_info().rss / (1024 * 1024)

        start_time = time.perf_counter()

        for i in range(event_count):
            path = test_files[i % 50]
            if i % 3 == 0:
                self.engine.process_file_created(path)
            elif i % 3 == 1:
                self.engine.process_file_modified(path)
            else:
                self.engine.process_file_deleted(path)

        end_time = time.perf_counter()

        mem_after = process.memory_info().rss / (1024 * 1024)
        total_time = end_time - start_time
        events_per_sec = event_count / total_time
        avg_latency_ms = (total_time / event_count) * 1000.0

        print(f"\n[PERFORMANCE RESULTS]")
        print(f"Total Events Processed : {event_count}")
        print(f"Total Time             : {total_time:.4f} seconds")
        print(f"Throughput             : {events_per_sec:.2f} events/sec")
        print(f"Average Latency        : {avg_latency_ms:.4f} ms/event")
        print(f"Memory RSS (Before)    : {mem_before:.2f} MB")
        print(f"Memory RSS (After)     : {mem_after:.2f} MB")
        print(f"Memory Delta           : {mem_after - mem_before:.2f} MB")

        # Performance assertions
        self.assertGreater(events_per_sec, 500, "Throughput should exceed 500 events/sec")
        self.assertLess(avg_latency_ms, 2.0, "Average latency per event must be under 2.0 ms")
        self.assertLess(mem_after - mem_before, 50.0, "Memory growth must remain tightly bounded")

    def test_02_bounded_queue_memory_protection(self):
        """
        Verifies that enqueuing 2,000 telemetry events to TelemetryClient
        caps queue size at MAX_QUEUE_BOUND (500) to prevent memory exhaustion.
        """
        client = TelemetryClient(
            api_base="http://127.0.0.1:5000",
            token="perf_token",
            detector_id="perf_det",
            hostname="PERF-NODE"
        )

        for i in range(2000):
            decision = {
                "event_type": "rapid_write",
                "directory": self.temp_dir,
                "target_file": f"doc_{i}.txt",
                "severity": "LOW",
                "score": 20,
                "event_count": 1,
                "action_taken": "Logged",
                "process_name": "unknown",
                "details": f"Modification {i}",
                "timestamp": time.time()
            }
            client.enqueue_activity(decision)

        # Queue must not grow beyond MAX_QUEUE_BOUND (500)
        self.assertEqual(client.queue_size, 500)


if __name__ == '__main__':
    unittest.main()
