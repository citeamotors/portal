// Citea Motors team portal for Windows: a window that opens teams.citeamotors.com using Edge WebView2
// (built into Windows 10 and 11). The portal lives on the web, so this app never needs updating for portal changes.
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace CiteaMotors
{
    static class Program
    {
        const string Home = "https://teams.citeamotors.com/";
        const string Host = "teams.citeamotors.com";
        static string DataDir => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CiteaMotors");
        static string LastFile => Path.Combine(DataDir, "last-page.txt");

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Directory.CreateDirectory(DataDir);
            var form = new Form { Text = "Citea Motors", Width = 1440, Height = 900, StartPosition = FormStartPosition.CenterScreen, MinimumSize = new System.Drawing.Size(420, 500) };
            try { form.Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
            var web = new WebView2 { Dock = DockStyle.Fill };
            form.Controls.Add(web);
            form.Load += async (s, e) =>
            {
                try
                {
                    var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(DataDir, "WebView"));
                    await web.EnsureCoreWebView2Async(env);
                }
                catch (Exception ex)
                {
                    if (MessageBox.Show("This app needs the Microsoft Edge WebView2 Runtime, which comes with Windows 10 and 11.\n\nOpen the download page?\n\n" + ex.Message,
                        "Citea Motors", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) == DialogResult.Yes)
                        Open("https://developer.microsoft.com/microsoft-edge/webview2/");
                    form.Close(); return;
                }
                var cw = web.CoreWebView2;
                cw.Settings.IsStatusBarEnabled = false;
                cw.Settings.AreDefaultContextMenusEnabled = true;
                // camera (VIN scan, photos), mic and location are allowed for the portal only
                cw.PermissionRequested += (o, a) =>
                {
                    if (Uri.TryCreate(a.Uri, UriKind.Absolute, out var u) && u.Host == Host) a.State = CoreWebView2PermissionState.Allow;
                };
                // links to other sites open in the normal browser
                cw.NewWindowRequested += (o, a) =>
                {
                    a.Handled = true;
                    if (Uri.TryCreate(a.Uri, UriKind.Absolute, out var u) && u.Host == Host) cw.Navigate(a.Uri); else Open(a.Uri);
                };
                cw.NavigationStarting += (o, a) =>
                {
                    if (!Uri.TryCreate(a.Uri, UriKind.Absolute, out var u)) return;
                    if (u.Scheme == "mailto" || u.Scheme == "tel" || u.Scheme == "sms") { a.Cancel = true; Open(a.Uri); return; }
                    if (a.IsUserInitiated && (u.Scheme == "http" || u.Scheme == "https") && u.Host != Host) { a.Cancel = true; Open(a.Uri); }
                };
                cw.DocumentTitleChanged += (o, a) => form.Text = "Citea Motors";
                cw.HistoryChanged += (o, a) => { try { File.WriteAllText(LastFile, cw.Source); } catch { } };
                var start = Home;
                try { var last = File.ReadAllText(LastFile).Trim(); if (Uri.TryCreate(last, UriKind.Absolute, out var lu) && lu.Host == Host) start = last; } catch { }
                cw.Navigate(start);
            };
            // F5 reload, Alt+Left/Right back/forward, Ctrl+Shift+H home
            form.KeyPreview = true;
            form.KeyDown += (s, e) =>
            {
                var cw = web.CoreWebView2; if (cw == null) return;
                if (e.KeyCode == Keys.F5) cw.Reload();
                else if (e.Alt && e.KeyCode == Keys.Left && cw.CanGoBack) cw.GoBack();
                else if (e.Alt && e.KeyCode == Keys.Right && cw.CanGoForward) cw.GoForward();
                else if (e.Control && e.Shift && e.KeyCode == Keys.H) cw.Navigate(Home);
            };
            Application.Run(form);
        }

        static void Open(string url) { try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); } catch { } }
    }
}
