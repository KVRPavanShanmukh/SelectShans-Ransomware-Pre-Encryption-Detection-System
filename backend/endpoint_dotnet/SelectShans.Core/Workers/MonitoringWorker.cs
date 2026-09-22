using System;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SelectShans.Endpoint.Detection;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Monitoring;

namespace SelectShans.Endpoint.Workers
{
    public class MonitoringWorker : BackgroundService
    {
        private readonly ILogger<MonitoringWorker> _logger;
        private readonly FileSystemMonitor _fileSystemMonitor;
        private readonly Channel<FileEvent> _eventChannel;
        private readonly DetectionEngine _detectionEngine;

        public MonitoringWorker(
            ILogger<MonitoringWorker> logger,
            FileSystemMonitor fileSystemMonitor,
            Channel<FileEvent> eventChannel,
            DetectionEngine detectionEngine)
        {
            _logger = logger;
            _fileSystemMonitor = fileSystemMonitor;
            _eventChannel = eventChannel;
            _detectionEngine = detectionEngine;
        }

        public override async Task StartAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Starting endpoint monitoring services...");
            // We do NOT start FileSystemMonitor here; the GUI will start it when the user clicks "Start Monitoring".
            await base.StartAsync(cancellationToken);
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            try
            {
                await foreach (var fileEvent in _eventChannel.Reader.ReadAllAsync(stoppingToken))
                {
                    try
                    {
                        _detectionEngine.ProcessEvent(fileEvent);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing event for {Path}", fileEvent.SrcPath);
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Normal shutdown
            }
        }

        public override async Task StopAsync(CancellationToken cancellationToken)
        {
            _logger.LogInformation("Stopping endpoint monitoring services...");
            _fileSystemMonitor.Dispose();
            await base.StopAsync(cancellationToken);
        }
    }
}
