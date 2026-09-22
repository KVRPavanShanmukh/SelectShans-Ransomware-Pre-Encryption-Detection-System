using System;
using System.Collections.Generic;

namespace SelectShans.Endpoint.Configuration
{
    public class EndpointOptions
    {
        public string BackendApiUrl { get; set; } = "http://127.0.0.1:5000";
        public string DetectorToken { get; set; } = "";
        public string ProtectedFolder { get; set; } = string.Empty;
        public int MonitoringWindowSeconds { get; set; } = 15;
        public int ModificationThreshold { get; set; } = 20;
        public int RenameThreshold { get; set; } = 10;
        public double EntropyThreshold { get; set; } = 7.5;

        public int QueueLimit { get; set; } = 10000;
        public int HeartbeatIntervalSeconds { get; set; } = 60;

        public List<string> SuspiciousExtensions { get; set; } = new List<string>
        {
            ".locked", ".lock", ".crypt", ".encrypted", ".enc"
        };
    }
}
