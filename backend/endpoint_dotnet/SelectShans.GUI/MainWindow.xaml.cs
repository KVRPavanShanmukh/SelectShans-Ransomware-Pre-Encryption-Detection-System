using System;
using System.IO;
using System.Windows;
using System.Windows.Media;
using Microsoft.Extensions.Options;
using SelectShans.Endpoint.Configuration;
using SelectShans.Endpoint.Detection;
using SelectShans.Endpoint.Monitoring;

namespace SelectShans.GUI
{
    public partial class MainWindow : Window
    {
        private readonly FileSystemMonitor _fileSystemMonitor;
        private readonly DetectionEngine _detectionEngine;
        private readonly EndpointOptions _options;

        public MainWindow(FileSystemMonitor fileSystemMonitor, DetectionEngine detectionEngine, IOptions<EndpointOptions> options)
        {
            InitializeComponent();
            _fileSystemMonitor = fileSystemMonitor;
            _detectionEngine = detectionEngine;
            _options = options.Value;

            if (!string.IsNullOrWhiteSpace(_options.ProtectedFolder) && Directory.Exists(_options.ProtectedFolder))
            {
                TxtFolderPath.Text = _options.ProtectedFolder;
                BtnStart.IsEnabled = true;
            }

            _detectionEngine.OnStateChanged += UpdateDashboard;
        }

        private void BtnBrowse_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "Select a folder to protect against ransomware behavior",
                ShowNewFolderButton = true
            };

            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                TxtFolderPath.Text = dialog.SelectedPath;
                _options.ProtectedFolder = dialog.SelectedPath;
                BtnStart.IsEnabled = true;
            }
        }

        private void BtnStart_Click(object sender, RoutedEventArgs e)
        {
            if (string.IsNullOrWhiteSpace(_options.ProtectedFolder) || !Directory.Exists(_options.ProtectedFolder))
            {
                System.Windows.MessageBox.Show("Please select a valid folder to protect.", "Invalid Folder", System.Windows.MessageBoxButton.OK, System.Windows.MessageBoxImage.Warning);
                return;
            }

            _fileSystemMonitor.Start();

            BtnStart.IsEnabled = false;
            BtnBrowse.IsEnabled = false;
            BtnStop.IsEnabled = true;

            TxtStatus.Text = "Monitoring";
            TxtStatus.Foreground = System.Windows.Media.Brushes.Green;
        }

        private void BtnStop_Click(object sender, RoutedEventArgs e)
        {
            _fileSystemMonitor.Stop();

            BtnStart.IsEnabled = true;
            BtnBrowse.IsEnabled = true;
            BtnStop.IsEnabled = false;

            TxtStatus.Text = "Stopped";
            TxtStatus.Foreground = System.Windows.Media.Brushes.Gray;
        }

        private void UpdateDashboard()
        {
            Dispatcher.InvokeAsync(() =>
            {
                TxtTotalEvents.Text = _detectionEngine.TotalEvents.ToString();
                TxtSuspiciousEvents.Text = _detectionEngine.SuspiciousEvents.ToString();
                TxtRiskScore.Text = _detectionEngine.CurrentRiskScore.ToString();

                if (_detectionEngine.CurrentRiskScore >= 80)
                {
                    TxtRiskScore.Foreground = System.Windows.Media.Brushes.Red;
                    if (TxtStatus.Text != "Stopped")
                    {
                        TxtStatus.Text = "High Risk";
                        TxtStatus.Foreground = System.Windows.Media.Brushes.Red;
                    }
                }
                else if (_detectionEngine.CurrentRiskScore >= 50)
                {
                    TxtRiskScore.Foreground = System.Windows.Media.Brushes.Orange;
                    if (TxtStatus.Text != "Stopped")
                    {
                        TxtStatus.Text = "Warning";
                        TxtStatus.Foreground = System.Windows.Media.Brushes.Orange;
                    }
                }

                LstActivity.Items.Clear();
                lock (_detectionEngine.RecentActivity)
                {
                    foreach (var act in _detectionEngine.RecentActivity)
                    {
                        LstActivity.Items.Add(act);
                    }
                }
            });
        }

        protected override void OnClosed(EventArgs e)
        {
            _fileSystemMonitor.Stop();
            base.OnClosed(e);
        }
    }
}
