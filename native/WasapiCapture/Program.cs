using System.Diagnostics;
using System.Text.RegularExpressions;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace WasapiCaptureApp;

internal static class Program
{
  private static readonly WaveFormat TargetFormat = new(48000, 16, 2);
  private static readonly object StdOutLock = new();
  private static volatile bool _running = true;

  private static int Main(string[] args)
  {
    Console.InputEncoding = System.Text.Encoding.UTF8;
    Console.OutputEncoding = System.Text.Encoding.UTF8;

    try
    {
      if (args.Any(a => a is "--help" or "-h"))
      {
        PrintHelp();
        return 0;
      }
      if (args.Any(a => a == "--list-devices"))
      {
        ListDevices();
        return 0;
      }

      var sampleRate = GetInt(args, "--sample-rate", 48000);
      var channels = GetInt(args, "--channels", 2);
      var bitDepth = GetInt(args, "--bit-depth", 16);
      if (sampleRate != 48000 || channels != 2 || bitDepth != 16)
      {
        // Wir konvertieren intern immer auf 48k/2ch/16bit für FFmpeg.
        Console.Error.WriteLine(
          $"Hinweis: Ausgabe ist fest 48000Hz / 2ch / 16bit (angefordert: {sampleRate}/{channels}/{bitDepth}).");
      }

      var include = GetMulti(args, "--include-processes");
      var device = GetString(args, "--device");

      Console.CancelKeyPress += (_, e) =>
      {
        e.Cancel = true;
        _running = false;
      };

      if (include.Count > 0)
      {
        RunProcessCapture(include);
      }
      else
      {
        RunDesktopCapture(device);
      }

      return 0;
    }
    catch (Exception ex)
    {
      Console.Error.WriteLine($"Fehler: {ex.Message}");
      return 1;
    }
  }

  private static void PrintHelp()
  {
    Console.Error.WriteLine(
      """
      2you WASAPI Capture
      Usage: audio_capture.exe [options]

      Options:
        --sample-rate <Hz>           (ignored, always 48000)
        --channels <count>           (ignored, always 2)
        --bit-depth <bits>           (ignored, always 16)
        --include-processes <pid>... Capture app audio (process loopback)
        --device <name|id>           Desktop loopback device (substring match)
        --list-devices               List render devices
        --help                       Show help

      PCM s16le stereo 48 kHz is written to stdout. Logs go to stderr.
      """);
  }

  private static void ListDevices()
  {
    using var enumerator = new MMDeviceEnumerator();
    var def = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Console);
    Console.Error.WriteLine($"Default: {def.FriendlyName}");
    foreach (var d in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
    {
      using (d)
      {
        var mark = d.ID == def.ID ? " *" : "";
        Console.Error.WriteLine($"{d.FriendlyName}{mark}");
        Console.Error.WriteLine($"  id={d.ID}");
      }
    }
  }

  private static void RunDesktopCapture(string? deviceQuery)
  {
    using var enumerator = new MMDeviceEnumerator();
    MMDevice device;
    if (!string.IsNullOrWhiteSpace(deviceQuery))
    {
      device = FindDevice(enumerator, deviceQuery)
        ?? throw new InvalidOperationException($"Gerät nicht gefunden: {deviceQuery}");
    }
    else
    {
      device = PickBestRenderDevice(enumerator);
    }

    Console.Error.WriteLine($"Desktop-Loopback: {device.FriendlyName}");
    using var capture = new WasapiLoopbackCapture(device);
    using var provider = new CaptureWaveProvider(capture);
    using var resampler = new MediaFoundationResampler(provider, TargetFormat)
    {
      ResamplerQuality = 60,
    };

    var buffer = new byte[TargetFormat.AverageBytesPerSecond / 10]; // 100ms
    capture.StartRecording();
    Console.Error.WriteLine("Capturing desktop…");

    while (_running)
    {
      if (provider.BufferedBytes < TargetFormat.BlockAlign * 64)
      {
        Thread.Sleep(5);
        continue;
      }

      var read = resampler.Read(buffer, 0, buffer.Length);
      if (read > 0)
        WriteStdout(buffer, read);
      else
        Thread.Sleep(5);
    }

    capture.StopRecording();
  }

  private static void RunProcessCapture(List<int> pids)
  {
    var unique = pids.Where(p => p > 0).Distinct().ToList();
    if (unique.Count == 0)
      throw new InvalidOperationException("Keine gültigen PIDs");

    // Dedup auf Prozess-Bäume: nur Wurzeln behalten (kein Kind eines anderen)
    var roots = SelectTreeRoots(unique);
    Console.Error.WriteLine(
      $"App-Loopback PIDs: {string.Join(", ", roots)} (von {string.Join(", ", unique)})");

    var mixLock = new object();
    var pending = new List<byte[]>();
    var captures = new List<ProcessLoopbackCapture>();

    foreach (var pid in roots)
    {
      try
      {
        var name = SafeProcessName(pid);
        var cap = new ProcessLoopbackCapture(pid, includeTree: true, TargetFormat);
        cap.DataAvailable += (_, e) =>
        {
          if (e.BytesRecorded <= 0) return;
          var copy = new byte[e.BytesRecorded];
          Buffer.BlockCopy(e.Buffer, 0, copy, 0, e.BytesRecorded);
          lock (mixLock) pending.Add(copy);
        };
        cap.Start();
        captures.Add(cap);
        Console.Error.WriteLine($"  + PID {pid} ({name})");
      }
      catch (Exception ex)
      {
        Console.Error.WriteLine($"  ! PID {pid} übersprungen: {ex.Message}");
      }
    }

    if (captures.Count == 0)
      throw new InvalidOperationException("Kein Process-Loopback gestartet");

    Console.Error.WriteLine("Capturing app audio…");
    var lastWrite = Stopwatch.StartNew();

    while (_running)
    {
      List<byte[]> chunk;
      lock (mixLock)
      {
        chunk = pending.ToList();
        pending.Clear();
      }

      if (chunk.Count == 0)
      {
        // Keine künstliche Stille — FFmpeg wartet auf echte Samples.
        // Kurze Pause, damit die CPU nicht spinnt.
        if (lastWrite.ElapsedMilliseconds > 500)
        {
          // Heartbeat-Log max. alle 2s
        }
        Thread.Sleep(5);
        continue;
      }

      var mixed = MixPcm16(chunk);
      if (mixed.Length > 0)
      {
        WriteStdout(mixed, mixed.Length);
        lastWrite.Restart();
      }
    }

    foreach (var c in captures) c.Dispose();
  }

  private static byte[] MixPcm16(List<byte[]> chunks)
  {
    var maxLen = chunks.Max(c => c.Length);
    // pad to even
    maxLen -= maxLen % 2;
    if (maxLen <= 0) return Array.Empty<byte>();

    var mix = new int[maxLen / 2];
    foreach (var c in chunks)
    {
      var n = Math.Min(c.Length, maxLen) / 2;
      for (var i = 0; i < n; i++)
      {
        var s = (short)(c[i * 2] | (c[i * 2 + 1] << 8));
        mix[i] += s;
      }
    }

    var outBuf = new byte[maxLen];
    for (var i = 0; i < mix.Length; i++)
    {
      var v = Math.Clamp(mix[i], short.MinValue, short.MaxValue);
      outBuf[i * 2] = (byte)(v & 0xff);
      outBuf[i * 2 + 1] = (byte)((v >> 8) & 0xff);
    }
    return outBuf;
  }

  private static List<int> SelectTreeRoots(List<int> pids)
  {
    // Wenn wir alle Spotify-PIDs haben, process loopback mit includetree
    // auf dem Parent reicht oft. Wir starten trotzdem alle Top-Level-PIDs,
    // deren Parent nicht in der Liste ist.
    var set = pids.ToHashSet();
    var roots = new List<int>();
    foreach (var pid in pids)
    {
      try
      {
        var parent = GetParentPid(pid);
        if (parent > 0 && set.Contains(parent))
          continue; // Kind eines anderen ausgewählten → Tree deckt ab
        roots.Add(pid);
      }
      catch
      {
        roots.Add(pid);
      }
    }
    return roots.Count > 0 ? roots : pids;
  }

  private static int GetParentPid(int pid)
  {
    try
    {
      foreach (var (child, parent) in EnumProcessParents())
        if (child == pid) return parent;
    }
    catch
    {
      /* ignore */
    }
    return 0;
  }

  private static IEnumerable<(int Pid, int Parent)> EnumProcessParents()
  {
    var snap = NativeProcess.CreateToolhelp32Snapshot(0x2 /* TH32CS_SNAPPROCESS */, 0);
    if (snap == IntPtr.Zero || snap == new IntPtr(-1))
      yield break;
    try
    {
      var pe = new NativeProcess.ProcessEntry32
      {
        dwSize = (uint)System.Runtime.InteropServices.Marshal.SizeOf<NativeProcess.ProcessEntry32>(),
      };
      if (!NativeProcess.Process32First(snap, ref pe)) yield break;
      do
      {
        yield return ((int)pe.th32ProcessID, (int)pe.th32ParentProcessID);
      } while (NativeProcess.Process32Next(snap, ref pe));
    }
    finally
    {
      NativeProcess.CloseHandle(snap);
    }
  }

  private static string SafeProcessName(int pid)
  {
    try { return Process.GetProcessById(pid).ProcessName; }
    catch { return "?"; }
  }

  private static MMDevice PickBestRenderDevice(MMDeviceEnumerator enumerator)
  {
    var def = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Console);
    var all = enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active).ToList();

    // Elgato Wave Link: „System“ = gemischte Desktop-Ausgabe
    var system = all.FirstOrDefault(d =>
      Regex.IsMatch(d.FriendlyName, @"^System\s*\(Elgato Virtual Audio\)", RegexOptions.IgnoreCase));
    if (system != null)
    {
      Console.Error.WriteLine(
        $"Wave-Link erkannt — nutze '{system.FriendlyName}' statt '{def.FriendlyName}'.");
      if (!ReferenceEquals(system, def)) def.Dispose();
      foreach (var d in all.Where(d => !ReferenceEquals(d, system))) d.Dispose();
      return system;
    }

    if (!IsVirtualDevice(def.FriendlyName))
    {
      foreach (var d in all.Where(d => d.ID != def.ID)) d.Dispose();
      return def;
    }

    var real = all.FirstOrDefault(d => !IsVirtualDevice(d.FriendlyName));
    if (real != null)
    {
      Console.Error.WriteLine(
        $"Default '{def.FriendlyName}' ist virtuell — nutze '{real.FriendlyName}'.");
      if (!ReferenceEquals(real, def)) def.Dispose();
      foreach (var d in all.Where(d => !ReferenceEquals(d, real))) d.Dispose();
      return real;
    }

    foreach (var d in all.Where(d => d.ID != def.ID)) d.Dispose();
    return def;
  }

  private static bool IsVirtualDevice(string name) =>
    Regex.IsMatch(
      name,
      @"virtual\s*audio|cable\s*input|cable\s*output|vb-audio|voicemeeter|obs[- ]?virtual|steam streaming speakers|discord \(elgato virtual",
      RegexOptions.IgnoreCase);

  private static MMDevice? FindDevice(MMDeviceEnumerator enumerator, string query)
  {
    foreach (var d in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
    {
      if (d.ID.Equals(query, StringComparison.OrdinalIgnoreCase) ||
          d.FriendlyName.Contains(query, StringComparison.OrdinalIgnoreCase))
        return d;
      d.Dispose();
    }
    return null;
  }

  private static void WriteStdout(byte[] buffer, int count)
  {
    lock (StdOutLock)
    {
      var stdout = Console.OpenStandardOutput();
      stdout.Write(buffer, 0, count);
      stdout.Flush();
    }
  }

  private static int GetInt(string[] args, string key, int fallback)
  {
    for (var i = 0; i < args.Length - 1; i++)
      if (args[i] == key && int.TryParse(args[i + 1], out var v))
        return v;
    return fallback;
  }

  private static string? GetString(string[] args, string key)
  {
    for (var i = 0; i < args.Length - 1; i++)
      if (args[i] == key) return args[i + 1];
    return null;
  }

  private static List<int> GetMulti(string[] args, string key)
  {
    var list = new List<int>();
    for (var i = 0; i < args.Length; i++)
    {
      if (args[i] != key) continue;
      for (var j = i + 1; j < args.Length; j++)
      {
        if (args[j].StartsWith("--", StringComparison.Ordinal)) break;
        if (int.TryParse(args[j], out var pid) && pid > 0) list.Add(pid);
      }
    }
    return list;
  }
}

internal sealed class CaptureWaveProvider : IWaveProvider, IDisposable
{
  private readonly BufferedWaveProvider _buffer;

  public CaptureWaveProvider(WasapiLoopbackCapture capture)
  {
    _buffer = new BufferedWaveProvider(capture.WaveFormat)
    {
      DiscardOnBufferOverflow = true,
      BufferLength = capture.WaveFormat.AverageBytesPerSecond * 2,
    };
    capture.DataAvailable += (_, e) =>
    {
      if (e.BytesRecorded > 0)
        _buffer.AddSamples(e.Buffer, 0, e.BytesRecorded);
    };
  }

  public int BufferedBytes => _buffer.BufferedBytes;
  public WaveFormat WaveFormat => _buffer.WaveFormat;
  public int Read(byte[] buffer, int offset, int count) => _buffer.Read(buffer, offset, count);
  public void Dispose() { /* BufferedWaveProvider has nothing to dispose */ }
}

internal static class NativeProcess
{
  [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

  [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool Process32First(IntPtr hSnapshot, ref ProcessEntry32 lppe);

  [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool Process32Next(IntPtr hSnapshot, ref ProcessEntry32 lppe);

  [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool CloseHandle(IntPtr hObject);

  [System.Runtime.InteropServices.StructLayout(System.Runtime.InteropServices.LayoutKind.Sequential, CharSet = System.Runtime.InteropServices.CharSet.Auto)]
  public struct ProcessEntry32
  {
    public uint dwSize;
    public uint cntUsage;
    public uint th32ProcessID;
    public IntPtr th32DefaultHeapID;
    public uint th32ModuleID;
    public uint cntThreads;
    public uint th32ParentProcessID;
    public int pcPriClassBase;
    public uint dwFlags;
    [System.Runtime.InteropServices.MarshalAs(System.Runtime.InteropServices.UnmanagedType.ByValTStr, SizeConst = 260)]
    public string szExeFile;
  }
}
