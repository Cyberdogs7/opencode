# OpenCode desktop installer overrides.
#
# Two electron-builder behaviours bite on Windows:
#
# 1. The stock "app is running" check asks Windows PowerShell for every process
#    whose image path starts with $INSTDIR, then kills them with a single
#    PowerShell pipeline. Helpers shipped inside $INSTDIR (the conpty
#    OpenConsole.exe, resources\elevate.exe, the forked sidecar utility process)
#    share the app's image path, and a stray in-place uninstaller holds its own
#    file open. The stock check finds those by path but kills by the app's image
#    name only, so it can loop forever on "$(appCannotBeClosed)".
#
# 2. That same loop leaves a stuck installer holding the single-instance mutex,
#    so later attempts silently abort or re-show the stuck window.
#
# Match the app image by name instead - no PowerShell, no WMI - and clear a
# stray in-place uninstaller before the uninstaller file is written. Killing by
# exact image name also takes the forked sidecar with it, and can never match
# this installer or its uninstaller.
#
# Note: the stock NSIS binary electron-builder ships is built without
# NSIS_CONFIG_LOG, so ENABLE_LOGGING_ELECTRON_BUILDER cannot be defined here.

!macro customCheckAppRunning
  !insertmacro OPENCODE_CHECK_APP_RUNNING_BY_NAME
!macroend

!macro OPENCODE_CHECK_APP_RUNNING_BY_NAME
  # A stray uninstaller running in place from $INSTDIR holds its own image open,
  # which makes the later uninstaller write fail with "Error opening file for
  # writing: ...\Uninstall <app>.exe". Clear it before doing anything else.
  nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /IM "Uninstall ${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
  Pop $R0

  # exit code 0 = a process with the app's image name exists
  nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
  Pop $R0
  ${if} $R0 != 0
    Goto opencode_app_check_done
  ${endif}

  ${IfNot} ${Silent}
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK opencode_app_check_kill
    Quit
  ${endif}

  opencode_app_check_kill:
    DetailPrint `Closing ${PRODUCT_NAME}.`
    nsExec::Exec `"$SYSDIR\cmd.exe" /C taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /FI "USERNAME eq %USERNAME%"`
    Pop $R0
    Sleep 1500

    nsExec::Exec `"$SYSDIR\cmd.exe" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R0
    ${if} $R0 == 0
      DetailPrint `Waiting for ${PRODUCT_NAME} to close.`
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY opencode_app_check_kill
      Quit
    ${endif}

  opencode_app_check_done:
!macroend
