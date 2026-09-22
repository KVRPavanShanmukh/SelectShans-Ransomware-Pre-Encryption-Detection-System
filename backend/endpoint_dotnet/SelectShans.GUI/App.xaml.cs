using System.IO;
using System.Threading.Channels;
using System.Windows;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Detection;
using SelectShans.Endpoint.Models;
using SelectShans.Endpoint.Monitoring;
using SelectShans.Endpoint.Telemetry;
using SelectShans.Endpoint.Workers;

namespace SelectShans.GUI
{
    public partial class App : System.Windows.Application
    {
        private IHost _host;

        public App()
        {
            _host = Host.CreateDefaultBuilder()
                .ConfigureAppConfiguration((context, config) =>
                {
                    // The core project has appsettings.json
                    string corePath = Path.Combine(System.AppContext.BaseDirectory, "..", "..", "..", "..", "SelectShans.Core");
                    if (Directory.Exists(corePath))
                    {
                        config.AddJsonFile(Path.Combine(corePath, "appsettings.json"), optional: true, reloadOnChange: true);
                    }
                    else
                    {
                        config.AddJsonFile("appsettings.json", optional: true, reloadOnChange: true);
                    }
                })
                .ConfigureServices((context, services) =>
                {
                    services.Configure<EndpointOptions>(context.Configuration.GetSection("EndpointOptions"));

                    // Setup non-blocking event channel
                    services.AddSingleton(Channel.CreateBounded<FileEvent>(new BoundedChannelOptions(10000)
                    {
                        FullMode = BoundedChannelFullMode.DropOldest
                    }));

                    services.AddSingleton<RiskEngine>();
                    services.AddSingleton<DetectionEngine>();
                    services.AddSingleton<FileSystemMonitor>();

                    // Background Services
                    services.AddHostedService<MonitoringWorker>();

                    // Required so that RiskEngine can queue telemetry directly
                    services.AddSingleton<TelemetryService>();
                    services.AddHostedService(provider => provider.GetRequiredService<TelemetryService>());

                    // UI
                    services.AddSingleton<MainWindow>();
                })
                .Build();
        }

        protected override async void OnStartup(StartupEventArgs e)
        {
            await _host.StartAsync();

            var mainWindow = _host.Services.GetRequiredService<MainWindow>();
            mainWindow.Show();

            base.OnStartup(e);
        }

        protected override async void OnExit(ExitEventArgs e)
        {
            using (_host)
            {
                await _host.StopAsync(System.TimeSpan.FromSeconds(5));
            }
            base.OnExit(e);
        }
    }
}
