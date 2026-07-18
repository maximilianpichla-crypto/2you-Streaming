using System.Runtime.InteropServices;
using System.Threading;
using NAudio.Wave;

namespace WasapiCaptureApp;

/// <summary>
/// WASAPI Application Loopback (Win10 2004+): Audio einer Prozess-Baum-Wurzel,
/// unabhängig vom Ausgabegerät.
/// </summary>
internal sealed class ProcessLoopbackCapture : IDisposable
{
  private const string ProcessLoopbackDevice = "VAD\\Process_Loopback";
  private static readonly Guid IidIAudioClient = new("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");

  private readonly int _processId;
  private readonly bool _includeTree;
  private readonly WaveFormat _format;
  private IAudioClient? _audioClient;
  private IAudioCaptureClient? _captureClient;
  private EventWaitHandle? _frameEvent;
  private Thread? _thread;
  private volatile bool _running;
  private bool _disposed;

  public event EventHandler<WaveInEventArgs>? DataAvailable;

  public WaveFormat WaveFormat => _format;

  public ProcessLoopbackCapture(int processId, bool includeTree, WaveFormat format)
  {
    _processId = processId;
    _includeTree = includeTree;
    _format = format;
  }

  public void Start()
  {
    if (_running) throw new InvalidOperationException("Already capturing");
    ActivateAndInit();
    _running = true;
    _thread = new Thread(CaptureLoop)
    {
      IsBackground = true,
      Name = $"ProcessLoopback-{_processId}",
    };
    _thread.Start();
  }

  public void Stop()
  {
    _running = false;
    try { _frameEvent?.Set(); } catch { /* ignore */ }
    if (_thread != null && _thread.IsAlive)
      _thread.Join(2000);
    _thread = null;
    try { _audioClient?.Stop(); } catch { /* ignore */ }
  }

  private void ActivateAndInit()
  {
    var activation = new AudioClientActivationParams
    {
      ActivationType = AudioClientActivationType.ProcessLoopback,
      ProcessLoopbackParams = new AudioClientProcessLoopbackParams
      {
        TargetProcessId = (uint)_processId,
        ProcessLoopbackMode = _includeTree
          ? ProcessLoopbackMode.IncludeTargetProcessTree
          : ProcessLoopbackMode.ExcludeTargetProcessTree,
      },
    };

    var blobSize = Marshal.SizeOf<AudioClientActivationParams>();
    var blobPtr = Marshal.AllocHGlobal(blobSize);
    try
    {
      Marshal.StructureToPtr(activation, blobPtr, false);
      var prop = new PropVariant
      {
        vt = (ushort)VarEnum.VT_BLOB,
        blob = new Blob { cbSize = (uint)blobSize, pBlobData = blobPtr },
      };
      var propPtr = Marshal.AllocHGlobal(Marshal.SizeOf<PropVariant>());
      try
      {
        Marshal.StructureToPtr(prop, propPtr, false);
        var handler = new ActivateCompletionHandler();
        var iid = IidIAudioClient;
        var hr = NativeMethods.ActivateAudioInterfaceAsync(
          ProcessLoopbackDevice,
          ref iid,
          propPtr,
          handler,
          out _);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        handler.Wait(15000);
        if (handler.ActivateResult < 0)
          Marshal.ThrowExceptionForHR(handler.ActivateResult);
        if (handler.AudioClient == null)
          throw new InvalidOperationException("Process-Loopback: IAudioClient fehlt");

        _audioClient = handler.AudioClient;

        var fmt = new WaveFormatEx
        {
          wFormatTag = 1, // PCM
          nChannels = (ushort)_format.Channels,
          nSamplesPerSec = (uint)_format.SampleRate,
          wBitsPerSample = (ushort)_format.BitsPerSample,
          nBlockAlign = (ushort)(_format.Channels * _format.BitsPerSample / 8),
          nAvgBytesPerSec = (uint)(_format.SampleRate * _format.Channels * _format.BitsPerSample / 8),
          cbSize = 0,
        };
        var fmtPtr = Marshal.AllocHGlobal(Marshal.SizeOf<WaveFormatEx>());
        try
        {
          Marshal.StructureToPtr(fmt, fmtPtr, false);
          var flags =
            AudioClientStreamFlags.Loopback |
            AudioClientStreamFlags.EventCallback |
            AudioClientStreamFlags.AutoConvertPcm |
            AudioClientStreamFlags.SrcDefaultQuality;

          hr = _audioClient.Initialize(
            AudioClientShareMode.Shared,
            flags,
            0,
            0,
            fmtPtr,
            IntPtr.Zero);
          if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        }
        finally
        {
          Marshal.FreeHGlobal(fmtPtr);
        }

        _frameEvent = new EventWaitHandle(false, EventResetMode.AutoReset);
        hr = _audioClient.SetEventHandle(_frameEvent.SafeWaitHandle.DangerousGetHandle());
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);

        var captureGuid = typeof(IAudioCaptureClient).GUID;
        hr = _audioClient.GetService(ref captureGuid, out var captureObj);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        _captureClient = (IAudioCaptureClient)captureObj!;

        hr = _audioClient.Start();
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
      }
      finally
      {
        Marshal.FreeHGlobal(propPtr);
      }
    }
    finally
    {
      Marshal.FreeHGlobal(blobPtr);
    }
  }

  private void CaptureLoop()
  {
    var bytesPerFrame = _format.BlockAlign;
    var buffer = new byte[bytesPerFrame * 4800];
    try
    {
      while (_running)
      {
        _frameEvent!.WaitOne(200);
        if (!_running || _captureClient == null) break;

        while (true)
        {
          var hr = _captureClient.GetNextPacketSize(out var packetFrames);
          if (hr < 0 || packetFrames == 0) break;

          hr = _captureClient.GetBuffer(
            out var dataPtr,
            out var numFrames,
            out var flags,
            out _,
            out _);
          if (hr < 0) break;

          var bytes = (int)numFrames * bytesPerFrame;
          if (bytes > buffer.Length)
            buffer = new byte[bytes];

          if ((flags & AudioClientBufferFlags.Silent) != 0)
            Array.Clear(buffer, 0, bytes);
          else
            Marshal.Copy(dataPtr, buffer, 0, bytes);

          _captureClient.ReleaseBuffer(numFrames);
          DataAvailable?.Invoke(this, new WaveInEventArgs(buffer, bytes));
        }
      }
    }
    catch (Exception ex)
    {
      Console.Error.WriteLine($"Process loopback PID {_processId}: {ex.Message}");
    }
  }

  public void Dispose()
  {
    if (_disposed) return;
    _disposed = true;
    Stop();
    if (_captureClient != null)
    {
      Marshal.ReleaseComObject(_captureClient);
      _captureClient = null;
    }
    if (_audioClient != null)
    {
      Marshal.ReleaseComObject(_audioClient);
      _audioClient = null;
    }
    _frameEvent?.Dispose();
    _frameEvent = null;
  }
}

internal enum AudioClientActivationType : uint
{
  Default = 0,
  ProcessLoopback = 1,
}

internal enum ProcessLoopbackMode : uint
{
  IncludeTargetProcessTree = 0,
  ExcludeTargetProcessTree = 1,
}

[StructLayout(LayoutKind.Sequential)]
internal struct AudioClientProcessLoopbackParams
{
  public uint TargetProcessId;
  public ProcessLoopbackMode ProcessLoopbackMode;
}

[StructLayout(LayoutKind.Sequential)]
internal struct AudioClientActivationParams
{
  public AudioClientActivationType ActivationType;
  public AudioClientProcessLoopbackParams ProcessLoopbackParams;
}

[StructLayout(LayoutKind.Sequential)]
internal struct Blob
{
  public uint cbSize;
  public IntPtr pBlobData;
}

[StructLayout(LayoutKind.Explicit, Size = 24)]
internal struct PropVariant
{
  [FieldOffset(0)] public ushort vt;
  [FieldOffset(8)] public Blob blob;
}

[StructLayout(LayoutKind.Sequential)]
internal struct WaveFormatEx
{
  public ushort wFormatTag;
  public ushort nChannels;
  public uint nSamplesPerSec;
  public uint nAvgBytesPerSec;
  public ushort nBlockAlign;
  public ushort wBitsPerSample;
  public ushort cbSize;
}

internal enum AudioClientShareMode
{
  Shared = 0,
  Exclusive = 1,
}

[Flags]
internal enum AudioClientStreamFlags : uint
{
  None = 0,
  Loopback = 0x00020000,
  EventCallback = 0x00040000,
  AutoConvertPcm = 0x80000000,
  SrcDefaultQuality = 0x08000000,
}

[Flags]
internal enum AudioClientBufferFlags
{
  None = 0,
  Silent = 0x2,
}

[ComImport]
[Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioClient
{
  [PreserveSig] int Initialize(
    AudioClientShareMode shareMode,
    AudioClientStreamFlags streamFlags,
    long hnsBufferDuration,
    long hnsPeriodicity,
    IntPtr pFormat,
    IntPtr audioSessionGuid);

  [PreserveSig] int GetBufferSize(out uint bufferSize);
  [PreserveSig] int GetStreamLatency(out long latency);
  [PreserveSig] int GetCurrentPadding(out int currentPadding);
  [PreserveSig] int IsFormatSupported(AudioClientShareMode shareMode, IntPtr pFormat, out IntPtr closestMatch);
  [PreserveSig] int GetMixFormat(out IntPtr deviceFormat);
  [PreserveSig] int GetDevicePeriod(out long defaultPeriod, out long minimumPeriod);
  [PreserveSig] int Start();
  [PreserveSig] int Stop();
  [PreserveSig] int Reset();
  [PreserveSig] int SetEventHandle(IntPtr eventHandle);
  [PreserveSig] int GetService([In] ref Guid interfaceId, [MarshalAs(UnmanagedType.IUnknown)] out object? interfacePointer);
}

[ComImport]
[Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioCaptureClient
{
  [PreserveSig] int GetBuffer(
    out IntPtr data,
    out uint numFramesToRead,
    out AudioClientBufferFlags flags,
    out ulong devicePosition,
    out ulong qpcPosition);

  [PreserveSig] int ReleaseBuffer(uint numFramesRead);
  [PreserveSig] int GetNextPacketSize(out uint numFramesInNextPacket);
}

[ComImport]
[Guid("72A22D78-CDE4-431D-B8CC-843A71199B6D")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IActivateAudioInterfaceAsyncOperation
{
  [PreserveSig] int GetActivateResult(
    out int activateResult,
    [MarshalAs(UnmanagedType.IUnknown)] out object? activatedInterface);
}

[ComImport]
[Guid("41D949AB-986D-44AC-B2D6-5DB5AD598587")]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IActivateAudioInterfaceCompletionHandler
{
  void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation);
}

[ComVisible(true)]
internal sealed class ActivateCompletionHandler : IActivateAudioInterfaceCompletionHandler
{
  private readonly ManualResetEventSlim _done = new(false);
  public int ActivateResult { get; private set; } = unchecked((int)0x80004005);
  public IAudioClient? AudioClient { get; private set; }

  public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation activateOperation)
  {
    try
    {
      activateOperation.GetActivateResult(out var hr, out var iface);
      ActivateResult = hr;
      if (hr >= 0 && iface != null)
        AudioClient = (IAudioClient)iface;
    }
    catch (Exception ex)
    {
      ActivateResult = ex.HResult != 0 ? ex.HResult : unchecked((int)0x80004005);
    }
    finally
    {
      _done.Set();
    }
  }

  public void Wait(int timeoutMs)
  {
    if (!_done.Wait(timeoutMs))
      throw new TimeoutException("ActivateAudioInterfaceAsync Timeout");
  }
}

internal static class NativeMethods
{
  [DllImport("Mmdevapi.dll", ExactSpelling = true, PreserveSig = true)]
  public static extern int ActivateAudioInterfaceAsync(
    [In, MarshalAs(UnmanagedType.LPWStr)] string deviceInterfacePath,
    [In] ref Guid riid,
    IntPtr activationParams,
    [MarshalAs(UnmanagedType.Interface)] IActivateAudioInterfaceCompletionHandler completionHandler,
    out IActivateAudioInterfaceAsyncOperation activationOperation);
}
