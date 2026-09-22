using System;
using System.IO;
using System.Threading;
using System.Threading.Channels;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Models;

namespace SelectShans.Endpoint.Monitoring
{
    public class FileSystemMonitor : IDisposable
    {
        private readonly ILogger<FileSystemMonitor> _logger;
        private readonly EndpointOptions _options;
        private readonly Channel<FileEvent> _eventChannel;
        private FileSystemWatcher? _watcher;
        private string _normalizedRoot = string.Empty;

        public FileSystemMonitor(ILogger<FileSystemMonitor> logger, IOptions<EndpointOptions> options, Channel<FileEvent> eventChannel)
        {
            _logger = logger;
            _options = options.Value;
            _eventChannel = eventChannel;
        }

        public void Start()
        {
            Stop();

            var folder = _options.ProtectedFolder;
            if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder))
            {
                _logger.LogWarning("Configured ProtectedFolder is invalid or does not exist: '{Directory}'", folder);
                return;
            }

            try
            {
                _normalizedRoot = Path.GetFullPath(folder);
                if (!_normalizedRoot.EndsWith(Path.DirectorySeparatorChar.ToString()))
                {
                    _normalizedRoot += Path.DirectorySeparatorChar;
                }

                _watcher = new FileSystemWatcher(_normalizedRoot)
                {
                    IncludeSubdirectories = true,
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.DirectoryName,
                    EnableRaisingEvents = true
                };

                _watcher.Changed += OnFileEvent;
                _watcher.Created += OnFileEvent;
                _watcher.Deleted += OnFileEvent;
                _watcher.Renamed += OnFileRenamed;
                _watcher.Error += OnWatcherError;

                _logger.LogInformation("Started monitoring boundary: {Directory}", _normalizedRoot);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to start monitoring {Directory}", folder);
                Stop();
            }
        }

        public void Stop()
        {
            if (_watcher != null)
            {
                _watcher.EnableRaisingEvents = false;
                _watcher.Dispose();
                _watcher = null;
            }
        }

        private bool IsWithinBoundary(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return false;

            try
            {
                var fullPath = Path.GetFullPath(path);

                // Add a trailing slash for robust prefix matching
                if (!fullPath.EndsWith(Path.DirectorySeparatorChar.ToString()) && !fullPath.EndsWith(Path.AltDirectorySeparatorChar.ToString()))
                {
                    // For file paths, we check if they start with the normalized root directory
                    // D:\ImportantData\file.txt starts with D:\ImportantData\
                    // D:\ImportantData2\file.txt does NOT start with D:\ImportantData\
                }
                else
                {
                    // Path is a directory ending with a slash
                }

                return fullPath.StartsWith(_normalizedRoot, StringComparison.OrdinalIgnoreCase);
            }
            catch
            {
                return false;
            }
        }

        private void OnFileEvent(object sender, FileSystemEventArgs e)
        {
            if (!IsWithinBoundary(e.FullPath)) return;

            // Safe check for directory, avoiding crash if file is inaccessible/deleted
            try
            {
                if (Directory.Exists(e.FullPath)) return;
            }
            catch { }

            var fileEvent = new FileEvent
            {
                EventType = e.ChangeType switch
                {
                    WatcherChangeTypes.Created => "modified",
                    WatcherChangeTypes.Changed => "modified",
                    WatcherChangeTypes.Deleted => "deleted",
                    _ => "unknown"
                },
                SrcPath = e.FullPath
            };

            EnqueueEvent(fileEvent);
        }

        private void OnFileRenamed(object sender, RenamedEventArgs e)
        {
            // If either old or new path is outside the boundary, we handle it carefully.
            // But if BOTH are outside, ignore completely.
            bool oldIn = IsWithinBoundary(e.OldFullPath);
            bool newIn = IsWithinBoundary(e.FullPath);

            if (!oldIn && !newIn) return;

            var fileEvent = new FileEvent
            {
                EventType = "moved",
                SrcPath = e.OldFullPath,
                DestPath = e.FullPath
            };

            EnqueueEvent(fileEvent);
        }

        private void EnqueueEvent(FileEvent fileEvent)
        {
            if (!_eventChannel.Writer.TryWrite(fileEvent))
            {
                _logger.LogWarning("Event channel full. Dropping raw filesystem event for {Path}", fileEvent.SrcPath);
            }
        }

        private void OnWatcherError(object sender, ErrorEventArgs e)
        {
            _logger.LogError(e.GetException(), "FileSystemWatcher error.");
        }

        public void Dispose()
        {
            Stop();
        }
    }
}
