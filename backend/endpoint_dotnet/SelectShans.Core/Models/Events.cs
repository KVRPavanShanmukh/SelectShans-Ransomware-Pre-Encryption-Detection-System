using System;

namespace SelectShans.Endpoint.Models
{
    public class FileEvent
    {
        public string EventType { get; set; } = string.Empty;
        public string SrcPath { get; set; } = string.Empty;
        public string? DestPath { get; set; }
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class TelemetryPayload
    {
        public string event_type { get; set; } = "unknown";
        public string directory { get; set; } = "Unknown";
        public string target_file { get; set; } = string.Empty;
        public string severity { get; set; } = "LOW";
        public int score { get; set; } = 0;
        public string detector_id { get; set; } = string.Empty;
        public string hostname { get; set; } = string.Empty;
        public int event_count { get; set; } = 1;
        public string action_taken { get; set; } = "Logged by .NET Agent";
        public string process_name { get; set; } = "unknown";
    }

    public class PingPayload
    {
        public string token { get; set; } = string.Empty;
        public string endpoint_id { get; set; } = string.Empty;
        public string hostname { get; set; } = string.Empty;
        public string version { get; set; } = "1.0.0";
        public string os { get; set; } = "Windows";
    }

    public class SyncActivitiesPayload
    {
        public string token { get; set; } = string.Empty;
        public TelemetryPayload[] activities { get; set; } = Array.Empty<TelemetryPayload>();
    }
}
