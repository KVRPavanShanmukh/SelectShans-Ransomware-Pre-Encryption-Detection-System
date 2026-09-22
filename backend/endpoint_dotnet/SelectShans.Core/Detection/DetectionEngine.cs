using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Telemetry;

namespace SelectShans.Endpoint.Detection
{
    public class EntropyAnalyzer
    {
        public static double CalculateEntropy(string filePath)
        {
            try
            {
                var fileInfo = new FileInfo(filePath);
                if (!fileInfo.Exists || fileInfo.Length == 0) return 0.0;

                using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                byte[] buffer = new byte[8192];
                int bytesRead = fs.Read(buffer, 0, buffer.Length);
                if (bytesRead == 0) return 0.0;

                var counts = new int[256];
                for (int i = 0; i < bytesRead; i++)
                {
                    counts[buffer[i]]++;
                }

                double entropy = 0;
                for (int i = 0; i < 256; i++)
                {
                    if (counts[i] > 0)
                    {
                        double px = (double)counts[i] / bytesRead;
                        entropy -= px * Math.Log2(px);
                    }
                }
                return entropy;
            }
            catch
            {
                return 0.0;
            }
        }
    }

    public class RiskEngine
    {
        private readonly ILogger<RiskEngine> _logger;
        private readonly TelemetryService _telemetryService;

        public event Action<int>? OnRiskScoreUpdated;

        public RiskEngine(ILogger<RiskEngine> logger, TelemetryService telemetryService)
        {
            _logger = logger;
            _telemetryService = telemetryService;
        }

        public virtual void Evaluate(string eventType, int count, string directory, string filepath)
        {
            int score = 0;
            string severity = "LOW";

            if (eventType == "suspicious_extension")
            {
                score = 90;
                severity = "CRITICAL";
                _logger.LogWarning("RISK: Suspicious extension detected: {FilePath}", filepath);
            }
            else if (eventType == "mass_rename")
            {
                score = Math.Min(count * 5, 100);
                if (score >= 80) severity = "CRITICAL";
                else if (score >= 50) severity = "HIGH";
                else severity = "MEDIUM";
                _logger.LogWarning("RISK: Mass rename detected ({Count} files) in {Dir}", count, directory);
            }
            else if (eventType == "mass_write")
            {
                score = Math.Min(count * 3, 100);
                if (score >= 80) severity = "HIGH";
                else if (score >= 40) severity = "MEDIUM";
                else severity = "LOW";
                _logger.LogWarning("RISK: Mass write detected ({Count} files) in {Dir}", count, directory);
            }
            else if (eventType == "mass_delete")
            {
                score = Math.Min(count * 2, 100);
                if (score >= 60) severity = "HIGH";
                else severity = "MEDIUM";
                _logger.LogWarning("RISK: Mass delete detected ({Count} files) in {Dir}", count, directory);
            }

            OnRiskScoreUpdated?.Invoke(score);

            if (severity == "HIGH" || severity == "CRITICAL")
            {
                var payload = new TelemetryPayload
                {
                    event_type = eventType,
                    directory = directory,
                    target_file = filepath,
                    severity = severity,
                    score = score,
                    event_count = count,
                    action_taken = "Logged by .NET Agent",
                    process_name = "unknown"
                };
                _telemetryService.QueueAlert(payload);
            }
        }
    }

    public class DetectionEngine
    {
        private readonly ILogger<DetectionEngine> _logger;
        private readonly EndpointOptions _options;
        private readonly RiskEngine _riskEngine;

        private readonly ConcurrentQueue<DateTime> _renameEvents = new();
        private readonly ConcurrentQueue<DateTime> _writeEvents = new();
        private readonly ConcurrentQueue<DateTime> _deleteEvents = new();
        private readonly ConcurrentDictionary<string, DateTime> _cooldowns = new();

        private readonly object _lock = new();

        public int TotalEvents { get; private set; }
        public int SuspiciousEvents { get; private set; }
        public DateTime? LastDetectionTime { get; private set; }
        public int CurrentRiskScore { get; private set; }
        public List<string> RecentActivity { get; } = new();

        public event Action? OnStateChanged;

        public DetectionEngine(
            ILogger<DetectionEngine> logger,
            IOptions<EndpointOptions> options,
            RiskEngine riskEngine)
        {
            _logger = logger;
            _options = options.Value;
            _riskEngine = riskEngine;

            _riskEngine.OnRiskScoreUpdated += score =>
            {
                if (score > CurrentRiskScore) CurrentRiskScore = score;
                NotifyStateChanged();
            };
        }

        private void AddActivity(string message)
        {
            lock (RecentActivity)
            {
                RecentActivity.Insert(0, $"{DateTime.Now:HH:mm:ss} {message}");
                if (RecentActivity.Count > 50)
                {
                    RecentActivity.RemoveAt(RecentActivity.Count - 1);
                }
            }
            NotifyStateChanged();
        }

        private void NotifyStateChanged()
        {
            OnStateChanged?.Invoke();
        }

        public void ProcessEvent(FileEvent fileEvent)
        {
            TotalEvents++;

            if (TotalEvents % 100 == 0) // Debounce UI updates for raw events
            {
                NotifyStateChanged();
            }

            DateTime now = DateTime.UtcNow;
            string dir = Path.GetDirectoryName(fileEvent.SrcPath) ?? "Unknown";

            // 2. Suspicious Extension Check (Ignores cooldown for immediate reporting)
            if (HasSuspiciousExtension(fileEvent.DestPath ?? fileEvent.SrcPath))
            {
                SuspiciousEvents++;
                LastDetectionTime = now;
                AddActivity($"Suspicious extension: {Path.GetFileName(fileEvent.DestPath ?? fileEvent.SrcPath)}");
                _riskEngine.Evaluate("suspicious_extension", 1, dir, fileEvent.DestPath ?? fileEvent.SrcPath);
                return;
            }

            // 3. Sliding Window & Mass Aggregation Check
            lock (_lock)
            {
                if (fileEvent.EventType == "moved")
                {
                    _renameEvents.Enqueue(now);
                    CleanOldEvents(_renameEvents, now);

                    if (_renameEvents.Count >= _options.RenameThreshold)
                    {
                        if (CanAnalyze(dir, now))
                        {
                            SuspiciousEvents++;
                            LastDetectionTime = now;
                            AddActivity($"Mass rename ({_renameEvents.Count} files)");
                            _riskEngine.Evaluate("mass_rename", _renameEvents.Count, dir, fileEvent.DestPath ?? "");
                            SetCooldown(dir, now);
                        }
                    }
                }
                else if (fileEvent.EventType == "modified")
                {
                    _writeEvents.Enqueue(now);
                    CleanOldEvents(_writeEvents, now);

                    if (_writeEvents.Count >= _options.ModificationThreshold)
                    {
                        if (CanAnalyze(dir, now))
                        {
                            double entropy = EntropyAnalyzer.CalculateEntropy(fileEvent.SrcPath);
                            if (entropy > _options.EntropyThreshold)
                            {
                                AddActivity($"High entropy: {entropy:F2}");
                                _logger.LogWarning("High entropy detected: {Entropy:F2} on {FilePath}", entropy, fileEvent.SrcPath);
                            }

                            SuspiciousEvents++;
                            LastDetectionTime = now;
                            AddActivity($"Mass modification ({_writeEvents.Count} files)");
                            _riskEngine.Evaluate("mass_write", _writeEvents.Count, dir, fileEvent.SrcPath);
                            SetCooldown(dir, now);
                        }
                    }
                }
                else if (fileEvent.EventType == "deleted")
                {
                    _deleteEvents.Enqueue(now);
                    CleanOldEvents(_deleteEvents, now);

                    if (_deleteEvents.Count >= _options.ModificationThreshold)
                    {
                        if (CanAnalyze(dir, now))
                        {
                            SuspiciousEvents++;
                            LastDetectionTime = now;
                            AddActivity($"Mass deletion ({_deleteEvents.Count} files)");
                            _riskEngine.Evaluate("mass_delete", _deleteEvents.Count, dir, fileEvent.SrcPath);
                            SetCooldown(dir, now);
                        }
                    }
                }
            }
        }

        private bool HasSuspiciousExtension(string filepath)
        {
            if (string.IsNullOrEmpty(filepath)) return false;
            var ext = Path.GetExtension(filepath);
            if (string.IsNullOrEmpty(ext)) return false;

            return _options.SuspiciousExtensions.Any(s => s.Equals(ext, StringComparison.OrdinalIgnoreCase));
        }

        private void CleanOldEvents(ConcurrentQueue<DateTime> queue, DateTime now)
        {
            while (queue.TryPeek(out var oldest) && (now - oldest).TotalSeconds > _options.MonitoringWindowSeconds)
            {
                queue.TryDequeue(out _);
            }
        }

        private bool CanAnalyze(string directory, DateTime now)
        {
            if (_cooldowns.TryGetValue(directory, out var cooldownEnd))
            {
                if (now < cooldownEnd)
                {
                    return false; // Still in cooldown
                }
            }
            return true;
        }

        private void SetCooldown(string directory, DateTime now)
        {
            // Set cooldown equal to the monitoring window.
            _cooldowns[directory] = now.AddSeconds(_options.MonitoringWindowSeconds);

            // Periodically clean up old cooldown entries to avoid memory leak
            if (_cooldowns.Count > 1000)
            {
                var keysToRemove = _cooldowns.Where(kvp => kvp.Value < now).Select(kvp => kvp.Key).ToList();
                foreach (var k in keysToRemove)
                {
                    _cooldowns.TryRemove(k, out _);
                }
            }
        }
    }
}
