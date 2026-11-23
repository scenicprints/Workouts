package com.scenicprints.workouts

import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads a new APK into the app's own cache and hands it to the package installer, so nothing
 * lands in Downloads. The cache is wiped on every launch, which removes the file once installed.
 */
@CapacitorPlugin(name = "Updater")
class UpdaterPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun load() {
        cleanup()
    }

    private fun updatesDir(): File = File(context.cacheDir, "updates").apply { mkdirs() }

    private fun cleanup() {
        updatesDir().listFiles()?.forEach { it.delete() }
    }

    @PluginMethod
    fun canInstall(call: PluginCall) {
        val ret = JSObject()
        ret.put("allowed", context.packageManager.canRequestPackageInstalls())
        call.resolve(ret)
    }

    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName))
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        call.resolve()
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url")
        if (url == null) {
            call.reject("url required")
            return
        }
        scope.launch {
            try {
                cleanup()
                val file = File(updatesDir(), "workouts.apk")
                var current = url
                var conn: HttpURLConnection
                var hops = 0
                // GitHub bounces from github.com to objects.githubusercontent.com; follow by hand so the
                // protocol change does not stop HttpURLConnection.
                while (true) {
                    conn = URL(current).openConnection() as HttpURLConnection
                    conn.instanceFollowRedirects = false
                    conn.setRequestProperty("Accept", "application/octet-stream")
                    conn.connect()
                    val code = conn.responseCode
                    if (code in 300..399 && hops < 5) {
                        val next = conn.getHeaderField("Location") ?: throw IllegalStateException("Redirect without location")
                        conn.disconnect()
                        current = next
                        hops++
                        continue
                    }
                    if (code !in 200..299) throw IllegalStateException("Download failed: HTTP $code")
                    break
                }
                conn.inputStream.use { input -> FileOutputStream(file).use { out -> input.copyTo(out) } }
                conn.disconnect()
                val uri = FileProvider.getUriForFile(context, context.packageName + ".fileprovider", file)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                context.startActivity(intent)
                val ret = JSObject()
                ret.put("bytes", file.length())
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject(e.message ?: "Update failed")
            }
        }
    }
}
